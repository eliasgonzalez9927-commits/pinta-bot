'use strict';

const logger = require('./logger');

/**
 * Extrae y parsea el primer bloque JSON de la respuesta de Claude.
 * Si falla retorna null.
 */
function parseClaudeResponse(rawText) {
  if (!rawText) return null;

  // Intentar parsear directo
  try {
    return JSON.parse(rawText.trim());
  } catch (_) {}

  // Buscar bloque ```json ... ``` o ``` ... ```
  const mdMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim());
    } catch (_) {}
  }

  // Buscar el primer { ... } más externo
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(rawText.slice(start, end + 1));
    } catch (_) {}
  }

  logger.warn('PARSER', 'No se pudo parsear respuesta de Claude', { rawText: rawText.slice(0, 200) });
  return null;
}

/**
 * Valida que el objeto parseado tenga los campos mínimos esperados.
 */
function validateParsed(parsed) {
  if (!parsed) return false;
  if (!parsed.accion) return false;
  if (typeof parsed.confirmacion !== 'string') return false;
  return true;
}

module.exports = { parseClaudeResponse, validateParsed };
