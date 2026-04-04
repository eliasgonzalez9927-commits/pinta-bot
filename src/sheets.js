'use strict';

const { google } = require('googleapis');
const logger = require('./utils/logger');

let _sheets = null;
let _auth = null;

async function getAuth() {
  if (_auth) return _auth;

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return _auth;
}

async function getSheets() {
  if (_sheets) return _sheets;
  const auth = await getAuth();
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

const SHEET_ID = () => process.env.GOOGLE_SHEET_ID;

// ─── Hojas permitidas (NUNCA tocar las históricas) ───────────────────────────
const ALLOWED_SHEETS = [
  'CLIENTES', 'GASTOS', 'EMPLEADOS', 'COBROS_HISTORIAL',
  'ASIENTO_CONTABLE', 'TARIFAS_HISTORIAL', 'EMPLEADOS_HISTORIAL', 'HERRAMIENTAS_HISTORIAL', 'NOTAS',
];

function assertAllowed(sheetName) {
  if (!ALLOWED_SHEETS.includes(sheetName)) {
    throw new Error(`Hoja no permitida: ${sheetName}`);
  }
}

/**
 * Lee todas las filas de una hoja. Retorna array de arrays.
 */
async function readSheet(sheetName) {
  assertAllowed(sheetName);
  const sheets = await getSheets();

  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID(),
      range: sheetName,
    });
    return resp.data.values || [];
  } catch (err) {
    logger.error('SHEETS', `Error leyendo ${sheetName}`, { err: err.message });
    throw err;
  }
}

/**
 * Lee todas las filas como objetos usando la primera fila como header.
 */
async function readSheetAsObjects(sheetName) {
  const rows = await readSheet(sheetName);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

/**
 * Agrega una fila al final de una hoja.
 */
async function appendRow(sheetName, values) {
  assertAllowed(sheetName);
  const sheets = await getSheets();

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID(),
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
    logger.success('SHEETS', `Fila agregada en ${sheetName}`);
  } catch (err) {
    logger.error('SHEETS', `Error agregando fila en ${sheetName}`, { err: err.message });
    throw err;
  }
}

/**
 * Actualiza una celda específica.
 * @param {string} sheetName
 * @param {string} cellRange  - ej: "B5" o "CLIENTES!B5"
 * @param {string|number} value
 */
async function updateCell(sheetName, cellRange, value) {
  assertAllowed(sheetName);
  const sheets = await getSheets();
  const range = cellRange.includes('!') ? cellRange : `${sheetName}!${cellRange}`;

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID(),
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[value]] },
    });
    logger.success('SHEETS', `Celda actualizada ${range} = ${value}`);
  } catch (err) {
    logger.error('SHEETS', `Error actualizando celda ${range}`, { err: err.message });
    throw err;
  }
}

/**
 * Actualiza múltiples celdas de una fila encontrada por búsqueda.
 * Busca en la columna colIndex (0-based) el valor searchValue.
 * Retorna true si encontró y actualizó.
 */
async function updateRowBySearch(sheetName, colIndex, searchValue, updates) {
  assertAllowed(sheetName);
  const rows = await readSheet(sheetName);

  // rows[0] = headers, rows[1..] = data
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][colIndex] || '').toLowerCase() === String(searchValue).toLowerCase()) {
      const sheets = await getSheets();
      const batchData = Object.entries(updates).map(([col, val]) => ({
        range: `${sheetName}!${col}${i + 1}`,
        values: [[val]],
      }));

      try {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID(),
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: batchData,
          },
        });
        logger.success('SHEETS', `Fila ${i + 1} de ${sheetName} actualizada`);
        return true;
      } catch (err) {
        logger.error('SHEETS', `Error en batchUpdate ${sheetName}`, { err: err.message });
        throw err;
      }
    }
  }
  return false;
}

/**
 * Obtiene el último ID correlativo de una hoja.
 * Asume que la columna A contiene los IDs.
 */
async function getLastId(sheetName) {
  const rows = await readSheet(sheetName);
  if (rows.length < 2) return null;
  // El último ID es el de la última fila con datos
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0]) return rows[i][0];
  }
  return null;
}

/**
 * Obtiene el saldo acumulado de la última fila de ASIENTO_CONTABLE.
 * Columna H (índice 7) = Saldo Acum.
 */
async function getLastBalance() {
  const rows = await readSheet('ASIENTO_CONTABLE');
  if (rows.length < 2) return 0;
  for (let i = rows.length - 1; i >= 1; i--) {
    const val = rows[i][7];
    if (val !== undefined && val !== '') return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
  }
  return 0;
}

module.exports = {
  readSheet,
  readSheetAsObjects,
  appendRow,
  updateCell,
  updateRowBySearch,
  getLastId,
  getLastBalance,
};
