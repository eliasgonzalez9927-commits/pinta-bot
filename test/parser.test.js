'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseClaudeResponse, validateParsed } = require('../src/utils/parser');

describe('Parser utils', () => {
  it('parsea JSON directo', () => {
    const raw = '{"accion":"GASTO","datos":{},"confirmacion":"ok","necesita_confirmacion":false}';
    const result = parseClaudeResponse(raw);
    assert.equal(result.accion, 'GASTO');
  });

  it('parsea JSON dentro de bloque markdown', () => {
    const raw = '```json\n{"accion":"COBRO","datos":{},"confirmacion":"cobro","necesita_confirmacion":false}\n```';
    const result = parseClaudeResponse(raw);
    assert.equal(result.accion, 'COBRO');
  });

  it('parsea JSON con texto alrededor', () => {
    const raw = 'Aquí está la respuesta: {"accion":"DUDA","datos":{},"confirmacion":"?","necesita_confirmacion":false} listo.';
    const result = parseClaudeResponse(raw);
    assert.equal(result.accion, 'DUDA');
  });

  it('retorna null para texto sin JSON', () => {
    const result = parseClaudeResponse('Hola, no hay JSON aquí.');
    assert.equal(result, null);
  });

  it('validateParsed acepta objetos válidos', () => {
    const valid = { accion: 'GASTO', datos: {}, confirmacion: '✅ ok', necesita_confirmacion: false };
    assert.ok(validateParsed(valid));
  });

  it('validateParsed rechaza objetos sin accion', () => {
    assert.ok(!validateParsed({ datos: {}, confirmacion: 'ok' }));
    assert.ok(!validateParsed(null));
  });
});
