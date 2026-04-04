'use strict';

const sheets = require('../sheets');
const { formatARS, todayISO, currentMonthLabel, nextCorrelativeId, variationPct } = require('../utils/formatter');
const logger = require('../utils/logger');

/**
 * Actualiza la tarifa de un cliente (requiere confirmación previa).
 */
async function handleTarifa(datos) {
  const { cliente_id, cliente, monto_anterior, monto_nuevo, desde_mes } = datos;
  const hoy = todayISO();
  const diff = monto_nuevo - monto_anterior;
  const pct = variationPct(monto_anterior, monto_nuevo);

  logger.info('TARIFAS', 'Actualizando tarifa', { cliente, monto_anterior, monto_nuevo });

  // 1. Actualizar CLIENTES
  const allRows = await sheets.readSheet('CLIENTES');
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (
      (cliente_id && row[0] === cliente_id) ||
      (cliente && (row[1] || '').toLowerCase().includes(cliente.toLowerCase()))
    ) {
      // Columnas: E = Monto Mensual, M = Monto Anterior, N = Fecha Último Aumento
      await sheets.updateRowBySearch('CLIENTES', 0, row[0], {
        E: monto_nuevo,
        M: monto_anterior,
        N: hoy,
      });
      break;
    }
  }

  // 2. Agregar fila en TARIFAS_HISTORIAL
  // ID | Fecha Cambio | Cliente | Tarifa Anterior | Tarifa Nueva | Diferencia | Var. % | Desde Mes | Decidido por | Nota
  const lastId = await sheets.getLastId('TARIFAS_HISTORIAL');
  const id = nextCorrelativeId('T', 3, lastId);

  await sheets.appendRow('TARIFAS_HISTORIAL', [
    id,
    hoy,
    cliente,
    monto_anterior,
    monto_nuevo,
    diff,
    `${pct}%`,
    desde_mes || currentMonthLabel(),
    'Equipo Pinta',
    '',
  ]);

  logger.success('TARIFAS', `Tarifa de ${cliente} actualizada`, { monto_nuevo, pct });
  return { id, diff, pct };
}

module.exports = { handleTarifa };
