'use strict';

const sheets = require('../sheets');
const { formatARS, currentMonthLabel, todayISO } = require('../utils/formatter');
const logger = require('../utils/logger');

/**
 * Resuelve una consulta según el tipo.
 */
async function handleConsulta(datos) {
  const tipo = (datos?.tipo || 'CAJA').toUpperCase();

  if (tipo === 'EQUIPO') return consultaEquipo();
  if (tipo === 'COBROS') return consultaCobros();
  return consultaCaja();
}

/**
 * Resumen de caja del mes actual.
 */
async function consultaCaja() {
  const mes = currentMonthLabel();
  logger.info('CONSULTAS', 'Consultando caja', { tipo: 'CAJA' });

  const saldo = await sheets.getLastBalance();

  const asientos = await sheets.readSheetAsObjects('ASIENTO_CONTABLE');
  const now = new Date();
  const mesNum = String(now.getMonth() + 1).padStart(2, '0');
  const anio = now.getFullYear();

  let totalIngresos = 0;
  let totalEgresos = 0;

  for (const a of asientos) {
    const fecha = a['Fecha'] || '';
    if (!fecha.startsWith(`${anio}-${mesNum}`)) continue;
    const debe = parseFloat(String(a['DEBE'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
    const haber = parseFloat(String(a['HABER'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
    totalIngresos += debe;
    totalEgresos += haber;
  }

  const resultado = totalIngresos - totalEgresos;

  const clientes = await sheets.readSheetAsObjects('CLIENTES');
  const pendientes = clientes.filter(c =>
    (c['Estado Mes Actual'] || '').toUpperCase() === 'PENDIENTE' &&
    (c['Activo?'] || '').toUpperCase().startsWith('S')
  );

  const resumen =
    `💰 *CAJA ${mes}*\n` +
    `Ingresos: ${formatARS(totalIngresos)}\n` +
    `Egresos: ${formatARS(totalEgresos)}\n` +
    `Resultado: ${formatARS(resultado)}\n` +
    `Saldo actual: ${formatARS(saldo)}\n` +
    (pendientes.length > 0
      ? `⏳ Pendientes: ${pendientes.map(c => c['Cliente']).join(', ')}`
      : '✅ Todos los clientes pagaron');

  logger.success('CONSULTAS', 'Consulta de caja completada', { saldo, totalIngresos, totalEgresos });
  return { resumen, saldo, totalIngresos, totalEgresos, resultado };
}

/**
 * Lista de empleados activos.
 */
async function consultaEquipo() {
  logger.info('CONSULTAS', 'Consultando equipo');

  const empleados = await sheets.readSheetAsObjects('EMPLEADOS');

  // Filtrar activos (sin nota de BAJA en observaciones)
  const activos = empleados.filter(e => {
    const obs = (e['Observaciones'] || '').toUpperCase();
    return !obs.includes('BAJA');
  });

  if (activos.length === 0) {
    return { resumen: '👥 No hay empleados activos registrados.' };
  }

  const lineas = activos.map(e => {
    const nombre = e['Nombre'] || '?';
    const tipo = e['Tipo'] || '';
    const monto = formatARS(e['Monto'] || 0);
    const factura = tipo.toLowerCase().includes('factura') ? '📄' : '';
    return `• ${nombre} — ${monto}/mes ${factura}`;
  });

  const resumen = `👥 *EQUIPO ACTIVO (${activos.length})*\n` + lineas.join('\n');

  logger.success('CONSULTAS', 'Consulta de equipo completada', { total: activos.length });
  return { resumen };
}

/**
 * Estado de cobros del mes actual.
 */
async function consultaCobros() {
  const mes = currentMonthLabel();
  logger.info('CONSULTAS', 'Consultando cobros', { mes });

  const clientes = await sheets.readSheetAsObjects('CLIENTES');
  const activos = clientes.filter(c => (c['Activo?'] || '').toUpperCase().startsWith('S'));

  const pagados = activos.filter(c => (c['Estado Mes Actual'] || '').toUpperCase() === 'PAGADO');
  const pendientes = activos.filter(c => (c['Estado Mes Actual'] || '').toUpperCase() === 'PENDIENTE');

  const totalEsperado = activos.reduce((sum, c) => sum + (parseFloat(c['Monto Mensual']) || 0), 0);
  const totalCobrado = pagados.reduce((sum, c) => sum + (parseFloat(c['Monto Cobrado'] || c['Monto Mensual']) || 0), 0);

  const resumen =
    `📋 *COBROS ${mes}*\n` +
    `✅ Pagados (${pagados.length}): ${pagados.map(c => c['Cliente']).join(', ') || 'ninguno'}\n` +
    `⏳ Pendientes (${pendientes.length}): ${pendientes.map(c => c['Cliente']).join(', ') || 'ninguno'}\n` +
    `Total cobrado: ${formatARS(totalCobrado)} / ${formatARS(totalEsperado)}`;

  logger.success('CONSULTAS', 'Consulta de cobros completada');
  return { resumen };
}

/**
 * Registra un ajuste o saldo inicial de caja en ASIENTO_CONTABLE.
 */
async function handleAjusteCaja(datos) {
  const { monto, descripcion } = datos;
  const mes = currentMonthLabel();

  logger.info('CONSULTAS', 'Ajuste de caja', { monto });

  const lastId = await sheets.getLastId('ASIENTO_CONTABLE');
  const num = lastId ? (parseInt(String(lastId).replace(/\D/g, ''), 10) || 0) + 1 : 1;
  const nAsiento = String(num).padStart(4, '0');

  await sheets.appendRow('ASIENTO_CONTABLE', [
    nAsiento,
    todayISO(),
    'AJUSTE',
    'Caja',
    descripcion || `Ajuste de saldo — ${mes}`,
    monto,  // DEBE
    0,       // HABER
    monto,   // Saldo Acum.
    '',
    'AJUSTE_CAJA',
  ]);

  logger.success('CONSULTAS', 'Ajuste de caja registrado', { monto });
  return { nAsiento, monto };
}

module.exports = { handleConsulta, handleAjusteCaja };
