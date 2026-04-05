'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const logger = require('./utils/logger');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info_baileys');

/**
 * Si existe BAILEYS_AUTH_B64 en env, restaura la sesión desde esa variable.
 * Esto permite correr en Railway sin escanear QR en cada restart.
 */
function restoreAuthFromEnv() {
  const b64 = process.env.BAILEYS_AUTH_B64;
  if (!b64) return;
  if (!require('fs').existsSync(AUTH_DIR)) {
    require('fs').mkdirSync(AUTH_DIR, { recursive: true });
  }
  try {
    const files = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    for (const [name, content] of Object.entries(files)) {
      const dest = path.join(AUTH_DIR, name);
      if (!require('fs').existsSync(dest)) {
        require('fs').writeFileSync(dest, content, 'utf8');
      }
    }
    logger.info('WHATSAPP', 'Sesión restaurada desde BAILEYS_AUTH_B64');
  } catch (e) {
    logger.warn('WHATSAPP', 'No se pudo restaurar sesión desde env: ' + e.message);
  }
}

let _sock = null;

/**
 * Inicia la conexión a WhatsApp via Baileys.
 * onMessage(msg) se llama por cada mensaje entrante.
 */
async function connectToWhatsApp(onMessage) {
  restoreAuthFromEnv();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Pinta Bot', 'Chrome', '1.0.0'],
  });

  _sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
      console.log('\n=== ESCANEAR QR DE WHATSAPP ===');
      console.log('Abrí este link en el navegador y escaneá el QR con WhatsApp → Dispositivos vinculados:');
      console.log(url);
      console.log('================================\n');
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      logger.warn('WHATSAPP', `Conexión cerrada (código ${code})`);
      if (loggedOut) {
        logger.error('WHATSAPP', 'Sesión cerrada. Borrá la carpeta auth_info_baileys/ y reiniciá el bot.');
      } else {
        logger.info('WHATSAPP', 'Reconectando...');
        await connectToWhatsApp(onMessage);
      }
    } else if (connection === 'open') {
      logger.info('WHATSAPP', 'Conectado a WhatsApp ✅');
      setTimeout(() => printGroups(sock), 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;
      try {
        await onMessage(msg);
      } catch (err) {
        logger.error('WHATSAPP', 'Error en onMessage: ' + err.message);
      }
    }
  });

  return sock;
}

/**
 * Imprime todos los grupos en la terminal para identificar el GROUP_ID.
 */
async function printGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.entries(groups);
    if (list.length === 0) {
      logger.info('WHATSAPP', 'No se encontraron grupos.');
      return;
    }
    console.log('\n─── Grupos de WhatsApp disponibles ───');
    list.forEach(([id, g]) => console.log(`  ${id}  →  ${g.subject}`));
    console.log('──────────────────────────────────────');
    console.log('Copiá el ID del grupo admin y pegalo en WHATSAPP_GROUP_ID del .env\n');
  } catch (_) {}
}

/**
 * Envía un mensaje de texto al grupo configurado.
 */
async function sendToGroup(text) {
  const groupId = process.env.WHATSAPP_GROUP_ID;
  if (!groupId || groupId === 'PENDIENTE') {
    logger.warn('WHATSAPP', 'WHATSAPP_GROUP_ID no configurado — mostrando en consola');
    console.log('[BOT MSG]', text);
    return;
  }
  if (!_sock) {
    logger.error('WHATSAPP', 'Socket no disponible');
    return;
  }
  await _sock.sendMessage(groupId, { text });
}

/**
 * Extrae el texto de un mensaje de Baileys.
 */
function extractMessageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''
  );
}

/**
 * Extrae el remoteJid (grupo/chat) y el sender (participante).
 */
function extractSenderAndChat(msg) {
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  return { from, sender };
}

module.exports = { connectToWhatsApp, sendToGroup, extractMessageText, extractSenderAndChat };
