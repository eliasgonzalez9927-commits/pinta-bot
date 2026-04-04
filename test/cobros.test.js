'use strict';

const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Mocks ────────────────────────────────────────────────────────────────────
const appendedRows = [];
const updatedRows = [];
let lastBalance = 2000000;
let lastCobrosId = 'CO010';
let lastAsientoId = 'A0050';

const mockSheetData = [
  ['ID', 'Cliente', 'WhatsApp', 'Factura?', 'Monto Mensual', 'Vto. Día', 'Estado Mes Actual', 'Fecha Pago', 'Monto Cobrado', 'Observaciones', 'Activo?', 'Desde', 'Monto Anterior', 'Fecha Último Aumento'],
  ['C001', 'Samaco', '5491155550001', 'NO', '2000000', '10', 'PENDIENTE', '', '', '', 'SÍ', '2025-01-01', '', ''],
  ['C002', 'Bermudez Inmo', '5491155550002', 'NO', '890000', '10', 'PENDIENTE', '', '', '', 'SÍ', '2025-01-01', '', ''],
];

mock.module('../src/sheets', {
  namedExports: {
    getLastId: async (sheet) => {
      if (sheet === 'COBROS_HISTORIAL') return lastCobrosId;
      if (sheet === 'ASIENTO_CONTABLE') return lastAsientoId;
      return null;
    },
    getLastBalance: async () => lastBalance,
    appendRow: async (sheet, row) => { appendedRows.push({ sheet, row }); },
    readSheet: async () => mockSheetData,
    readSheetAsObjects: async () => {
      const headers = mockSheetData[0];
      return mockSheetData.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
    },
    updateRowBySearch: async (sheet, col, val, updates) => {
      updatedRows.push({ sheet, col, val, updates });
      return true;
    },
    updateCell: async () => {},
  },
});

mock.module('../src/utils/logger', {
  namedExports: {
    info: () => {},
    warn: () => {},
    error: () => {},
    success: () => {},
  },
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Handler: cobros', () => {
  beforeEach(() => {
    appendedRows.length = 0;
    updatedRows.length = 0;
  });

  it('genera ID correlativo CO011 partiendo de CO010', async () => {
    const { handleCobro } = require('../src/handlers/cobros');
    const result = await handleCobro({
      cliente_id: 'C001',
      cliente: 'Samaco',
      monto: 2000000,
      mes: 'ABR 26',
      fecha: '2026-04-03',
      canal: 'TRANSFERENCIA',
    });

    assert.equal(result.id, 'CO011');
  });

  it('actualiza el estado del cliente a PAGADO', async () => {
    const { handleCobro } = require('../src/handlers/cobros');
    await handleCobro({
      cliente_id: 'C001',
      cliente: 'Samaco',
      monto: 2000000,
      mes: 'ABR 26',
      fecha: '2026-04-03',
      canal: 'TRANSFERENCIA',
    });

    const clienteUpdate = updatedRows.find(r => r.sheet === 'CLIENTES');
    assert.ok(clienteUpdate, 'Debe actualizar CLIENTES');
    assert.equal(clienteUpdate.updates.G, 'PAGADO');
  });

  it('calcula el nuevo saldo correctamente (ingreso suma)', async () => {
    lastBalance = 1000000;
    const { handleCobro } = require('../src/handlers/cobros');
    const result = await handleCobro({
      cliente_id: 'C002',
      cliente: 'Bermudez Inmo',
      monto: 890000,
      mes: 'ABR 26',
      fecha: '2026-04-04',
      canal: 'TRANSFERENCIA',
    });

    assert.equal(result.saldoNuevo, 1890000);
  });

  it('registra el cobro en COBROS_HISTORIAL y genera asiento', async () => {
    const { handleCobro } = require('../src/handlers/cobros');
    await handleCobro({
      cliente_id: 'C001',
      cliente: 'Samaco',
      monto: 2000000,
      mes: 'ABR 26',
      fecha: '2026-04-03',
      canal: 'TRANSFERENCIA',
    });

    const cobrosRow = appendedRows.find(r => r.sheet === 'COBROS_HISTORIAL');
    const asientoRow = appendedRows.find(r => r.sheet === 'ASIENTO_CONTABLE');

    assert.ok(cobrosRow, 'Debe agregar fila en COBROS_HISTORIAL');
    assert.ok(asientoRow, 'Debe agregar asiento contable');
    assert.equal(asientoRow.row[2], 'INGRESO_CLIENTE');
  });
});
