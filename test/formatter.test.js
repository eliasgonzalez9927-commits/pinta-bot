'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatARS, formatDate, nextCorrelativeId, variationPct } = require('../src/utils/formatter');

describe('Formatter utils', () => {
  it('formatARS: formatea correctamente montos grandes', () => {
    assert.equal(formatARS(2000000), '$2.000.000');
    assert.equal(formatARS(890000), '$890.000');
    assert.equal(formatARS(0), '$0');
  });

  it('formatDate: formatea YYYY-MM-DD a DD/MM/YYYY', () => {
    assert.equal(formatDate('2026-04-01'), '01/04/2026');
    assert.equal(formatDate('2026-12-31'), '31/12/2026');
  });

  it('nextCorrelativeId: genera IDs con padding correcto', () => {
    assert.equal(nextCorrelativeId('G', 3, 'G005'), 'G006');
    assert.equal(nextCorrelativeId('CO', 3, 'CO009'), 'CO010');
    assert.equal(nextCorrelativeId('A', 4, 'A0099'), 'A0100');
    assert.equal(nextCorrelativeId('G', 3, null), 'G001');
  });

  it('variationPct: calcula porcentaje de variación', () => {
    assert.equal(variationPct(2000000, 2500000), 25);
    assert.equal(variationPct(1000000, 900000), -10);
    assert.equal(variationPct(0, 500000), 0);
  });
});
