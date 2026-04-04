'use strict';

const cron = require('node-cron');
const { sendMessage, sendToGroup } = require('../whatsapp');
const { generateCobrosMessage } = require('../claude');
const { getClientesByEstado, marcarAtrasados, resetearEstadoClientes } = require('../handlers/cobros');
const { currentMonthLabel, formatARS } = require('../utils/formatter');
const logger = require('../utils/logger');

/**
 * DÍA 1 — 9:00 AM
 * Resetea estados y envía recordatorios iniciales a todos los clientes activos.
 */
async function jobDia1() {
  logger.info('CRON', 'Ejecutando job DÍA 1 — cobros');
  const mes = currentMonthLabel();

  try {
    // Resetear todos los clientes a PENDIENTE
    await resetearEstadoClientes();

    // Leer clientes activos
    const { readSheetAsObjects } = require('../sheets');
    const clientes = await readSheetAsObjects('CLIENTES');
    const activos = clientes.filter(c => (c['Activo?'] || '').toUpperCase().startsWith('S'));

    for (const cliente of activos) {
      const wa = cliente['WhatsApp'];
      if (!wa) continue;

      const nombre = cliente['Cliente'];
      const monto = cliente['Monto Mensual'];
      const vto = cliente['Vto. Día'] || '10';
      const factura = (cliente['Factura?'] || '').toUpperCase().startsWith('S');

      try {
        const msg = await generateCobrosMessage(nombre, mes, monto, vto, 'inicial');
        await sendMessage(wa, msg);
        logger.success('CRON', `Recordatorio día 1 enviado a ${nombre}`);
      } catch (err) {
        logger.error('CRON', `Error enviando a ${nombre}`, { err: err.message });
      }

      // Pausa entre mensajes para no saturar la API
      await new Promise(r => setTimeout(r, 1500));
    }

    await sendToGroup(`📋 Recordatorios de ${mes} enviados a ${activos.length} clientes.`);
  } catch (err) {
    logger.error('CRON', 'Error en job DÍA 1', { err: err.message });
  }
}

/**
 * DÍA 5 — 9:00 AM
 * Envía recordatorio a clientes PENDIENTE.
 */
async function jobDia5() {
  logger.info('CRON', 'Ejecutando job DÍA 5 — recordatorio cobros');
  const mes = currentMonthLabel();

  try {
    const pendientes = await getClientesByEstado('PENDIENTE');

    for (const cliente of pendientes) {
      const wa = cliente['WhatsApp'];
      if (!wa) continue;

      const nombre = cliente['Cliente'];
      const monto = cliente['Monto Mensual'];
      const vto = cliente['Vto. Día'] || '10';

      const msg = `Hola ${nombre}, te mandamos un recordatorio del pago de ${mes} 🙌\n\n⏰ Monto: ${formatARS(monto)} — vence el día ${vto}.\n\n¿Ya realizaste la transferencia? Avisanos así lo registramos.`;

      try {
        await sendMessage(wa, msg);
        logger.success('CRON', `Recordatorio día 5 enviado a ${nombre}`);
      } catch (err) {
        logger.error('CRON', `Error enviando a ${nombre}`, { err: err.message });
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    await sendToGroup(`⏰ Recordatorio día 5: ${pendientes.length} clientes pendientes de pago.`);
  } catch (err) {
    logger.error('CRON', 'Error en job DÍA 5', { err: err.message });
  }
}

/**
 * DÍA 10 — 9:00 AM
 * Marca atrasados y envía mensaje de vencimiento.
 */
async function jobDia10() {
  logger.info('CRON', 'Ejecutando job DÍA 10 — vencimiento cobros');
  const mes = currentMonthLabel();

  try {
    const pendientesAntes = await getClientesByEstado('PENDIENTE');

    // Marcar todos como ATRASADO
    await marcarAtrasados();

    for (const cliente of pendientesAntes) {
      const wa = cliente['WhatsApp'];
      if (!wa) continue;

      const nombre = cliente['Cliente'];
      const monto = cliente['Monto Mensual'];

      const msg = `Hola ${nombre}, el pago de ${mes} (${formatARS(monto)}) vence hoy.\n\n🔴 Para mantener el servicio activo necesitamos regularizar el pago hoy.\n\nSi ya lo hiciste, por favor envianos el comprobante. Gracias.`;

      try {
        await sendMessage(wa, msg);
      } catch (err) {
        logger.error('CRON', `Error enviando a ${nombre}`, { err: err.message });
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    const morosos = pendientesAntes.map(c => c['Cliente']).join(', ') || 'ninguno';
    await sendToGroup(`🔴 Vencimiento ${mes}: clientes sin pagar: ${morosos}`);
  } catch (err) {
    logger.error('CRON', 'Error en job DÍA 10', { err: err.message });
  }
}

/**
 * DÍA 15 — 9:00 AM
 * Aviso final a atrasados, notificación al grupo para acción manual.
 */
async function jobDia15() {
  logger.info('CRON', 'Ejecutando job DÍA 15 — aviso final cobros');
  const mes = currentMonthLabel();

  try {
    const atrasados = await getClientesByEstado('ATRASADO');

    for (const cliente of atrasados) {
      const wa = cliente['WhatsApp'];
      if (!wa) continue;

      const nombre = cliente['Cliente'];
      const monto = cliente['Monto Mensual'];

      const msg = `Hola ${nombre}, tu pago de ${mes} (${formatARS(monto)}) está atrasado.\n\n❗ Para evitar la suspensión del servicio, por favor regularizá el pago a la brevedad y envianos el comprobante.`;

      try {
        await sendMessage(wa, msg);
      } catch (err) {
        logger.error('CRON', `Error enviando a ${nombre}`, { err: err.message });
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    if (atrasados.length > 0) {
      const lista = atrasados.map(c => `• ${c['Cliente']} (${formatARS(c['Monto Mensual'])})`).join('\n');
      await sendToGroup(`🚨 Acción manual requerida — clientes sin pagar al día 15 de ${mes}:\n${lista}`);
    }
  } catch (err) {
    logger.error('CRON', 'Error en job DÍA 15', { err: err.message });
  }
}

/**
 * Registra todos los cron jobs de cobros.
 */
function registerCobrosJobs() {
  // Día 1 a las 9:00 AM
  cron.schedule('0 9 1 * *', jobDia1, { timezone: 'America/Argentina/Buenos_Aires' });

  // Día 5 a las 9:00 AM
  cron.schedule('0 9 5 * *', jobDia5, { timezone: 'America/Argentina/Buenos_Aires' });

  // Día 10 a las 9:00 AM
  cron.schedule('0 9 10 * *', jobDia10, { timezone: 'America/Argentina/Buenos_Aires' });

  // Día 15 a las 9:00 AM
  cron.schedule('0 9 15 * *', jobDia15, { timezone: 'America/Argentina/Buenos_Aires' });

  logger.info('CRON', 'Jobs de cobros registrados (días 1, 5, 10, 15)');
}

module.exports = { registerCobrosJobs, jobDia1, jobDia5, jobDia10, jobDia15 };
