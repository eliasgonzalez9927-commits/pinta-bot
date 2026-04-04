'use strict';

const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Mocks ────────────────────────────────────────────────────────────────────
const appendedRows = [];
let lastBalance = 500000;
let lastId = 'G005';

mock.module('../src/sheets', {
  namedExports: {
    getLastId: async () => lastId,
    getLastBalance: async () => lastBalance,
    appendRow: async (sheet, row) => { appendedRows.push({ sheet, row }); },
    readSheet: async () => [['ID', 'Fecha', 'Monto']],
    readSheetAsObjects: async () => [],
    updateRowBySearch: async () => true,
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
describe('Handler: gastos', () => {
  beforeEach(() => {
    appendedRows.length = 0;
  });

  it('genera ID correlativo G006 partiendo de G005', async () => {
    const { handleGasto } = require('../src/handlers/gastos');
    const result = await handleGasto({
      monto: 30000,
      categoria: 'Herramientas',
      descripcion: 'ChatGPT mensual',
      fecha: '2026-04-01',
      fijo: true,
    });

    assert.equal(result.id, 'G006');
  });

  it('registra una fila en GASTOS y otra en ASIENTO_CONTABLE', async () => {
    const { handleGasto } = require('../src/handlers/gastos');
    await handleGasto({
      monto: 35000,
      categoria: 'Herramientas',
      descripcion: 'Canva',
      fecha: '2026-04-01',
      fijo: true,
    });

    const gastoRow = appendedRows.find(r => r.sheet === 'GASTOS');
    const asientoRow = appendedRows.find(r => r.sheet === 'ASIENTO_CONTABLE');

    assert.ok(gastoRow, 'Debe haber una fila en GASTOS');
    assert.ok(asientoRow, 'Debe haber una fila en ASIENTO_CONTABLE');
    assert.equal(gastoRow.row[2], 35000, 'Monto correcto en GASTOS');
    assert.equal(gastoRow.row[6], 'SÍ', 'Gasto fijo marcado correctamente');
  });

  it('calcula el nuevo saldo correctamente', async () => {
    lastBalance = 1000000;
    const { handleGasto } = require('../src/handlers/gastos');
    const result = await handleGasto({
      monto: 100000,
      categoria: 'Servicios',
      descripcion: 'Test',
      fecha: '2026-04-01',
      fijo: false,
    });

    assert.equal(result.saldoNuevo, 900000);
  });
});
