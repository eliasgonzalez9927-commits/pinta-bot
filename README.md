# Hernán Bot — Pinta Agencia de Marketing

Bot administrativo para WhatsApp que automatiza las tareas de administración de Pinta. Interpreta mensajes en lenguaje natural y actualiza Google Sheets automáticamente.

## Stack

- **Node.js 18+** + **Express** — servidor webhook
- **Claude API (claude-opus-4-6)** — interpretación de mensajes
- **Google Sheets API** — base de datos operativa
- **WhatsApp Business API (360dialog)** — canal de mensajes
- **node-cron** — jobs automáticos de cobros y cierre de mes

---

## Instalación

```bash
git clone <repo>
cd pinta-bot
npm install
cp .env.example .env
# Editar .env con las credenciales reales
node index.js
```

---

## Configuración del .env

| Variable | Descripción |
|---|---|
| `WHATSAPP_API_KEY` | API Key de 360dialog |
| `WHATSAPP_PHONE_ID` | Phone Number ID de 360dialog |
| `WHATSAPP_GROUP_ID` | ID del grupo interno de admins |
| `ANTHROPIC_API_KEY` | API Key de Anthropic |
| `CLAUDE_MODEL` | Modelo de Claude (default: `claude-opus-4-6`) |
| `GOOGLE_SHEET_ID` | ID del Google Sheet de Pinta |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON completo de la service account de Google |
| `PORT` | Puerto del servidor (default: 3000) |

### Obtener GOOGLE_SERVICE_ACCOUNT_JSON

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear o seleccionar un proyecto
3. Habilitar **Google Sheets API**
4. Crear una **Service Account** con rol Editor
5. Generar una clave JSON y copiar todo el contenido como string en la variable
6. Compartir el Google Sheet con el email de la service account

### Configurar webhook en 360dialog

En el panel de 360dialog, configurar el webhook URL como:
```
https://tu-dominio.com/webhook
```

---

## Estructura del proyecto

```
pinta-bot/
├── index.js                  # Servidor Express + webhook principal
├── .env                      # Variables de entorno (no subir a git)
├── .env.example              # Template de variables
├── package.json
├── /src
│   ├── whatsapp.js           # Cliente de WhatsApp API (360dialog)
│   ├── claude.js             # Cliente de Claude API + system prompt
│   ├── sheets.js             # Cliente de Google Sheets API
│   ├── /handlers
│   │   ├── gastos.js         # Registro de gastos
│   │   ├── cobros.js         # Registro de cobros
│   │   ├── sueldos.js        # Distribución de sueldos
│   │   ├── tarifas.js        # Cambios de tarifa
│   │   ├── empleados.js      # Alta/baja/aumento de empleados
│   │   ├── herramientas.js   # Alta/baja de herramientas
│   │   └── consultas.js      # Consultas de caja
│   ├── /cron
│   │   ├── cobros-auto.js    # Jobs días 1, 5, 10, 15
│   │   └── cierre-mes.js     # Cierre de caja día 1
│   └── /utils
│       ├── parser.js         # Parsea JSON de respuestas de Claude
│       ├── formatter.js      # Formatos ARS, fechas, IDs
│       └── logger.js         # Logs con timestamp en /logs/
└── /test
    ├── gastos.test.js
    ├── cobros.test.js
    ├── formatter.test.js
    └── parser.test.js
```

---

## Comandos que entiende Hernán

Hernán entiende mensajes en lenguaje natural. Ejemplos:

| Mensaje | Acción |
|---|---|
| `"Samaco pagó los 2 palos"` | Registra cobro de Samaco |
| `"Pagué el ChatGPT, $30.000"` | Registra gasto en Herramientas |
| `"Samaco sube a $2.500.000 desde mayo"` | Solicita confirmación de cambio de tarifa |
| `"Alta Martina, diseñadora, $400k, factura"` | Da de alta empleado (con confirmación) |
| `"Baja Vicente desde mayo"` | Da de baja empleado (con confirmación) |
| `"Alta herramienta Notion, $25.000/mes"` | Registra nueva herramienta |
| `"Baja Higgsfield"` | Da de baja herramienta |
| `"¿Cómo está la caja?"` | Muestra estado de caja del mes |

### Confirmaciones

Las acciones con `necesita_confirmacion: true` (tarifas, altas/bajas de empleados) esperan que el equipo responda **SÍ** o **NO** dentro de 5 minutos antes de ejecutarse.

---

## Cron Jobs automáticos

| Día | Hora | Acción |
|---|---|---|
| 1 | 8:00 AM | Cierre del mes anterior + envío al grupo |
| 1 | 9:00 AM | Resetea estados + envía recordatorios a clientes |
| 5 | 9:00 AM | Recordatorio a clientes PENDIENTE |
| 10 | 9:00 AM | Vencimiento — marca ATRASADO + aviso fuerte |
| 15 | 9:00 AM | Aviso final + notificación al grupo para acción manual |

Todos los jobs usan la zona horaria `America/Argentina/Buenos_Aires`.

---

## Hojas de Google Sheets

El bot **solo escribe** en estas hojas:

- `CLIENTES` — Estado de cobros del mes actual
- `GASTOS` — Registro de todos los gastos
- `EMPLEADOS` — Estado de pagos del equipo
- `COBROS_HISTORIAL` — Historial de cobros por mes
- `ASIENTO_CONTABLE` — Libro contable automático
- `TARIFAS_HISTORIAL` — Historial de cambios de tarifa
- `EMPLEADOS_HISTORIAL` — Historial de altas/bajas/aumentos
- `HERRAMIENTAS_HISTORIAL` — Historial de herramientas

**NUNCA toca:** `25-26`, `PROYECCION 26-27`, `DASHBOARD`, `SUPUESTOS`, `ANALISIS & TIPS`

---

## Deploy

### Con PM2 (recomendado)

```bash
npm install -g pm2
pm2 start index.js --name pinta-bot
pm2 save
pm2 startup
```

### Con Docker

```bash
docker build -t pinta-bot .
docker run -d --env-file .env -p 3000:3000 pinta-bot
```

---

## Tests

```bash
npm test
```

Los tests usan el runner nativo de Node.js (`node:test`) sin dependencias externas.

---

## Logs

Los logs se guardan en `logs/pinta-YYYY-MM-DD.log` con formato:

```
[2026-04-01 09:15:23] [OK   ] [COBROS] Cobro CO011 registrado | {"cliente":"Samaco","monto":2000000}
```

---

## Seguridad

- El webhook verifica la firma HMAC-SHA256 de 360dialog en cada request
- Solo responde mensajes del grupo interno (por `WHATSAPP_GROUP_ID`)
- Las credenciales van en `.env` (nunca en el código)
- Las hojas históricas están protegidas con una lista de hojas permitidas
