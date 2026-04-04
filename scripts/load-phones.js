'use strict';
require('dotenv').config();
const { google } = require('googleapis');

async function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return auth.getClient();
}

const EMPLEADOS_PHONES = {
  'Elias':      '5492613335734',
  'Emilia':     '5491139044080',
  'Vicente':    '5492616124147',
  'Dignnybeth': '5492616841153',
  'Pau':        '5492616299113',
  'Angie':      '5492615726103',
  'Tomy':       '5492644522154',
  'Luca':       '5491128490374',
  'Ezequiel':   '5492616703456',
};

const CLIENTES_PHONES = {
  'Samaco':       '5492615374218',
  'Bermudez Inmo':'5492646725589',
  'Cristiano':    '56953367943',
  'Los Cubos':    '5492616304613',
  'Luly Lupe':    '5492615449687',
  'Grandbar':     '',
  'La Vene':      '5492616628999',
  'Gandolfo':     '5492616530443',
};

async function loadPhones() {
  const authClient = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const sid = process.env.GOOGLE_SHEET_ID;

  // --- EMPLEADOS (col C = index 2) ---
  const emp = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'EMPLEADOS' });
  const empRows = emp.data.values || [];
  const empUpdates = [];
  for (let i = 1; i < empRows.length; i++) {
    const nombre = empRows[i][1] || '';
    const phone = Object.entries(EMPLEADOS_PHONES).find(([k]) => nombre.toLowerCase().includes(k.toLowerCase()))?.[1];
    if (phone !== undefined) {
      empUpdates.push({ range: `EMPLEADOS!C${i+1}`, values: [[phone]] });
      console.log(`EMPLEADOS fila ${i+1}: ${nombre} → ${phone || '(sin número)'}`);
    }
  }

  // --- CLIENTES (col C = index 2) ---
  const cli = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'CLIENTES' });
  const cliRows = cli.data.values || [];
  const cliUpdates = [];
  for (let i = 1; i < cliRows.length; i++) {
    const nombre = cliRows[i][1] || '';
    const phone = Object.entries(CLIENTES_PHONES).find(([k]) => nombre.toLowerCase().includes(k.toLowerCase()))?.[1];
    if (phone !== undefined) {
      cliUpdates.push({ range: `CLIENTES!C${i+1}`, values: [[phone]] });
      console.log(`CLIENTES  fila ${i+1}: ${nombre} → ${phone || '(solo mail)'}`);
    }
  }

  const allUpdates = [...empUpdates, ...cliUpdates];
  if (allUpdates.length === 0) { console.log('Nada para actualizar'); return; }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: { valueInputOption: 'RAW', data: allUpdates },
  });
  console.log(`\n✅ ${allUpdates.length} números cargados en el sheet`);
}

loadPhones().catch(e => { console.error('Error:', e.message); process.exit(1); });
