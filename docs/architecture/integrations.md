# Gastos App — Integraciones

## Servicios externos

### n8n (webhook de gastos)

| Aspecto | Detalle |
|---------|---------|
| Dirección | Cliente (browser) → webhook n8n |
| Variable | `VITE_N8N_WEBHOOK_URL` |
| Método | POST |
| Payload request | `{ since: "YYYY-MM-DD" }` (desde `localStorage.lastSync`) |
| Payload response | `{ entries: Gasto[], syncedAt: string }` o array con un elemento |
| Persistencia | Tras revisión UI → `POST /api/datos?clave=gastos` |
| Dedup | `GET /api/gastos/sync-keys` + clave `fecha\|motivo` |

**Riesgos:**

- URL del webhook embebida en bundle frontend (`VITE_*`).
- Sin autenticación documentada hacia n8n (GAP).
- Dependencia de formato de respuesta n8n estable.

**GAP:** documentar workflow n8n (nodos, fuentes bancarias, transformaciones).

### PostgreSQL

| Aspecto | Detalle |
|---------|---------|
| Variable | `DATABASE_URL` |
| Cliente | `postgres` npm en `server/db/client.js` |
| SSL | `require` en prod si URL sin `sslmode=` |
| Schema | `server/db/schema.pg.sql` vía `initSchema()` |

### Coolify (deploy — objetivo)

| Aspecto | Detalle |
|---------|---------|
| Config | Nixpacks/buildpack (sin Dockerfile), igual patrón que Railway hoy |
| Build | `bun install && bun run build` |
| Start | `bun run start` → `server/index.js` |
| Variables | `DATABASE_URL`, `ACCESS_TOKEN` (legacy), `PASSKEY_RP_ID`, `PASSKEY_RP_NAME`, `PASSKEY_ORIGIN`, `PASSKEY_BOOTSTRAP_SECRET`, `SESSION_MAX_AGE_SECONDS`, `NODE_ENV=production`, etc. |

`railway.json` es la config histórica (Railway); el despliegue real objetivo es Coolify — ver
`docs/operations/deployment.md`.

## APIs internas (REST)

Todas bajo `/api/*`. Ver `docs/context/context.md` sección API.

Principales grupos:

- Gastos CRUD + sync-keys + duplicados
- Presupuesto por ciclo financiero (`GET /api/presupuesto/ciclos`, `GET/PUT /api/presupuesto/:ciclo`)
- Gastos por ciclo (`GET /api/gastos?ciclo=YYYY-MM`) con filtro calendario secundario combinable (`&mes=YYYY-MM`)
- Reconciliación de tarjeta (`GET /api/tarjeta/resumen`, `POST /api/tarjeta/conciliar|desconciliar|pagar`) — totales derivados y operaciones atómicas para Edwards/BICE
- Reserva de tarjeta legacy (`GET/PUT /api/reserva-tarjeta`) — referencia manual de transición, fuera de los cálculos derivados
- Catálogos CRUD
- Reglas de mapeo CRUD + test
- Autenticación (`/api/auth/*`) — ver detalle abajo

### Reconciliación de tarjetas (F5)

Limitada a Edwards y BICE; CLP y USD se calculan y validan por separado. Todos los endpoints
quedan detrás del gate global normal.

| Endpoint | Payload | Efecto |
|----------|---------|--------|
| `GET /api/tarjeta/resumen` | — | Totales globales/por banco y desglose por categoría derivados de gastos no pagados/no descartados |
| `POST /api/tarjeta/conciliar` | `{ banco, moneda, total_estado, gasto_ids }` | Verifica el total seleccionado y marca `conciliado=true` atómicamente |
| `POST /api/tarjeta/desconciliar` | `{ banco, moneda, gasto_ids }` | Revierte la conciliación mientras ningún movimiento esté pagado |
| `POST /api/tarjeta/pagar` | `{ banco, moneda, total_pagado, gasto_ids }` | Verifica movimientos previamente conciliados y marca `pagado=true` atómicamente |

Los descuadres responden `409` con `total_calculado` y `diferencia`, sin cambios parciales.
CLP se compara en pesos enteros y USD en centavos. `split` es CLP y no reduce la deuda de la
tarjeta; solo modifica `por_cobrar` y el impacto presupuestario.

### Autenticación (`/api/auth/*`)

Router independiente (`server/routes/auth.js`), montado antes del gate global — cada endpoint
aplica su propio control (bootstrap secret, sesión, o público sin secretos).

| Endpoint | Gate | Descripción |
|----------|------|-------------|
| `GET /api/auth/status` | público | `{ authenticated, passkeyConfigured, bootstrapRequired }` |
| `POST /api/auth/passkey/register/options` | bootstrap secret (0 passkeys) o sesión | Inicia registro (bootstrap o passkey adicional) |
| `POST /api/auth/passkey/register/verify` | ídem | Verifica y persiste la credencial; crea sesión si fue bootstrap |
| `POST /api/auth/passkey/login/options` | público | `409` si no hay passkeys; si no, opciones de login (discoverable) |
| `POST /api/auth/passkey/login/verify` | público | Verifica la firma, crea sesión |
| `POST /api/auth/logout` | — | Revoca la sesión actual (no-op seguro si no hay sesión) |
| `GET /api/auth/passkeys` | sesión | Lista sin exponer `credential_id`/`public_key` |
| `DELETE /api/auth/passkeys/:id` | sesión | Bloquea si quedaría 0 passkeys (`400`) |

Una vez registrada la primera passkey, `PASSKEY_BOOTSTRAP_SECRET` deja de aceptarse por
completo (ni siquiera devuelve `409` distinguible — sin sesión, es `401` genérico). Rate
limiting en memoria por IP (ver `docs/architecture/architecture.md` → Riesgos).

## Webhooks entrantes

### `POST /api/ingesta` (n8n → app)

n8n empuja mensajes de Gmail (banco Edwards, notificaciones de compra) directo al servidor,
sin pasar por el cliente. Reemplaza para este flujo el patrón anterior de "browser llama al
webhook n8n" (que sigue existiendo para `useSyncN8n.js`, sin cambios).

| Aspecto | Detalle |
|---------|---------|
| Dirección | n8n (Gmail trigger) → servidor |
| Auth | Header `Authorization: Bearer <INGESTA_TOKEN>` — token dedicado, no passkey ni `ACCESS_TOKEN`. Ver `server/ingesta.js`, `server/auth.js` |
| Payload | El recurso de mensaje de Gmail tal cual (o array de varios) — `id`, `snippet`, `From`, `Subject`, `internalDate`, etc. También acepta el mensaje envuelto en `{ json: {...} }` (forma natural del modo "Using Fields Below" del nodo HTTP Request de n8n) — se desenvuelve en el servidor |
| Idempotencia | `id` del mensaje de Gmail = `gastos.fuente_id` (único); reintentos no duplican |
| Resultado | Gasto con `estado='pendiente'` (o `'error_parseo'` si nada logra extraer los campos) — nunca se confirma automáticamente, queda en la bandeja de `/log` |
| Implementación | `server/ingesta.js` (endpoint) + `server/ingesta/parseEdwardsCompra.js` (parser determinista) + `server/ingesta/groq.js` (fallback IA) |

**GAP:** solo se confirmó el formato de `Subject: "Compra con Tarjeta de Crédito"` de
Edwards; otros asuntos (pagos, abonos, alertas) caen en `error_parseo` hasta agregar su patrón.
**GAP:** el workflow de n8n en sí (Gmail trigger, filtros, reintentos) no vive en este repo —
documentar por separado cuando esté armado.

### `POST /api/agente/chat` (browser → app, F3)

A diferencia de `/api/ingesta`, esto es una sesión interactiva de browser autenticada por el
gate global normal (sesión passkey o `ACCESS_TOKEN`), no un webhook con token propio.

| Aspecto | Detalle |
|---------|---------|
| Dirección | Browser (`/agente`, `useChat` de `@ai-sdk/react`) → servidor |
| Auth | Gate global (misma sesión que el resto de `/api/*` protegido) |
| Payload | `{ messages: UIMessage[] }` — historial de chat en formato AI SDK. Cada mensaje puede traer `parts` de tipo `file` (imágenes, como data URL) además de `text` — el frontend permite adjuntar varias fotos en un mismo envío |
| Respuesta | Stream `UIMessageStreamResponse` (`text/event-stream`) vía `streamText().toUIMessageStreamResponse()` |
| Tools | `buscar_comercio` (consulta `comercio_mapeo`), `crear_gasto` (inserta vía `crearGastoPendiente`, filtra tipos/contexto contra el catálogo real antes de insertar), `buscar_gastos_pendientes` (busca/lista gastos `pendiente`/`error_parseo` de cualquier origen), `editar_gasto` (corrige campos de un gasto encontrado así — sin `estado` en su schema de entrada, y con chequeo server-side de que siga `pendiente`/`error_parseo` antes de tocarlo) |
| Resultado | Gasto con `estado='pendiente'`, `origen='chat'` — crear y editar nunca confirman automáticamente, se revisan en `/bandeja` (embebida también en `/agente`) |
| Implementación | `server/agente.js` + `server/catalogos.js` + `server/comercios.js` + `server/gastos/crear.js` + `server/gastos/actualizar.js` + `server/gastos/pendientes.js` + `server/gastos/serializacion.js` (compartidos con `server/ingesta.js` y `PATCH /api/gastos/:id`) |
| Modelo default | `gpt-5.6-luna` (familia GPT-5.6, variante más rápida/económica — function calling + streaming + visión, 1M de contexto), configurable vía `OPENAI_MODEL`. Si se cambia el modelo, verificar que siga soportando input de imágenes |
| Imágenes | El usuario puede adjuntar una o más fotos de boletas/vouchers en el mismo mensaje. `convertToModelMessages` las pasa al modelo sin transformación adicional — la conversión a `FileUIPart`/data URL ocurre en el cliente (`src/pages/AgentePage.jsx`). El prompt instruye a tratar cada imagen como un gasto potencialmente distinto y a preguntar (no asumir) si el monto de una foto no se lee con claridad |

`POST /api/agente/transcribir` — transcribe una nota de voz grabada en el navegador
(`MediaRecorder`, botón de micrófono en `AgenteChat.jsx`) vía Groq Whisper
(`server/agente/transcripcion.js`). Recibe `multipart/form-data` con el campo `audio` (límite de
20MB vía `hono/body-limit`), devuelve `{ texto }`. El texto se trata en el cliente exactamente
como si el usuario lo hubiera escrito: llena el input del chat, **no se envía solo** — el usuario
lo revisa/edita y aprieta "Enviar". A diferencia de la clasificación best-effort de
`server/ingesta/groq.js`, acá un fallo se propaga como error explícito (503 sin `GROQ_API_KEY`,
502 si Groq falla) porque el usuario está esperando activamente el resultado. Requiere
`GROQ_API_KEY` (la misma que clasificación); modelo configurable vía `GROQ_WHISPER_MODEL`
(default `whisper-large-v3-turbo`).

## AI / OCR

**Groq** (`server/ingesta/groq.js`, `server/agente/transcripcion.js`) — dos usos: clasificación
automática y fallback de extracción para gastos ingresados vía `/api/ingesta` (best-effort, nunca
bloquea la ingesta ni confirma un gasto por sí solo — ver invariante en `server/ingesta.js`), y
transcripción de notas de voz del chat del agente (`POST /api/agente/transcribir`, no
best-effort: un fallo se muestra al usuario). Variable `GROQ_API_KEY` (opcional — sin ella, la
ingesta sigue funcionando solo con el parser determinista, y el botón de nota de voz responde 503).

**OpenAI** (`server/agente.js`) — agente conversacional F3, con tool calling y streaming.
Proveedor separado de Groq a propósito (ver DEC-011 en `docs/architecture/decisions.md`):
Groq es barato y suficiente para clasificación batch sin tool calling; el agente necesita
tool calling + streaming de pasos en tiempo real, algo que la ingesta de mail no requiere.
Variable `OPENAI_API_KEY` (opcional a nivel infraestructura — sin ella, solo el endpoint del
agente queda deshabilitado con 503; el resto de la app funciona igual).

Ambos clasificadores comparten la misma memoria de comercios (`comercio_mapeo`, ver
`docs/context/data_model_context.md`) como primera etapa de la cascada, antes de llamar a
cualquiera de los dos proveedores.

## Email / pagos / bancos

Los datos bancarios llegan indirectamente vía n8n. GAP: detalle de conexiones bancarias en n8n.

## Credenciales requeridas

| Credencial | Dónde | Entorno |
|------------|-------|---------|
| `DATABASE_URL` | Coolify / .env | Todos |
| `ACCESS_TOKEN` | Coolify / .env | Producción (legacy, en paralelo — ver DEC-009) |
| `PASSKEY_RP_ID`, `PASSKEY_RP_NAME`, `PASSKEY_ORIGIN` | Coolify / .env | Producción (dev usa defaults `localhost`) |
| `PASSKEY_BOOTSTRAP_SECRET` | Coolify / .env | Todos (solo se usa mientras no exista ninguna passkey) |
| `VITE_N8N_WEBHOOK_URL` | .env (build time) | Dev + prod |
| `CORS_ORIGIN` | .env | Dev (default localhost:6001) |
| `INGESTA_TOKEN` | Coolify / .env | Todos (requerida para que `POST /api/ingesta` acepte requests) |
| `GROQ_API_KEY` | Coolify / .env | Todos (opcional — clasificación de ingesta y transcripción de voz) |
| `GROQ_WHISPER_MODEL` | Coolify / .env | Todos (opcional, default `whisper-large-v3-turbo`) |
| `OPENAI_API_KEY` | Coolify / .env | Todos (opcional — sin ella, `/api/agente/chat` responde 503) |

## Entornos

| Integración | Local | Producción |
|-------------|-------|------------|
| PostgreSQL | Local o remoto | Managed (proveedor exacto: GAP) |
| n8n | Misma URL o instancia dev | Instancia prod (GAP) |
| Coolify | N/A | Deploy objetivo (Nixpacks/buildpack) |

## Gaps

- GAP: instancia n8n exacta y credenciales de workflows.
- GAP: monitoreo de salud del webhook n8n.
- GAP: proveedor PostgreSQL confirmado.
- GAP: dominio real de producción para `PASSKEY_RP_ID`/`PASSKEY_ORIGIN`.
