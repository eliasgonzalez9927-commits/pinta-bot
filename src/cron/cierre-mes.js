'use strict';

const cron = require('node-cron');
const sheets = require('../sheets');
const { sendToGroup } = require('../whatsapp');
const { generateCierreResumen } = require('../claude');
const { prevMonthLabel, formatARS } = require('../utils/formatter');
const logger = require('../utils/logger');

/**
 * Cierre de mes — se ejecuta el día 1 de cada mes a las 8:00 AM.
 * Calcula ingresos, egresos y resultado del mes anterior.
 */
async function jobCierreMes() {
  logger.info('CRON', 'Ejecutando cierre de mes');

  try {
    const mesCerrado = prevMonthLabel();

    // Calcular mes y año anterior
    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const anio = prevDate.getFullYear();
    const mesNum = String(prevDate.getMonth() + 1).padStart(2, '0');
    const prefixFecha = `${anio}-${mesNum}`;

    // Leer asientos del mes anterior
    const asientos = await sheets.readSheetAsObjects('ASIENTO_CONTABLE');
    let totalIngresos = 0;
    let totalEgresos = 0;

    for (const a of asientos) {
      if (!(a['Fecha'] || '').startsWith(prefixFecha)) continue;
      const debe = parseFloat(String(a['DEBE'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
      const haber = parseFloat(String(a['HABER'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
      totalIngresos += debe;
      totalEgresos += haber;
    }

    const resultado = totalIngresos - totalEgresos;
    const saldoActual = await sheets.getLastBalance();

    // Clientes que no pagaron en el mes anterior
    const cobros = await sheets.readSheetAsObjects('COBROS_HISTORIAL');
    const cobradosMes = cobros.filter(c => (c['Mes'] || '') === mesCerrado).map(c => c['Cliente'].toLowerCase());

    const clientes = await sheets.readSheetAsObjects('CLIENTES');
    const morosos = clientes
      .filter(c =>
        (c['Activo?'] || '').toUpperCase().startsWith('S') &&
        !cobradosMes.includes((c['Cliente'] || '').toLowerCase())
      )
      .map(c => c['Cliente']);

    // Generar resumen con Claude
    let resumen;
    try {
      resumen = await generateCierreResumen(totalIngresos, totalEgresos, resultado, saldoActual, morosos);
    } catch {
      // Fallback manual
      const morososTexto = morosos.length > 0 ? `\n🔴 Sin pagar: ${morosos.join(', ')}` : '';
      resumen =
        `📊 CIERRE DE ${mesCerrado}\n\n` +
        `💰 Ingresos: ${formatARS(totalIngresos)}\n` +
        `💸 Egresos: ${formatARS(totalEgresos)}\n` +
        `📈 Resultado: ${formatARS(resultado)}\n\n` +
        `Clientes que pagaron: ${cobradosMes.length}/${clientes.filter(c => (c['Activo?'] || '').toUpperCase().startsWith('S')).length}` +
        morososTexto + `\n\nSaldo actual de caja: ${formatARS(saldoActual)}`;
    }

    await sendToGroup(resumen);
    logger.success('CRON', `Cierre de ${mesCerrado} enviado`, { totalIngresos, totalEgresos, resultado });
  } catch (err) {
    logger.error('CRON', 'Error en cierre de mes', { err: err.message });
    await sendToGroup('❌ Error generando cierre de mes. Verificá los logs.').catch(() => {});
  }
}

/**
 * Registra el job de cierre de mes.
 */
function registerCierreMesJob() {
  // Día 1 a las 8:00 AM (antes que el job de cobros a las 9:00)
  cron.schedule('0 8 1 * *', jobCierreMes, { timezone: 'America/Argentina/Buenos_Aires' });
  logger.info('CRON', 'Job de cierre de mes registrado (día 1 a las 8:00)');
}

module.exports = { registerCierreMesJob, jobCierreMes };
