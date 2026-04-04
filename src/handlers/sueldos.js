'use strict';

const sheets = require('../sheets');
const { sendMessage, sendToGroup } = require('../whatsapp');
const { todayISO, currentMonthLabel, nextCorrelativeId, formatARS } = require('../utils/formatter');
const { liberarPago, marcarFacturaRecibida } = require('./empleados');
const logger = require('../utils/logger');

/**
 * Procesa la liberación de un pago de sueldo.
 * Se llama cuando el equipo sube un comprobante de pago en el grupo.
 *
 * @param {string} nombreEmpleado - Nombre identificado por Claude
 * @param {string|null} whatsappEmpleado - Número WA del empleado (si disponible)
 * @param {string|null} comprobanteCaption - Caption/descripción del comprobante
 */
async function handleSueldo(nombreEmpleado, whatsappEmpleado, comprobanteCaption) {
  const mes = currentMonthLabel();

  logger.info('SUELDOS', 'Procesando sueldo', { nombreEmpleado, mes });

  // 1. Verificar si puede cobrar
  const { liberado, razon } = await liberarPago(nombreEmpleado, mes);

  if (!liberado) {
    // No se puede liberar aún
    if (razon === 'Factura pendiente') {
      // Buscar número de WA del empleado
      const allRows = await sheets.readSheet('EMPLEADOS');
      let waNum = null;
      let monto = null;
      for (const row of allRows.slice(1)) {
        if ((row[1] || '').toLowerCase().includes(nombreEmpleado.toLowerCase())) {
          waNum = row[2];
          monto = row[4];
          break;
        }
      }

      // Notificar al grupo
      await sendToGroup(`⚠️ No se puede liberar pago de *${nombreEmpleado}* — factura de ${mes} pendiente.`);

      // Notificar al empleado si tiene WA
      if (waNum) {
        await sendMessage(waNum,
          `⚠️ Hola ${nombreEmpleado}, necesitamos la factura de ${mes} para procesar tu pago (${formatARS(monto)}).\n\nPor favor enviala hoy al grupo de administración.`
        );
      }

      logger.warn('SUELDOS', `Pago NO liberado: ${nombreEmpleado} — factura pendiente`);
      return { liberado: false, razon };
    }

    logger.warn('SUELDOS', `Pago NO liberado: ${nombreEmpleado}`, { razon });
    return { liberado: false, razon };
  }

  // 2. Pago liberado — obtener datos del empleado
  const allRows = await sheets.readSheet('EMPLEADOS');
  let empleadoRow = null;
  for (const row of allRows.slice(1)) {
    if ((row[1] || '').toLowerCase().includes(nombreEmpleado.toLowerCase())) {
      empleadoRow = row;
      break;
    }
  }

  const monto = empleadoRow ? parseFloat(empleadoRow[4]) || 0 : 0;
  const waEmpleado = whatsappEmpleado || (empleadoRow ? empleadoRow[2] : null);

  // 3. Enviar comprobante al empleado por WA (si tiene número)
  if (waEmpleado) {
    const mensaje = comprobanteCaption
      ? `✅ Hola ${nombreEmpleado}! Tu sueldo de ${mes} (${formatARS(monto)}) fue acreditado. Detalle: ${comprobanteCaption}`
      : `✅ Hola ${nombreEmpleado}! Tu sueldo de ${mes} (${formatARS(monto)}) fue acreditado.`;

    await sendMessage(waEmpleado, mensaje);
  }

  // 4. Generar asiento contable
  const saldoAnterior = await sheets.getLastBalance();
  const saldoNuevo = saldoAnterior - monto;

  const lastAsientoId = await sheets.getLastId('ASIENTO_CONTABLE');
  const asientoId = nextCorrelativeId('A', 4, lastAsientoId);

  await sheets.appendRow('ASIENTO_CONTABLE', [
    asientoId,
    todayISO(),
    'EGRESO_EQUIPO',
    'Sueldos y Honorarios',
    `Sueldo ${nombreEmpleado} — ${mes}`,
    0,
    monto,
    saldoNuevo,
    `SUELDO-${nombreEmpleado.replace(/\s/g, '')}-${mes}`,
    'Equipo',
  ]);

  logger.success('SUELDOS', `Sueldo liberado: ${nombreEmpleado}`, { monto });
  return { liberado: true, monto, saldoNuevo };
}

/**
 * Procesa la recepción de una factura de un empleado.
 */
async function handleFacturaRecibida(nombreEmpleado) {
  const ok = await marcarFacturaRecibida(nombreEmpleado, todayISO());
  if (ok) {
    logger.success('SUELDOS', `Factura recibida: ${nombreEmpleado}`);
    return { ok: true };
  }
  logger.warn('SUELDOS', `Empleado no encontrado: ${nombreEmpleado}`);
  return { ok: false };
}

module.exports = { handleSueldo, handleFacturaRecibida };
