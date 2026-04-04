'use strict';

require('dotenv').config();

const express = require('express');
const { connectToWhatsApp, extractMessageText, extractSenderAndChat, sendToGroup } = require('./src/whatsapp');
const { interpretMessage, clearHistory } = require('./src/claude');
const { reloadContext } = require('./src/context');
const { parseClaudeResponse, validateParsed } = require('./src/utils/parser');
const { registerCobrosJobs } = require('./src/cron/cobros-auto');
const { registerCierreMesJob } = require('./src/cron/cierre-mes');
const logger = require('./src/utils/logger');

// Handlers
const { handleGasto } = require('./src/handlers/gastos');
const { handleCobro } = require('./src/handlers/cobros');
const { handleTarifa } = require('./src/handlers/tarifas');
const { handleAltaEmpleado, handleBajaEmpleado, handleAumentoEmpleado } = require('./src/handlers/empleados');
const { handleAltaHerramienta, handleBajaHerramienta } = require('./src/handlers/herramientas');
const { handleConsulta, handleAjusteCaja } = require('./src/handlers/consultas');
const { handleSueldo } = require('./src/handlers/sueldos');

const app = express();
app.use(express.json());

// ─── Estado de confirmaciones pendientes ─────────────────────────────────────
const pendingConfirmations = new Map();
const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), bot: 'Hernán — Pinta Bot' });
});

// ─── Handler principal de mensajes ───────────────────────────────────────────
async function handleWhatsAppMessage(msg) {
  const { from, sender } = extractSenderAndChat(msg);
  const text = extractMessageText(msg);

  if (!text || !text.trim()) return;

  // Solo responder al grupo configurado
  const groupId = process.env.WHATSAPP_GROUP_ID;
  if (groupId && groupId !== 'PENDIENTE' && from !== groupId) return;

  logger.info('WEBHOOK', 'Mensaje recibido del grupo', { preview: text.slice(0, 80) });

  // ─── Comando: actualizate ──────────────────────────────────────────────────
  const textLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (textLower.includes('hernan') && (textLower.includes('actualizate') || textLower.includes('actualiza') || textLower.includes('recarga'))) {
    await sendToGroup('🔄 Recargando contexto desde el sheet...');
    await reloadContext();
    await sendToGroup('✅ Listo, ya estoy actualizado con los últimos cambios del sheet.');
    return;
  }

  // ─── Verificar confirmación pendiente ─────────────────────────────────────
  if (pendingConfirmations.has(from)) {
    const { parsed, expiresAt } = pendingConfirmations.get(from);

    if (Date.now() > expiresAt) {
      pendingConfirmations.delete(from);
    } else {
      const respuesta = text.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (['SI', 'S', 'YES', 'OK', 'DALE', 'VA', 'CONFIRMO'].includes(respuesta)) {
        pendingConfirmations.delete(from);
        await executeAction(parsed, from);
        return;
      } else if (['NO', 'N', 'CANCEL', 'CANCELAR', 'NEG'].includes(respuesta)) {
        pendingConfirmations.delete(from);
        await sendToGroup('❌ Acción cancelada.');
        return;
      }
      // Si no es confirmación, procesarlo como mensaje nuevo
    }
  }

  // ─── Interpretar con Claude (con historial) ────────────────────────────────
  let rawResponse;
  try {
    rawResponse = await interpretMessage(text, from);
  } catch (err) {
    logger.error('WEBHOOK', 'Error llamando a Claude', { err: err.message });
    await sendToGroup('❌ No pude procesar eso. ¿Podés repetirlo?');
    return;
  }

  // ─── Parsear JSON ──────────────────────────────────────────────────────────
  let parsed = parseClaudeResponse(rawResponse);

  if (!parsed || !validateParsed(parsed)) {
    logger.warn('WEBHOOK', 'Parse fallido, reintentando');
    try {
      const rawRetry = await interpretMessage(`Respondé SOLO con JSON válido sin texto adicional. Mensaje: ${text}`, from);
      parsed = parseClaudeResponse(rawRetry);
    } catch (_) {}
  }

  if (!parsed || !validateParsed(parsed)) {
    await sendToGroup('❌ No pude procesar eso. ¿Podés repetirlo?');
    return;
  }

  // ─── Acción con confirmación ───────────────────────────────────────────────
  if (parsed.necesita_confirmacion) {
    pendingConfirmations.set(from, {
      parsed,
      expiresAt: Date.now() + CONFIRMATION_TIMEOUT_MS,
    });
    await sendToGroup(`${parsed.confirmacion}\n\n¿Confirmás? Respondé *SÍ* o *NO* (expira en 5 min)`);
    return;
  }

  // ─── Ejecutar directamente ─────────────────────────────────────────────────
  await executeAction(parsed, from);
}

// ─── Dispatcher de acciones ───────────────────────────────────────────────────
async function executeAction(parsed, from) {
  const { accion, datos, confirmacion } = parsed;

  try {
    switch (accion) {
      case 'GASTO':
        await handleGasto(datos);
        await sendToGroup(confirmacion);
        break;

      case 'COBRO':
        await handleCobro(datos);
        await sendToGroup(confirmacion);
        break;

      case 'TARIFA':
        await handleTarifa(datos);
        await sendToGroup(confirmacion);
        break;

      case 'ALTA_EMPLEADO':
        await handleAltaEmpleado(datos);
        await sendToGroup(confirmacion);
        break;

      case 'BAJA_EMPLEADO':
        await handleBajaEmpleado(datos);
        await sendToGroup(confirmacion);
        break;

      case 'ALTA_HERRAMIENTA':
        await handleAltaHerramienta(datos);
        await sendToGroup(confirmacion);
        break;

      case 'BAJA_HERRAMIENTA':
        await handleBajaHerramienta(datos);
        await sendToGroup(confirmacion);
        break;

      case 'SUELDO': {
        if (!datos.nombre) { await sendToGroup('❓ ¿De quién es el sueldo?'); break; }
        const result = await handleSueldo(datos.nombre, datos.whatsapp || null, datos.detalle || null);
        await sendToGroup(result.liberado ? confirmacion : `⚠️ ${result.razon || 'No se pudo registrar el sueldo.'}`);
        break;
      }

      case 'SUELDO_MULTIPLE': {
        const sueldos = datos.sueldos || [];
        const resultados = [];
        for (const s of sueldos) {
          const r = await handleSueldo(s.nombre, null, `Sueldo ${datos.mes || ''}`);
          resultados.push(`${s.nombre}: ${r.liberado ? '✅' : '⚠️ ' + (r.razon || 'error')}`);
        }
        await sendToGroup(`${confirmacion}\n${resultados.join('\n')}`);
        break;
      }

      case 'CONSULTA': {
        const { resumen } = await handleConsulta(datos);
        await sendToGroup(resumen);
        break;
      }

      case 'AJUSTE_CAJA': {
        await handleAjusteCaja(datos);
        await sendToGroup(confirmacion);
        break;
      }

      case 'DUDA':
        await sendToGroup(confirmacion);
        break;

      default:
        logger.warn('WEBHOOK', `Acción desconocida: ${accion}`);
        await sendToGroup(`❓ Acción no reconocida: ${accion}`);
    }

    logger.success('WEBHOOK', `Acción ejecutada: ${accion}`);
  } catch (err) {
    logger.error('WEBHOOK', `Error ejecutando ${accion}`, { err: err.message });
    await sendToGroup(`❌ Error procesando ${accion}.\nDetalle: ${err.message}`);
  }
}

// ─── Arranque ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info('SERVER', `Hernán Bot iniciado en puerto ${PORT}`);
  registerCierreMesJob();
  registerCobrosJobs();
  logger.info('SERVER', 'Cron jobs registrados ✅');
});

connectToWhatsApp(handleWhatsAppMessage).catch(err => {
  logger.error('SERVER', 'Error conectando a WhatsApp', { err: err.message });
});

module.exports = app;
