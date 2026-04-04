'use strict';

const sheets = require('../sheets');
const { formatARS, todayISO, currentMonthLabel, nextCorrelativeId } = require('../utils/formatter');
const logger = require('../utils/logger');

/**
 * Registra un cobro manual en COBROS_HISTORIAL y actualiza CLIENTES.
 */
async function handleCobro(datos) {
  const { cliente_id, cliente, monto, mes, fecha, canal } = datos;
  const fechaCobro = fecha || todayISO();
  const mesLabel = mes || currentMonthLabel();

  logger.info('COBROS', 'Registrando cobro', { cliente, monto, mes: mesLabel });

  // 1. Actualizar estado en CLIENTES (buscar por ID o nombre)
  const clientes = await sheets.readSheetAsObjects('CLIENTES');
  const headers = await sheets.readSheet('CLIENTES').then(r => r[0]);

  // Encontrar índice de fila
  const allRows = await sheets.readSheet('CLIENTES');
  let rowNum = null;
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (
      (cliente_id && row[0] === cliente_id) ||
      (cliente && (row[1] || '').toLowerCase().includes(cliente.toLowerCase()))
    ) {
      rowNum = i + 1; // 1-based para Sheets
      break;
    }
  }

  if (rowNum) {
    // Columnas: ID(A) | Cliente(B) | WhatsApp(C) | Factura?(D) | Monto Mensual(E) | Vto. Día(F) |
    //           Estado Mes Actual(G) | Fecha Pago(H) | Monto Cobrado(I) | Observaciones(J) | Activo?(K) | Desde(L) | Monto Anterior(M) | Fecha Último Aumento(N)
    await sheets.updateRowBySearch('CLIENTES', 0, allRows[rowNum - 1][0], {
      G: 'PAGADO',
      H: fechaCobro,
      I: monto,
    });
  } else {
    logger.warn('COBROS', `Cliente no encontrado: ${cliente}`);
  }

  // 2. Generar ID correlativo para COBROS_HISTORIAL
  const lastId = await sheets.getLastId('COBROS_HISTORIAL');
  const id = nextCorrelativeId('CO', 3, lastId);

  // 3. Agregar fila en COBROS_HISTORIAL
  // ID | Mes | Cliente | Monto Esperado | Monto Cobrado | Fecha Cobro | Canal | Confirmado por | Factura Emitida? | Observaciones
  await sheets.appendRow('COBROS_HISTORIAL', [
    id,
    mesLabel,
    cliente,
    monto,
    monto,
    fechaCobro,
    canal || 'TRANSFERENCIA',
    'Hernán Bot',
    'NO',
    '',
  ]);

  // 4. Generar asiento contable
  const saldoAnterior = await sheets.getLastBalance();
  const saldoNuevo = saldoAnterior + monto;

  const lastAsientoId = await sheets.getLastId('ASIENTO_CONTABLE');
  const asientoId = nextCorrelativeId('A', 4, lastAsientoId);

  await sheets.appendRow('ASIENTO_CONTABLE', [
    asientoId,
    fechaCobro,
    'INGRESO_CLIENTE',
    'Caja / Cuentas a Cobrar',
    `Cobro ${cliente} — ${mesLabel}`,
    monto,
    0,
    saldoNuevo,
    id,
    'Cobros',
  ]);

  logger.success('COBROS', `Cobro ${id} registrado`, { cliente, monto });
  return { id, saldoNuevo };
}

/**
 * Resetea el estado de todos los clientes activos a PENDIENTE.
 * Se llama el día 1 de cada mes.
 */
async function resetearEstadoClientes() {
  const allRows = await sheets.readSheet('CLIENTES');
  logger.info('COBROS', 'Reseteando estado de clientes a PENDIENTE');

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    const activo = (row[10] || '').toUpperCase();
    if (activo === 'SÍ' || activo === 'SI') {
      await sheets.updateRowBySearch('CLIENTES', 0, row[0], {
        G: 'PENDIENTE',
        H: '',
        I: '',
      });
    }
  }

  logger.success('COBROS', 'Estado de clientes reseteado');
}

/**
 * Retorna clientes con estado dado (ej: 'PENDIENTE', 'ATRASADO').
 */
async function getClientesByEstado(estado) {
  const rows = await sheets.readSheetAsObjects('CLIENTES');
  return rows.filter(r => (r['Estado Mes Actual'] || '').toUpperCase() === estado.toUpperCase()
    && (r['Activo?'] || '').toUpperCase().startsWith('S'));
}

/**
 * Marca clientes PENDIENTE como ATRASADO.
 */
async function marcarAtrasados() {
  const allRows = await sheets.readSheet('CLIENTES');
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if ((row[6] || '') === 'PENDIENTE') {
      await sheets.updateRowBySearch('CLIENTES', 0, row[0], { G: 'ATRASADO' });
    }
  }
  logger.success('COBROS', 'Clientes PENDIENTE marcados como ATRASADO');
}

module.exports = { handleCobro, resetearEstadoClientes, getClientesByEstado, marcarAtrasados };
