'use strict';

/**
 * Formatea un número como pesos argentinos: 2000000 → "$2.000.000"
 */
function formatARS(amount) {
  if (amount == null) return '$0';
  return '$' + Number(amount).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Formatea una fecha Date o string YYYY-MM-DD a DD/MM/YYYY
 */
function formatDate(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Retorna la fecha actual como YYYY-MM-DD
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Retorna el mes actual como "ABR 26", "MAY 26", etc.
 */
function currentMonthLabel() {
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
                  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const now = new Date();
  const mon = months[now.getMonth()];
  const yr = String(now.getFullYear()).slice(2);
  return `${mon} ${yr}`;
}

/**
 * Retorna el mes anterior como "MAR 26", etc.
 */
function prevMonthLabel() {
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
                  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${months[prev.getMonth()]} ${String(prev.getFullYear()).slice(2)}`;
}

/**
 * Calcula el porcentaje de variación entre dos montos
 */
function variationPct(oldAmt, newAmt) {
  if (!oldAmt || oldAmt === 0) return 0;
  return Math.round(((newAmt - oldAmt) / oldAmt) * 100);
}

/**
 * Pad izquierdo con ceros: nextId('G', 3, rows) → 'G004'
 */
function nextCorrelativeId(prefix, padLen, lastId) {
  if (!lastId) return `${prefix}${'1'.padStart(padLen, '0')}`;
  const num = parseInt(lastId.replace(prefix, ''), 10);
  return `${prefix}${String(num + 1).padStart(padLen, '0')}`;
}

module.exports = { formatARS, formatDate, todayISO, currentMonthLabel, prevMonthLabel, variationPct, nextCorrelativeId };
