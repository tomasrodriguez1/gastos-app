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
- Pagos de tarjeta (`GET /api/tarjeta/resumen`, `POST /api/tarjeta/pagar`) — totales derivados y pago atómico para Edwards/BICE
- Fondo de tarjetas (`GET /api/tarjeta/fondo`, `POST /api/tarjeta/fondo/aportes`, `PUT /api/tarjeta/fondo/saldo`, `DELETE /api/tarjeta/fondo/movimientos/:id`) — fondo común manual por moneda; `pagar` descuenta automáticamente
- Reserva de tarjeta legacy (`GET/PUT /api/reserva-tarjeta`) — LEGACY, ya no usado por la UI; se conserva por el dato histórico
- Reservas de ahorro F6 (`GET/POST /api/reservas`, `PATCH /api/reservas/:id`, `GET/POST /api/reservas/:id/saldos`) — bolsillos externos (Mercado Pago); UI en `/fondos` además del agente. `POST /:id/saldos` (`{ monto, fecha }`) es el camino manual — registra con `origen='manual'`, usando la misma `registrarSaldo()` que ya usaba el agente con `origen='foto_agente'`. La respuesta (y cada fila de `GET /:id/saldos`) incluye `retiros`/`crecimiento`: el desglose de cuánto de la diferencia fueron gastos de la categoría vinculada vs rendimiento estimado
- Ingresos reales (`GET /api/ingresos?ciclo=YYYY-MM`, `POST /api/ingresos`, `PATCH/DELETE /api/ingresos/:id`) — registro manual (UI en `/presupuesto`) o por el agente (`origen='chat'`); separado de `presupuesto_ingreso` (previsión, se reescribe cada PUT)
- Aportes a fondos de ahorro sin vincular (`GET/POST /api/fondos-ahorro/:nombre/movimientos`) — log informativo de cada "+ Aportar" manual en el Dashboard/`/fondos`; no reemplaza `presupuesto_fondo.acumulado`, que sigue siendo el saldo autoritativo
- FGP — Fondo Gastos Previstos (`GET/POST /api/fgp/movimientos`, `DELETE /api/fgp/movimientos/:id`, `POST /api/fgp/traspasos`) — libro de lo no derivable del FGP (DEC-016). `POST /movimientos` (`{ tipo: 'cobertura'|'deficit'|'ajuste', ciclo, monto, fecha?, origen?, fondo_nombre?, nota? }`; `fondo_nombre` solo en cobertura y además inserta un `ajuste` negativo en `fondo_ahorro_movimiento`). `POST /traspasos` (`{ gasto_ids, modo: 'mover'|'marcar' }`): `mover` crea un único aporte CLP en `fondo_tarjeta_movimiento` por el total (`montoDelCiclo` de cada gasto, solo bancos Edwards/BICE) y una fila `traspaso_tc` por gasto; `marcar` solo deja la fila. Omite (y lo informa en `omitidos`) ids inexistentes o ya movidos. `DELETE` de un traspaso real borra su aporte de tarjeta (el lote completo vuelve a pendiente); el de una cobertura desde fondo borra su salida del fondo
- Catálogos CRUD
- Reglas de mapeo CRUD + test
- Autenticación (`/api/auth/*`) — ver detalle abajo

### Pagos de tarjetas (F5)

Limitada a Edwards y BICE; CLP y USD se calculan y validan por separado. Todos los endpoints
quedan detrás del gate global normal.

| Endpoint | Payload | Efecto |
|----------|---------|--------|
| `GET /api/tarjeta/resumen` | — | Totales globales/por banco y desglose por categoría derivados de gastos no pagados/no descartados |
| `POST /api/tarjeta/pagar` | `{ banco, moneda, total_pagado, gasto_ids }` | Verifica banco, moneda, IDs y total; marca `pagado=true` y registra un movimiento `pago` (−total) en `fondo_tarjeta_movimiento`, todo atómicamente |
| `GET /api/tarjeta/fondo` | — | `{ saldos: { CLP, USD }, movimientos: [últimos 50] }` |
| `POST /api/tarjeta/fondo/aportes` | `{ moneda, monto > 0, fecha?, nota? }` | Registra un aporte manual |
| `PUT /api/tarjeta/fondo/saldo` | `{ moneda, saldo }` | Lleva el saldo a un valor absoluto registrando la diferencia como `ajuste` |
| `DELETE /api/tarjeta/fondo/movimientos/:id` | — | Borra un aporte/ajuste; 409 si es un `pago` |

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
| Resultado | Gasto con `estado='pendiente'` (o `'error_parseo'` si nada logra extraer los campos) — nunca se confirma automáticamente, queda en la bandeja de `/bandeja` y `/log` |
| Clasificación | Solo si quedó `pendiente`: memoria `comercio_mapeo` → clasificador del agente (`server/ingesta/agente.js`, mismo `OPENAI_MODEL`) → Groq `clasificarGasto` si el agente no está, falla o devuelve vacío → sin tipos si tampoco hay Groq. Grupo/subcategoría no se guardan: salen de `tipos` + `contexto` vía `src/utils/mapeo.js`. El prompt del agente incluye ese mapeo |
| Implementación | `server/ingesta.js` (endpoint) + `server/ingesta/parseEdwardsCompra.js` (parser determinista) + `server/ingesta/agente.js` (clasificación) + `server/ingesta/groq.js` (extracción y clasificación de respaldo) |
| Timeout n8n | El nodo HTTP conviene dejarlo en ~30s: la clasificación del agente tiene tope de 15s y, si falla, puede seguir Groq |

Contrato que n8n debe postear (el workflow en sí — trigger de Gmail, filtros, reintentos — no vive en este repo):

- `POST https://<app>/api/ingesta`
- Header `Authorization: Bearer <INGESTA_TOKEN>`
- Body: mensaje de Gmail con `id`, `snippet`, `From`, `Subject`, `internalDate`, o ese objeto envuelto en `{ json: {...} }`, o un array de varios
- Filtro de compras: el formato firme es Edwards, asunto `Compra con Tarjeta de Crédito`, remitente con `bancoedwards.cl`

**GAP:** solo se confirmó el formato de `Subject: "Compra con Tarjeta de Crédito"` de
Edwards; otros asuntos (pagos, abonos, alertas) caen en `error_parseo` hasta agregar su patrón.
**GAP:** el workflow de n8n en sí (Gmail trigger, filtros, reintentos) no vive en este repo.

### `POST /api/ingesta/telefono` (atajo iOS → app)

Misma auth, misma clasificación y misma bandeja que `/api/ingesta`. El teléfono no manda un mail: manda el comercio y el monto que extrajo un modelo on-device de una notificación de compra BICE. El banco queda fijo en `BICE`. La fecha es el día de la llamada en `America/Santiago`.

| Aspecto | Detalle |
|---------|---------|
| Dirección | Atajo de iOS → servidor |
| Auth | Header `Authorization: Bearer <INGESTA_TOKEN>` — el mismo token que el mail |
| Payload | `{ "data": { "comercio", "monto" } }`. `data` puede ser ese objeto o el JSON en texto (lo que devuelve el modelo del atajo). También se aceptan `comercio` y `monto` en la raíz |
| Monto | Número o texto CLP (`4500`, `"4.500"`, `"$4.500"`). No es USD |
| Idempotencia | `fuente_id` = `telefono:BICE:{fecha}:{comercio normalizado}:{monto}`. La misma compra el mismo día no se inserta dos veces. Dos compras distintas del mismo comercio, monto y día tampoco: la segunda responde `duplicado: true` |
| Resultado | Gasto `estado='pendiente'`, `origen='telefono'`, `banco='BICE'`. Nunca se confirma solo. Si faltan comercio o monto, `400` y no se inserta nada |
| Clasificación | La misma cascada: memoria → agente → Groq → sin tipos |

### `POST /api/agente/chat` (browser → app, F3)

A diferencia de `/api/ingesta`, esto es una sesión interactiva de browser autenticada por el
gate global normal (sesión passkey o `ACCESS_TOKEN`), no un webhook con token propio.

| Aspecto | Detalle |
|---------|---------|
| Dirección | Browser (`/agente`, `useChat` de `@ai-sdk/react`) → servidor |
| Auth | Gate global (misma sesión que el resto de `/api/*` protegido) |
| Payload | `{ messages: UIMessage[] }` — historial de chat en formato AI SDK. Cada mensaje puede traer `parts` de tipo `file` (imágenes, como data URL) además de `text` — el frontend permite adjuntar varias fotos en un mismo envío |
| Respuesta | Stream `UIMessageStreamResponse` (`text/event-stream`) vía `streamText().toUIMessageStreamResponse()` |
| Tools | `buscar_comercio` (consulta `comercio_mapeo`), `crear_gasto` (inserta vía `crearGastoPendiente` salvo duplicado: `buscarSimilares` bloquea el insert y pide `ignorar_duplicado` si el usuario insiste), `buscar_gastos_pendientes` (lista `pendiente`/`error_parseo` con filtros banco/estado/tipos y offset), `resumir_bandeja` (conteos agregados de la bandeja), `editar_gasto` (corrige campos — sin `estado` en su schema, chequeo server-side de que siga pendiente), `resumen_ciclo` / `buscar_gastos` (solo lectura del ciclo: semáforos y búsqueda por motivo/grupo), `listar_reservas` / `crear_reserva` / `editar_reserva` / `listar_saldos_reserva` / `registrar_saldos_reserva` (bolsillos F6: catálogo + saldos; `crear_reserva` valida grupo/subcategoría contra catálogo y no crea `presupuesto_fondo`) |
| Resultado | Gasto con `estado='pendiente'`, `origen='chat'` — crear y editar nunca confirman automáticamente, se revisan en `/bandeja` (embebida también en `/agente`). Consultas de ciclo no escriben. |
| Implementación | `server/agente.js` + `server/duplicados.js` (`buscarSimilares`) + `server/consultas/ciclo.js` + `server/presupuesto/leer.js` + `server/catalogos.js` + `server/comercios.js` + `server/gastos/crear.js` + `server/gastos/actualizar.js` + `server/gastos/pendientes.js` + `server/gastos/serializacion.js` |
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

**Groq** (`server/ingesta/groq.js`, `server/agente/transcripcion.js`) — dos usos en la ingesta:
fallback de extracción de campos cuando el parser no reconoce el mail, y clasificación de
respaldo si el clasificador del agente no devuelve tipos/contexto (best-effort, nunca bloquea
la ingesta ni confirma un gasto por sí solo — ver invariante en `server/ingesta.js`). También
transcribe notas de voz del chat (`POST /api/agente/transcribir`, no best-effort: un fallo se
muestra al usuario). Variable `GROQ_API_KEY` (opcional — sin ella, la extracción queda en el
parser determinista y la clasificación, en el agente o sin tipos; el botón de nota de voz
responde 503).

**OpenAI** (`server/agente.js`, `server/ingesta/agente.js`) — dos usos del mismo modelo
(`OPENAI_MODEL`): el agente conversacional F3, con tool calling y streaming (DEC-011), y la
clasificación one-shot de un mail cuyo comercio no está en memoria (DEC-012). Esa clasificación
no abre chat, no streamea y no escribe: si falta la key, el modelo falla o devuelve vacío, la
ingesta sigue con Groq. Variable `OPENAI_API_KEY` (opcional — sin ella, `POST /api/agente/chat`
responde 503; la ingesta de mail no se corta).

La memoria de comercios (`comercio_mapeo`, ver `docs/context/data_model_context.md`) es la
primera etapa de la cascada, antes del agente y de Groq. En el mail: memoria → agente → Groq
→ sin clasificar.

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
| `GROQ_API_KEY` | Coolify / .env | Todos (opcional — extracción y clasificación de respaldo en la ingesta, y transcripción de voz) |
| `GROQ_WHISPER_MODEL` | Coolify / .env | Todos (opcional, default `whisper-large-v3-turbo`) |
| `OPENAI_API_KEY` | Coolify / .env | Todos (opcional — sin ella, `/api/agente/chat` responde 503 y la ingesta clasifica con Groq o sin tipos) |

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
