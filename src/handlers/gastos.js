'use strict';

const sheets = require('../sheets');
const { sendToGroup } = require('../whatsapp');
const { formatARS, todayISO, currentMonthLabel, nextCorrelativeId } = require('../utils/formatter');
const logger = require('../utils/logger');

// Mapeo de categoría a cuenta contable
const CUENTAS_POR_CATEGORIA = {
  Herramientas: 'Gastos Operativos',
  Servicios: 'Gastos Generales',
  Financiero: 'Obligaciones Financieras',
  Impuestos: 'Cargas Fiscales',
  Equipo: 'Sueldos y Honorarios',
};

/**
 * Registra un gasto en GASTOS y genera el asiento contable.
 */
async function handleGasto(datos) {
  const { monto, categoria, descripcion, fecha, fijo } = datos;
  const fechaGasto = fecha || todayISO();
  const mes = currentMonthLabel();

  logger.info('GASTOS', 'Registrando gasto', { monto, categoria, descripcion });

  // 1. Generar ID correlativo
  const lastId = await sheets.getLastId('GASTOS');
  const id = nextCorrelativeId('G', 3, lastId);

  // 2. Agregar fila en GASTOS
  // ID | Fecha | Monto | Categoría | Descripción | Comprobante? | Gasto Fijo? | Registrado por | Mes
  await sheets.appendRow('GASTOS', [
    id,
    fechaGasto,
    monto,
    categoria || 'General',
    descripcion,
    'NO',
    fijo ? 'SÍ' : 'NO',
    'Hernán Bot',
    mes,
  ]);

  // 3. Generar asiento contable
  const cuenta = CUENTAS_POR_CATEGORIA[categoria] || 'Gastos Generales';
  const saldoAnterior = await sheets.getLastBalance();
  const saldoNuevo = saldoAnterior - monto;

  const lastAsientoId = await sheets.getLastId('ASIENTO_CONTABLE');
  const asientoId = nextCorrelativeId('A', 4, lastAsientoId);

  // N° Asiento | Fecha | Tipo | Cuenta Contable | Descripción | DEBE | HABER | Saldo Acum. | Ref. Comprobante | Categoría
  await sheets.appendRow('ASIENTO_CONTABLE', [
    asientoId,
    fechaGasto,
    'EGRESO_SERVICIO',
    cuenta,
    descripcion,
    0,
    monto,
    saldoNuevo,
    id,
    categoria || 'General',
  ]);

  logger.success('GASTOS', `Gasto ${id} registrado`, { monto, descripcion });
  return { id, saldoNuevo };
}

module.exports = { handleGasto };
