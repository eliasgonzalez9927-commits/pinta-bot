'use strict';

const sheets = require('../sheets');
const { todayISO, currentMonthLabel, nextCorrelativeId } = require('../utils/formatter');
const logger = require('../utils/logger');

/**
 * Da de alta una herramienta (la registra como gasto fijo).
 */
async function handleAltaHerramienta(datos) {
  const { nombre, categoria, monto, desde_mes } = datos;
  const mes = currentMonthLabel();

  logger.info('HERRAMIENTAS', 'Alta herramienta', { nombre, monto });

  // Agregar en GASTOS como gasto fijo
  const lastGastoId = await sheets.getLastId('GASTOS');
  const gastoId = nextCorrelativeId('G', 3, lastGastoId);

  await sheets.appendRow('GASTOS', [
    gastoId,
    todayISO(),
    monto,
    categoria || 'Herramientas',
    nombre,
    'NO',
    'SÍ',
    'Hernán Bot',
    desde_mes || mes,
  ]);

  // HERRAMIENTAS_HISTORIAL: ID | Fecha | Herramienta | Tipo | Categoría | Costo Anterior | Costo Nuevo | Diferencia | Var. % | Desde Mes | Motivo
  const lastHId = await sheets.getLastId('HERRAMIENTAS_HISTORIAL');
  const hId = nextCorrelativeId('H', 3, lastHId);

  await sheets.appendRow('HERRAMIENTAS_HISTORIAL', [
    hId,
    todayISO(),
    nombre,
    'ALTA',
    categoria || 'Herramientas',
    0,
    monto,
    monto,
    '—',
    desde_mes || mes,
    'Alta nueva',
  ]);

  logger.success('HERRAMIENTAS', `Alta: ${nombre}`, { gastoId, hId });
  return { gastoId, hId };
}

/**
 * Da de baja una herramienta.
 * A partir del mes siguiente ya no se registra en GASTOS.
 */
async function handleBajaHerramienta(datos) {
  const { nombre, desde_mes } = datos;
  const mes = currentMonthLabel();

  logger.info('HERRAMIENTAS', 'Baja herramienta', { nombre });

  const lastHId = await sheets.getLastId('HERRAMIENTAS_HISTORIAL');
  const hId = nextCorrelativeId('H', 3, lastHId);

  await sheets.appendRow('HERRAMIENTAS_HISTORIAL', [
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
    'Cancelación',
  ]);

  logger.success('HERRAMIENTAS', `Baja: ${nombre}`, { hId });
  return { hId };
}

module.exports = { handleAltaHerramienta, handleBajaHerramienta };
