'use strict';
/**
 * SCRIPT DE INICIALIZACIÓN DE GOOGLE SHEETS
 * Ejecutar UNA SOLA VEZ antes de arrancar el bot:
 *   node scripts/init-sheets.js
 */
require('dotenv').config();
const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

const SHEETS_CONFIG = [
  {
    name: 'CLIENTES',
    headers: ['ID', 'Cliente', 'WhatsApp', 'Factura?', 'Monto Mensual', 'Vto. Día',
              'Estado Mes Actual', 'Fecha Pago', 'Monto Cobrado', 'Observaciones',
              'Activo?', 'Desde', 'Monto Anterior', 'Fecha Ultimo Aumento'],
  },
  {
    name: 'GASTOS',
    headers: ['ID', 'Fecha', 'Monto', 'Categoria', 'Descripcion',
              'Comprobante?', 'Gasto Fijo?', 'Registrado por', 'Mes'],
  },
  {
    name: 'EMPLEADOS',
    headers: ['ID', 'Nombre', 'WhatsApp', 'Tipo', 'Monto', 'Factura Enviada?',
              'Fecha Factura', 'Pago Liberado?', 'Fecha Pago', 'Mes', 'Observaciones'],
  },
  {
    name: 'COBROS_HISTORIAL',
    headers: ['ID', 'Mes', 'Cliente', 'Monto Esperado', 'Monto Cobrado', 'Fecha Cobro',
              'Canal', 'Confirmado por', 'Factura Emitida?', 'Observaciones'],
  },
  {
    name: 'ASIENTO_CONTABLE',
    headers: ['N Asiento', 'Fecha', 'Tipo', 'Cuenta Contable', 'Descripcion',
              'DEBE', 'HABER', 'Saldo Acum.', 'Ref. Comprobante', 'Categoria'],
  },
  {
    name: 'TARIFAS_HISTORIAL',
    headers: ['ID', 'Fecha Cambio', 'Cliente', 'Tarifa Anterior', 'Tarifa Nueva',
              'Diferencia', 'Var. %', 'Desde Mes', 'Decidido por', 'Nota'],
  },
  {
    name: 'EMPLEADOS_HISTORIAL',
    headers: ['ID', 'Fecha', 'Empleado', 'Tipo Cambio', 'Rol', 'Sueldo Anterior',
              'Sueldo Nuevo', 'Diferencia', 'Var. %', 'Desde Mes', 'Motivo'],
  },
  {
    name: 'HERRAMIENTAS_HISTORIAL',
    headers: ['ID', 'Fecha', 'Herramienta', 'Tipo', 'Categoria', 'Costo Anterior',
              'Costo Nuevo', 'Diferencia', 'Var. %', 'Desde Mes', 'Motivo'],
  },
];

const CLIENTES_INICIALES = [
  ['C001', 'Samaco',        '', 'NO', 2000000, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
  ['C002', 'Bermudez Inmo', '', 'NO',  890000, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
  ['C003', 'Cristiano',     '', 'NO',  500500, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
  ['C004', 'Los Cubos',     '', 'NO',  800000, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
  ['C005', 'Luly Lupe',     '', 'SI',  850000, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
  ['C006', 'Grandbar',      '', 'SI', 1000000, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
  ['C007', 'La Vene',       '', 'NO',  780000, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
  ['C008', 'Gandolfo',      '', 'SI', 1070000, 10, 'PENDIENTE', '', '', '', 'SI', '', '', ''],
];

const EMPLEADOS_INICIALES = [
  ['E001', 'Elias',      '', 'Socio',       2500000, 'N/A', '', 'SI', '', '', 'ACTIVO'],
  ['E002', 'Emilia',     '', 'Socia',       2500000, 'N/A', '', 'SI', '', '', 'ACTIVO'],
  ['E003', 'Vicente',    '', 'Diseno',       850000, 'PENDIENTE', '', 'NO', '', '', 'ACTIVO'],
  ['E004', 'Luca',       '', 'Paid Media',   330000, 'PENDIENTE', '', 'NO', '', '', 'ACTIVO'],
  ['E005', 'Ezequiel',   '', 'SR',           500000, 'PENDIENTE', '', 'NO', '', '', 'ACTIVO'],
  ['E006', 'Tomy',       '', 'Editor',       200000, 'PENDIENTE', '', 'NO', '', '', 'ACTIVO'],
  ['E007', 'Juan Zabala','', 'Filmmaker',    100000, 'PENDIENTE', '', 'NO', '', '', 'ACTIVO'],
  ['E008', 'Angie',      '', 'Diseno',       150000, 'PENDIENTE', '', 'NO', '', '', 'ACTIVO'],
  ['E009', 'Pau',        '', 'Pasante',      200000, 'N/A', '', 'SI', '', '', 'ACTIVO'],
];

async function initSheets() {
  if (!SHEET_ID) {
    console.error('Falta GOOGLE_SHEET_ID en .env');
    process.exit(1);
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.error('Falta GOOGLE_SERVICE_ACCOUNT_JSON en .env');
    process.exit(1);
  }

  console.log('Iniciando configuracion de Google Sheets...\n');
  const authClient = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existentes = meta.data.sheets.map(s => s.properties.title);
  console.log('Hojas existentes:', existentes.join(', ') || 'ninguna');

  const requests = [];
  for (const cfg of SHEETS_CONFIG) {
    if (existentes.includes(cfg.name)) {
      console.log('SKIP ' + cfg.name + ' -- ya existe');
      continue;
    }
    requests.push({ addSheet: { properties: { title: cfg.name } } });
    console.log('ADD  ' + cfg.name);
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
    console.log('\n' + requests.length + ' hojas creadas');
  }

  console.log('\nEscribiendo headers...');
  for (const cfg of SHEETS_CONFIG) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: cfg.name + '!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [cfg.headers] },
    });
    console.log('  OK ' + cfg.name);
  }

  console.log('\nCargando datos iniciales...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'CLIENTES!A2',
    valueInputOption: 'RAW',
    requestBody: { values: CLIENTES_INICIALES },
  });
  console.log('  OK Clientes (8)');

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'EMPLEADOS!A2',
    valueInputOption: 'RAW',
    requestBody: { values: EMPLEADOS_INICIALES },
  });
  console.log('  OK Empleados (9)');

  console.log('\nGoogle Sheet listo. Arranca el bot con: node index.js\n');
}

initSheets().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
