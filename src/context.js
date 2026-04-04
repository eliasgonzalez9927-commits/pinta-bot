'use strict';

const sheets = require('./sheets');
const logger = require('./utils/logger');

// Cache del contexto
let _cache = null;
let _loadedAt = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Carga y devuelve el contexto dinámico desde el sheet.
 * Usa caché para no consultar el sheet en cada mensaje.
 */
async function loadContext(force = false) {
  const now = Date.now();
  if (!force && _cache && _loadedAt && (now - _loadedAt) < CACHE_TTL_MS) {
    return _cache;
  }

  logger.info('CONTEXT', 'Cargando contexto desde el sheet...');

  try {
    const [empleados, clientes, notas] = await Promise.all([
      loadEmpleados(),
      loadClientes(),
      loadNotas(),
    ]);

    _cache = buildContextString(empleados, clientes, notas);
    _loadedAt = now;

    logger.success('CONTEXT', `Contexto cargado — ${empleados.length} empleados, ${clientes.length} clientes, ${notas.length} notas`);
    return _cache;
  } catch (err) {
    logger.error('CONTEXT', 'Error cargando contexto', { err: err.message });
    // Si falla, devuelve el cache anterior o string vacío
    return _cache || '';
  }
}

/**
 * Fuerza recarga inmediata del contexto.
 */
async function reloadContext() {
  return loadContext(true);
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

async function loadEmpleados() {
  const rows = await sheets.readSheetAsObjects('EMPLEADOS');
  return rows.filter(e => {
    const nombre = (e['Nombre'] || '').trim();
    const obs = (e['Observaciones'] || '').toUpperCase();
    return nombre && !obs.includes('BAJA');
  });
}

async function loadClientes() {
  const rows = await sheets.readSheetAsObjects('CLIENTES');
  return rows.filter(c => {
    const nombre = (c['Cliente'] || '').trim();
    const activo = (c['Activo?'] || '').toUpperCase();
    return nombre && activo.startsWith('S');
  });
}

async function loadNotas() {
  try {
    // NOTAS no está en ALLOWED_SHEETS de sheets.js, así que leemos directo
    const { google } = require('googleapis');
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const client = await auth.getClient();
    const api = google.sheets({ version: 'v4', auth: client });
    const resp = await api.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'NOTAS' });
    const rows = resp.data.values || [];
    if (rows.length < 2) return [];
    return rows.slice(1).filter(r => r[1]).map(r => `[${r[0] || ''}] ${r[1]}`);
  } catch (_) {
    return [];
  }
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function formatARS(val) {
  const n = parseFloat(String(val || '0').replace(/\./g, '').replace(',', '.')) || 0;
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function buildContextString(empleados, clientes, notas) {
  const lines = [];

  // CLIENTES
  lines.push('CLIENTES ACTIVOS Y SUS TARIFAS:');
  for (const c of clientes) {
    const id      = c['ID'] || '?';
    const nombre  = c['Cliente'] || '?';
    const monto   = formatARS(c['Monto Mensual']);
    const factura = (c['Factura?'] || 'NO').toUpperCase().startsWith('S') ? 'Sí factura' : 'No factura';
    const vto     = c['Vto. Día'] ? `Vto día ${c['Vto. Día']}` : '';
    const tel     = c['WhatsApp'] ? `Tel: ${c['WhatsApp']}` : '';
    lines.push(`- ${id} | ${nombre} | ${monto}/mes | ${factura}${vto ? ' | ' + vto : ''}${tel ? ' | ' + tel : ''}`);
  }

  lines.push('');

  // EMPLEADOS
  lines.push('EQUIPO ACTIVO:');
  for (const e of empleados) {
    const id      = e['ID'] || '?';
    const nombre  = e['Nombre'] || '?';
    const tipo    = e['Tipo'] || '';
    const monto   = formatARS(e['Monto']);
    const factura = tipo.toLowerCase().includes('factura') ? 'Sí factura' : 'No factura';
    const tel     = e['WhatsApp'] ? `Tel: ${e['WhatsApp']}` : '';
    lines.push(`- ${id} | ${nombre} | ${tipo} | ${monto}/mes | ${factura}${tel ? ' | ' + tel : ''}`);
  }

  // NOTAS
  if (notas.length > 0) {
    lines.push('');
    lines.push('NOTAS Y CONTEXTO ADICIONAL (del sheet):');
    for (const n of notas) lines.push(`- ${n}`);
  }

  return lines.join('\n');
}

module.exports = { loadContext, reloadContext };
