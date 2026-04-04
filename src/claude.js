'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { loadContext } = require('./context');
const logger = require('./utils/logger');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ─── Historial de conversación por chat ──────────────────────────────────────
const conversationHistories = new Map();
const HISTORY_TIMEOUT_MS = 30 * 60 * 1000; // 30 min de inactividad
const MAX_TURNS = 10; // hasta 10 intercambios

function getHistory(from) {
  if (!from) return [];
  const h = conversationHistories.get(from);
  if (!h) return [];
  if (Date.now() - h.lastActivity > HISTORY_TIMEOUT_MS) {
    conversationHistories.delete(from);
    return [];
  }
  return h.messages;
}

function addToHistory(from, role, content) {
  if (!from) return;
  let h = conversationHistories.get(from);
  if (!h) h = { messages: [], lastActivity: Date.now() };
  h.messages.push({ role, content });
  h.lastActivity = Date.now();
  // Mantener solo los últimos MAX_TURNS intercambios (user + assistant = 2 por turno)
  if (h.messages.length > MAX_TURNS * 2) {
    h.messages = h.messages.slice(-(MAX_TURNS * 2));
  }
  conversationHistories.set(from, h);
}

function clearHistory(from) {
  if (from) conversationHistories.delete(from);
}

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sos Hernán, el asistente administrativo de Pinta, una agencia de marketing digital ubicada en Mendoza, Argentina.

Tu trabajo es interpretar mensajes del equipo fundador y extraer datos estructurados para actualizar el sistema de administración.

REGLAS:
1. Respondé siempre en español rioplatense (vos, che, etc.)
2. Sé conciso. Máximo 3 líneas en tus respuestas al grupo.
3. Ante la duda, preguntá antes de ejecutar.
4. Confirmá cada acción con un emoji y resumen corto.
5. NUNCA modifiques registros existentes. Solo agregás nuevos.
6. NUNCA marcás un cobro como PAGADO sin confirmación explícita del equipo o comprobante del cliente.
7. Usá el historial de conversación para entender el contexto. Si el mensaje anterior habló de un empleado o monto, relacionalo con el mensaje actual.

CONTEXTO DE LA AGENCIA:
- Nombre: Pinta
- Socios: Elías y Emilia (son los admins del grupo de WhatsApp)
- Ciclo de cobros: del 1 al 10 de cada mes
- Ciclo de sueldos: del 1 al 10 de cada mes
- Moneda: pesos argentinos (ARS)
- Empleados que facturan NO cobran sin antes enviar su factura del mes

{{CONTEXTO_DINAMICO}}

HERRAMIENTAS ACTIVAS (gastos fijos mensuales):
- ChatGPT | IA | $30.000/mes | Día 1
- Canva | Diseño | $35.223/mes | Día 1
- Adobe Portfolio | Diseño | $5.862/mes
- Adobe Diseño | Diseño | $12.000/mes
- Google Workspace | Productividad | $84.680/mes | Día 1
- Google One | Productividad | $3.000/mes

GASTOS FIJOS RECURRENTES (el bot los carga automáticamente cada mes):
- Alquiler oficina | Servicios | $451.200 | Día 1
- ARCA / AFIP | Impuestos | $222.300 | Día 5
- Cuota BCO Francés | Financiero | $306.000 | Día 5
- Cuota BNA | Financiero | $365.000 | Día 5
- ChatGPT | Herramientas | $30.000 | Día 1
- Canva | Herramientas | $35.223 | Día 1
- Google Workspace | Herramientas | $84.680 | Día 1

Al recibir un mensaje, identificá el tipo de acción y respondé ÚNICAMENTE con un JSON válido con esta estructura:

{
  "accion": "GASTO|COBRO|SUELDO|TARIFA|ALTA_EMPLEADO|BAJA_EMPLEADO|ALTA_HERRAMIENTA|BAJA_HERRAMIENTA|CONSULTA|AJUSTE_CAJA|DUDA",
  "datos": { ... campos según la acción ... },
  "confirmacion": "Texto corto para responder en el grupo (máx 2 líneas)",
  "necesita_confirmacion": true/false
}

FORMATOS JSON POR ACCIÓN:

GASTO:
{ "accion": "GASTO", "datos": { "monto": 30000, "categoria": "Herramientas", "descripcion": "ChatGPT mensual", "fecha": "2026-04-01", "fijo": true }, "confirmacion": "✅ Gasté $30.000 en Herramientas — ChatGPT mensual", "necesita_confirmacion": false }

COBRO:
{ "accion": "COBRO", "datos": { "cliente_id": "C001", "cliente": "Samaco", "monto": 2000000, "mes": "ABR 26", "fecha": "2026-04-03", "canal": "TRANSFERENCIA" }, "confirmacion": "✅ Cobro registrado: Samaco pagó $2.000.000 — ABR 26", "necesita_confirmacion": false }

SUELDO (UN empleado):
{ "accion": "SUELDO", "datos": { "nombre": "Vicente", "rol": "Diseño", "monto": 850000, "mes": "ABR 26" }, "confirmacion": "✅ Sueldo Vicente $850.000 — ABR 26", "necesita_confirmacion": false }

SUELDO_MULTIPLE (varios empleados en un mensaje):
{ "accion": "SUELDO_MULTIPLE", "datos": { "sueldos": [ { "nombre": "Vicente", "monto": 850000 }, { "nombre": "Pau", "monto": 100000 } ], "mes": "ABR 26" }, "confirmacion": "✅ Sueldos registrados: Vicente $850.000, Pau $100.000 — ABR 26", "necesita_confirmacion": false }

TARIFA:
{ "accion": "TARIFA", "datos": { "cliente_id": "C001", "cliente": "Samaco", "monto_anterior": 2000000, "monto_nuevo": 2500000, "desde_mes": "MAY 26" }, "confirmacion": "✅ Tarifa actualizada: Samaco pasa a $2.500.000 desde MAY 26 (+$500.000, +25%)", "necesita_confirmacion": true }

ALTA_EMPLEADO:
{ "accion": "ALTA_EMPLEADO", "datos": { "nombre": "Martina", "rol": "Diseñadora", "tipo": "Factura", "monto": 400000, "desde_mes": "MAY 26" }, "confirmacion": "✅ Martina agregada como Diseñadora a $400.000 desde MAY 26", "necesita_confirmacion": true }

BAJA_EMPLEADO:
{ "accion": "BAJA_EMPLEADO", "datos": { "nombre": "Vicente", "desde_mes": "MAY 26", "motivo": "Fin contrato" }, "confirmacion": "✅ Vicente dado de baja desde MAY 26", "necesita_confirmacion": true }

ALTA_HERRAMIENTA:
{ "accion": "ALTA_HERRAMIENTA", "datos": { "nombre": "Notion", "categoria": "Productividad", "monto": 25000, "desde_mes": "MAY 26" }, "confirmacion": "✅ Notion agregado a $25.000/mes desde MAY 26", "necesita_confirmacion": false }

BAJA_HERRAMIENTA:
{ "accion": "BAJA_HERRAMIENTA", "datos": { "nombre": "Higgsfield", "desde_mes": "MAY 26" }, "confirmacion": "✅ Higgsfield cancelado desde MAY 26", "necesita_confirmacion": false }

CONSULTA (estado de caja):
{ "accion": "CONSULTA", "datos": { "tipo": "CAJA" }, "confirmacion": "💰 Consultando caja...", "necesita_confirmacion": false }

CONSULTA (lista de empleados):
{ "accion": "CONSULTA", "datos": { "tipo": "EQUIPO" }, "confirmacion": "👥 Consultando equipo...", "necesita_confirmacion": false }

CONSULTA (cobros del mes):
{ "accion": "CONSULTA", "datos": { "tipo": "COBROS" }, "confirmacion": "📋 Consultando cobros...", "necesita_confirmacion": false }

AJUSTE_CAJA (para registrar un saldo inicial o corrección de caja):
{ "accion": "AJUSTE_CAJA", "datos": { "monto": 453060, "descripcion": "Saldo inicial ABR 26" }, "confirmacion": "✅ Saldo de caja ajustado a $453.060", "necesita_confirmacion": true }

DUDA (cuando el mensaje no es claro):
{ "accion": "DUDA", "datos": {}, "confirmacion": "❓ No entendí bien. ¿Podés aclarar?", "necesita_confirmacion": false }`;

/**
 * Llama a Claude con historial de conversación incluido.
 * @param {string} userMessage - El mensaje actual del usuario
 * @param {string} from - JID del chat (para mantener historial)
 */
async function interpretMessage(userMessage, from) {
  const client = getClient();
  const model = process.env.CLAUDE_MODEL || 'claude-opus-4-6';

  logger.info('CLAUDE', 'Enviando mensaje a Claude', { model, preview: userMessage.slice(0, 80) });

  // Inyectar contexto dinámico desde el sheet
  const dinamico = await loadContext();
  const prompt = SYSTEM_PROMPT.replace('{{CONTEXTO_DINAMICO}}', dinamico);

  // Construir array de mensajes con historial
  const history = getHistory(from);
  const messages = [...history, { role: 'user', content: userMessage }];

  // Agregar al historial
  addToHistory(from, 'user', userMessage);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: prompt,
      messages,
    });

    const text = response.content?.find(b => b.type === 'text')?.text || '';
    logger.info('CLAUDE', 'Respuesta recibida', { preview: text.slice(0, 120) });

    // Agregar respuesta al historial
    addToHistory(from, 'assistant', text);

    return text;
  } catch (err) {
    logger.error('CLAUDE', 'Error en llamada a Claude API', { err: err.message });
    throw err;
  }
}

/**
 * Genera un mensaje personalizado de cobro para un cliente.
 */
async function generateCobrosMessage(cliente, mes, monto, vto, tipo) {
  const client = getClient();
  const model = process.env.CLAUDE_MODEL || 'claude-opus-4-6';

  const prompt = `Generá un mensaje de WhatsApp ${tipo} para cobrar a ${cliente} el servicio de ${mes} por $${monto}. Vencimiento día ${vto}. Sé cordial y profesional. Máximo 4 líneas. No uses asteriscos ni markdown.`;

  const response = await client.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content?.find(b => b.type === 'text')?.text || '';
}

/**
 * Genera el resumen de cierre de mes.
 */
async function generateCierreResumen(ingresos, egresos, resultado, saldo, morosos) {
  const client = getClient();
  const model = process.env.CLAUDE_MODEL || 'claude-opus-4-6';

  const prompt = `Generá un resumen de cierre de mes para la agencia Pinta en español rioplatense. Datos: Ingresos: $${ingresos}, Egresos: $${egresos}, Resultado: $${resultado}, Saldo de caja: $${saldo}. Morosos: ${morosos.join(', ') || 'ninguno'}. Sé conciso y profesional.`;

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content?.find(b => b.type === 'text')?.text || '';
}

module.exports = { interpretMessage, generateCobrosMessage, generateCierreResumen, clearHistory, SYSTEM_PROMPT };
