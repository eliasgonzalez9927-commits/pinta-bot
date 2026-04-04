'use strict';

const sheets = require('../sheets');
const { todayISO, currentMonthLabel, nextCorrelativeId, variationPct } = require('../utils/formatter');
const logger = require('../utils/logger');

/**
 * Da de alta un empleado nuevo.
 */
async function handleAltaEmpleado(datos) {
  const { nombre, rol, tipo, monto, desde_mes } = datos;
  const mes = currentMonthLabel();

  logger.info('EMPLEADOS', 'Alta empleado', { nombre, rol, monto });

  // EMPLEADOS: ID | Nombre | WhatsApp | Tipo | Monto | Factura Enviada? | Fecha Factura | Pago Liberado? | Fecha Pago | Mes | Observaciones
  const lastId = await sheets.getLastId('EMPLEADOS');
  const id = nextCorrelativeId('E', 3, lastId);

  await sheets.appendRow('EMPLEADOS', [
    id,
    nombre,
    '',
    tipo || 'No factura',
    monto,
    'PENDIENTE',
    '',
    'NO',
    '',
    mes,
    `Alta desde ${desde_mes || mes}`,
  ]);

  // EMPLEADOS_HISTORIAL: ID | Fecha | Empleado | Tipo Cambio | Rol | Sueldo Anterior | Sueldo Nuevo | Diferencia | Var. % | Desde Mes | Motivo
  const lastHId = await sheets.getLastId('EMPLEADOS_HISTORIAL');
  const hId = nextCorrelativeId('EM', 3, lastHId);

  await sheets.appendRow('EMPLEADOS_HISTORIAL', [
    hId,
    todayISO(),
    nombre,
    'ALTA',
    rol,
    0,
    monto,
    monto,
    '—',
    desde_mes || mes,
    'Alta nueva',
  ]);

  logger.success('EMPLEADOS', `Alta: ${nombre}`, { id });
  return { id };
}

/**
 * Da de baja un empleado.
 */
async function handleBajaEmpleado(datos) {
  const { nombre, desde_mes, motivo } = datos;
  const mes = currentMonthLabel();

  logger.info('EMPLEADOS', 'Baja empleado', { nombre });

  // Buscar y actualizar en EMPLEADOS (columna K = Observaciones, agregar nota de baja)
  const allRows = await sheets.readSheet('EMPLEADOS');
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if ((row[1] || '').toLowerCase().includes(nombre.toLowerCase())) {
      await sheets.updateRowBySearch('EMPLEADOS', 1, row[1], {
        K: `BAJA desde ${desde_mes || mes} — ${motivo || ''}`,
      });
      break;
    }
  }

  const lastHId = await sheets.getLastId('EMPLEADOS_HISTORIAL');
  const hId = nextCorrelativeId('EM', 3, lastHId);

  await sheets.appendRow('EMPLEADOS_HISTORIAL', [
    hId,
    todayISO(),
    nombre,
    'BAJA',
    '',
    '',
    '',
    '',
    '—',
    desde_mes || mes,
    motivo || 'Sin especificar',
  ]);

  logger.success('EMPLEADOS', `Baja: ${nombre}`);
  return { hId };
}

/**
 * Registra un aumento de sueldo.
 */
async function handleAumentoEmpleado(datos) {
  const { nombre, monto_anterior, monto_nuevo, desde_mes } = datos;
  const mes = currentMonthLabel();
  const diff = monto_nuevo - monto_anterior;
  const pct = variationPct(monto_anterior, monto_nuevo);

  logger.info('EMPLEADOS', 'Aumento empleado', { nombre, monto_nuevo });

  const allRows = await sheets.readSheet('EMPLEADOS');
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if ((row[1] || '').toLowerCase().includes(nombre.toLowerCase())) {
      // Columna E = Monto
      await sheets.updateRowBySearch('EMPLEADOS', 1, row[1], { E: monto_nuevo });
      break;
    }
  }

  const lastHId = await sheets.getLastId('EMPLEADOS_HISTORIAL');
  const hId = nextCorrelativeId('EM', 3, lastHId);

  await sheets.appendRow('EMPLEADOS_HISTORIAL', [
    hId,
    todayISO(),
    nombre,
    'AUMENTO',
    '',
    monto_anterior,
    monto_nuevo,
    diff,
    `${pct}%`,
    desde_mes || mes,
    'Actualización salarial',
  ]);

  logger.success('EMPLEADOS', `Aumento ${nombre}: ${monto_nuevo}`, { pct });
  return { hId, diff, pct };
}

/**
 * Libera el pago de un empleado si cumple los requisitos.
 */
async function liberarPago(nombre, mes) {
  const allRows = await sheets.readSheet('EMPLEADOS');
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if ((row[1] || '').toLowerCase().includes(nombre.toLowerCase())) {
      const factura = (row[3] || '').toLowerCase();
      const facturaEnviada = (row[5] || '').toUpperCase();

      // Si factura y aún no envió: NO liberar
      if (factura.includes('factura') && facturaEnviada !== 'SÍ' && facturaEnviada !== 'SI') {
        return { liberado: false, razon: 'Factura pendiente' };
      }

      await sheets.updateRowBySearch('EMPLEADOS', 1, row[1], {
        H: 'SÍ',
        I: todayISO(),
        J: mes,
      });
      return { liberado: true };
    }
  }
  return { liberado: false, razon: 'Empleado no encontrado' };
}

/**
 * Marca la factura de un empleado como recibida.
 */
async function marcarFacturaRecibida(nombre, fecha) {
  const allRows = await sheets.readSheet('EMPLEADOS');
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if ((row[1] || '').toLowerCase().includes(nombre.toLowerCase())) {
      await sheets.updateRowBySearch('EMPLEADOS', 1, row[1], {
        F: 'SÍ',
        G: fecha || todayISO(),
      });
      return true;
    }
  }
  return false;
}

module.exports = { handleAltaEmpleado, handleBajaEmpleado, handleAumentoEmpleado, liberarPago, marcarFacturaRecibida };
