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

### Railway (deploy)

| Aspecto | Detalle |
|---------|---------|
| Config | `railway.json` en la raíz, sin Dockerfile (builder por defecto de Railway) |
| Build | `bun install && bun run build` |
| Start | `bun run start` → `server/index.js` |
| Variables | `DATABASE_URL`, `ACCESS_TOKEN` (legacy), `PASSKEY_RP_ID`, `PASSKEY_RP_NAME`, `PASSKEY_ORIGIN`, `PASSKEY_BOOTSTRAP_SECRET`, `SESSION_MAX_AGE_SECONDS`, `NODE_ENV=production`, etc. |

Detalle del proceso en `docs/operations/deployment.md`.

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

## Agente por Telegram (`/api/agente/telegram/*`, n8n como tubo)

El mismo agente de `/agente` (`construirAgente` en `server/agente.js`: modelo, prompt, 14 tools,
tope de 16 pasos) atiende un chat personal de Telegram. n8n solo transporta: no tiene nodo AI
Agent ni modelo de chat. La app además avisa proactivamente cuando la ingesta de tarjeta inserta
un gasto "flaco". Decisión en DEC-018.

Auth de los tres endpoints entrantes: `Authorization: Bearer <TELEGRAM_AGENTE_TOKEN>`,
timing-safe, montados antes del gate global y exentos de él. Sin token configurado o sin Bearer
correcto: 401 siempre, también en dev. Body JSON, límite 64KB. Implementación en
`server/telegram.js` y `server/telegram/`.

### Aviso de gasto flaco (app → n8n → Telegram)

Se dispara solo cuando `POST /api/ingesta` (Edwards, `origen='mail'`) o
`POST /api/ingesta/telefono` (BICE, `origen='telefono'`) **insertan** un gasto nuevo. Un
duplicado por `fuente_id` no avisa, y tampoco avisan los orígenes chat, manual, mcp ni sync.

| Aspecto | Detalle |
|---------|---------|
| Flaco | Después de guardar, si se cumple cualquiera: `estado='error_parseo'`, no hubo hit en `comercio_mapeo` (tipos/contexto los puso el modelo), o `contexto` vacío. Con hit de memoria y contexto lleno no se avisa |
| Texto | Lo redacta el modelo del agente (`OPENAI_MODEL`, un paso, sin tools): texto plano en español de Chile, comercio, monto, banco y una sola pregunta por lo que falta. Si es `error_parseo`, dice que no se pudo leer y pide comercio y monto. Sin `OPENAI_API_KEY`, o si el modelo falla o devuelve vacío, usa una plantilla fija |
| Destino | `POST N8N_TELEGRAM_AVISO_URL`, header `Authorization: Bearer <TELEGRAM_AGENTE_TOKEN>` (secreto compartido; el Webhook de n8n lo valida con Header Auth). Timeout 15s, porque el webhook espera a que Telegram envíe |
| Respuesta esperada | La salida del nodo Telegram (Webhook con "Respond: When Last Node Finishes" + "First Entry JSON"). La app lee `message_id` y `chat.id` (en la raíz o dentro de `result`) y registra sola `telegram_avisos` y el texto en el historial `telegram:<chat.id>`. Si la respuesta no trae el mensaje, el aviso igual llega, pero contestarlo cae como turno normal |
| Payload | `{ gastoId, origen: 'mail'\|'telefono', banco, fecha, motivo, monto, usd, tipos, contexto, flaco: true, razones: ('error_parseo'\|'sin_memoria'\|'sin_contexto')[], texto }` |
| Cardinalidad | Un gasto, un POST, un mensaje. Sin agrupar ni ventanas de tiempo |
| Fallos | Best-effort: la ingesta lo dispara sin esperar (fire-and-forget) y ningún fallo de modelo, red o n8n la afecta. Sin `N8N_TELEGRAM_AVISO_URL` no se lee el gasto ni se llama al modelo |

### `POST /api/agente/telegram/aviso` (manual → app)

Body `{ gastoId }`. Evalúa el gasto con la misma regla, redacta el texto y lo envía a n8n si
hay URL configurada. Si no hay hit de memoria registrado, lo recalcula contra `comercio_mapeo`.
Responde `{ ok, flaco, razones, texto, enviado }`. 404 si el gasto no existe y 409 si ya no está
`pendiente`/`error_parseo`. Sirve para reenviar a mano un aviso perdido o probar la redacción.

### `POST /api/agente/telegram/avisos` (respaldo, externo → app)

No forma parte del flujo normal: la app registra el aviso sola con la respuesta del webhook. Sirve
para registrarlo desde afuera si esa respuesta no trajo el mensaje enviado.

| Aspecto | Detalle |
|---------|---------|
| Body | `{ gastoId, chatId, messageId, texto? }` — `messageId` es el `message_id` que devolvió Telegram al enviar el aviso. `chatId`/`messageId` aceptan número o texto numérico |
| Efecto | Upsert en `telegram_avisos` `(chat_id, message_id) → gasto_id`. Si viene `texto`, lo agrega al historial de `telegram:<chatId>` como mensaje `assistant` (id fijo `aviso:<chatId>:<messageId>`, un reintento lo pisa) |
| Errores | 400 si faltan campos, 404 si el gasto no existe, 409 si ya no está `pendiente`/`error_parseo` (no guarda nada) |
| Respuesta | `{ ok: true }` |

### `POST /api/agente/telegram/chat` (Telegram → n8n → app)

No reutiliza `POST /api/agente/chat`, que es un stream de sesión de browser con el historial en
el body.

| Aspecto | Detalle |
|---------|---------|
| Body | `{ conversacionId, texto, replyToMessageId? }` — `conversacionId` es el `chat.id` de Telegram; `texto` es el mensaje o la transcripción que hizo n8n; `replyToMessageId` es `message.reply_to_message.message_id` si contesta un mensaje |
| Historial | En el servidor: conversación `telegram:<chat.id>` en `agente_conversaciones`/`agente_mensajes`, mismo formato `UIMessage` que la web (se puede reabrir en `/agente`). Al modelo van los últimos 40 mensajes más el nuevo |
| Reply a un aviso | Si `replyToMessageId` está en `telegram_avisos`, el prompt de ese turno agrega el gasto con sus datos actuales: preguntar solo lo que falta, aplicar con `editar_gasto` (en `campos` solo lo que cambia), sin confirmar. Si `editar_gasto` lo rechaza porque ya no está pendiente, el agente lo dice en una frase y no reintenta. Si no hay registro, sigue como turno normal y lo dice en una frase |
| Agente | Mismo modelo, prompt, tools y tope de 16 pasos que `/api/agente/chat`, sin streaming hacia afuera. Nota de canal: texto plano, sin Markdown. No confirma ni ofrece confirmar gastos |
| Respuesta | `200 { ok: true, texto }`. 400 sin `conversacionId` o `texto`. Si el turno falla (incluido sin `OPENAI_API_KEY`): `502 { ok: false, texto: 'No pude procesar el mensaje, intenta de nuevo.' }`, para que n8n tenga algo que mandar |
| Latencia | Un turno con varias tools puede pasar los 30s: subir el timeout del HTTP Request de n8n (~120s) |

### Forma del workflow n8n (no versionado en el repo)

Un workflow, dos entradas, sin nodo AI Agent ni `lmChatOpenAi`.

**Entrada A, la persona escribe o manda voz:**
1. Telegram Trigger (`updates: message`).
2. If `message.from.username` = `tomas_rodriguez1`. Si no, nodo Telegram con "No estás
   autorizado para ocupar este bot" y fin: el servidor no recibe nada.
3. Set "Voice or Text": `text = message.text` o vacío.
4. If `text` vacío → Telegram Get Voice File (`message.voice.file_id`) → OpenAI Speech to Text.
   Si no, el `text` del Set. La app no transcribe Telegram (no se usa `/api/agente/transcribir`).
5. HTTP Request `POST /api/agente/telegram/chat` con `conversacionId = chat.id`, `texto` y
   `replyToMessageId = message.reply_to_message.message_id` si existe. Bearer
   `TELEGRAM_AGENTE_TOKEN`, timeout ~120s.
6. Telegram send message al mismo chat con `text = texto` de la respuesta, sin `parse_mode` y sin
   atribución de n8n.

**Entrada B, aviso de gasto flaco (dos nodos):**
1. Webhook POST (la URL que va en `N8N_TELEGRAM_AVISO_URL`), con Header Auth
   `Authorization: Bearer <TELEGRAM_AGENTE_TOKEN>`. Respond: "When Last Node Finishes";
   Response Data: "First Entry JSON".
2. Telegram send message al chat personal con `text = {{ $json.body.texto }}`, sin `parse_mode`.
   Un mensaje por gasto. Su salida vuelve como respuesta del webhook y la app registra el aviso.

## Servidor MCP remoto (`/mcp`)

Servidor MCP para agentes externos (Claude, ChatGPT, etc.). Corre en el mismo proceso Hono,
como capa fina sobre funciones que ya usa la app. Solo lee, salvo `crear_gasto`, que deja el
gasto **pendiente** en la bandeja. Ver DEC-017.

| Aspecto | Detalle |
|---------|---------|
| Path | `POST /mcp`. `GET` y `DELETE` responden `405` porque es stateless, sin SSE ni sesiones |
| Transporte | MCP Streamable HTTP (`@modelcontextprotocol/sdk`, `WebStandardStreamableHTTPServerTransport`), respuesta JSON |
| Auth | `Authorization: Bearer <MCP_TOKEN>`, con comparación timing-safe. Es un token propio, distinto de `INGESTA_TOKEN` y `ACCESS_TOKEN`. Sin `MCP_TOKEN` o sin el Bearer correcto responde `401` siempre, también en dev. Se monta antes del gate global y queda exento de él, igual que `/api/ingesta` |
| Tools | `crear_gasto` (la única escritura), `buscar_gastos`, `resumir_gastos`, `comparar_periodos`, `resumen_presupuesto`, `listar_catalogos` |
| No hay | Tools para confirmar, editar, descartar o borrar gastos. Tampoco para escribir presupuesto, fondos, FGP, reservas, ingresos, tarjeta, catálogos o reglas, ni SQL libre. No llama a Groq ni a OpenAI |
| Implementación | `server/mcp/index.js` (transporte y auth), `server/mcp/tools.js` (schemas, descripciones y handlers), `server/consultas/gastos.js` (búsqueda y agregación por fechas) |

**`crear_gasto` y la bandeja:** usa el mismo insert que el chat de `/agente`
(`ejecutarCrearGasto` → `crearGastoPendiente`), con `origen='mcp'`, `estado='pendiente'` y
`es_manual=false`. Nunca confirma un gasto. La bandeja no filtra por origen, así que el gasto
aparece en `/bandeja` y `/log` y se aprueba con el mismo `PATCH` humano. `banco` tiene que ser un
nombre de `catalogo_banco` (se compara sin distinguir mayúsculas y se guarda el nombre canónico).
Si no lo es, la tool responde error con la lista de bancos y no inserta. Los `tipos` y el
`contexto` que no estén en el catálogo se descartan. Si no se mandan, se completan con la memoria
de comercios, y si el comercio no está en memoria el gasto entra sin tipos. Si `buscarSimilares`
encuentra candidatos y `ignorar_duplicado` es false, no inserta y responde `code: "duplicado"`
con esos candidatos.

**Respuesta de toda tool**: `{ "ok": true, "data": ..., "meta": ... }` o
`{ "ok": false, "error": "...", "code": "validacion|no_autorizado|duplicado|no_encontrado|interno" }`.
La respuesta `duplicado` trae además `data.candidatos`. El input se valida en el servidor antes de
tocar la DB, y los objetos son estrictos: un campo extra como `estado` o `grupo` da `validacion`.

**Montos:** `monto` es el cargo nominal en CLP. `monto_ciclo` es `montoDelCiclo()`, o sea el
impacto en el sobre del ciclo (resta el split y vale 0 si lo financió un fondo).
`resumir_gastos` y `comparar_periodos` incluyen lo mismo que el gastado del dashboard: sin
descartados, sin `en_presupuesto=false` y sin USD puro. Los confirmados sin regla de mapeo
suman en el total con la clave `SIN MAPEO`. `cantidad` cuenta también las filas incluidas con
`monto_ciclo` 0. Los `porcentaje` van de 0 a 100, con un decimal.

**Fechas:** las calcula el agente consumidor en YYYY-MM-DD con la fecha local del servidor.
"Este mes" presupuestario es el ciclo YYYY-MM, que va del 29 del mes anterior al 28 del mes
nominal. El servidor corre en hora de Chile (`America/Santiago`), ver `docs/operations/env-vars.md`.

### Ejemplos

Cada `tools/call` es un `POST /mcp` con
`Authorization: Bearer <MCP_TOKEN>`, `Content-Type: application/json` y
`Accept: application/json, text/event-stream`. El resultado viene en
`result.structuredContent`, y como texto JSON en `result.content[0].text`. Los montos de abajo
son ilustrativos.

```bash
curl -s -X POST https://<app>/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"listar_catalogos","arguments":{}}}'
```

**`listar_catalogos`** `{}`

```json
{ "ok": true, "data": {
  "bancos": ["Edwards", "BICE", "TC Papa", "Otro", "Transferencia", "Efectivo"],
  "tipos": ["Comida", "Transporte", "Salud", "..."],
  "contextos": ["Familia", "Trabajo", "Amigos", "Personal", "Polola"],
  "grupos": [{ "nombre": "TRANSPORTE", "subcategorias": ["Mantención", "Tag"] }, "..."]
}, "meta": {} }
```

**`crear_gasto`** `{ "fecha": "2026-10-06", "motivo": "Sushi", "monto": 23500, "usd": 0, "banco": "edwards" }`

```json
{ "ok": true, "data": {
  "id": "3f6c…", "estado": "pendiente", "fecha": "2026-10-06", "motivo": "Sushi",
  "monto": 23500, "usd": 0, "banco": "Edwards", "tipos": [], "contexto": "",
  "ciclo_financiero": "2026-10",
  "mensaje": "Quedó en la bandeja (/bandeja) como pendiente, esperando aprobación humana. Todavía no está confirmado."
}, "meta": { "origen": "mcp", "tipos_descartados": [], "contexto_descartado": null } }
```

Banco inexistente (`"banco": "Cheque"`):

```json
{ "ok": false, "code": "validacion",
  "error": "banco \"Cheque\" no existe en el catálogo. Bancos válidos: Edwards, BICE, TC Papa, Otro, Transferencia, Efectivo" }
```

Posible duplicado:

```json
{ "ok": false, "code": "duplicado", "error": "No se creó: hay 1 posible(s) duplicado(s). …",
  "data": { "candidatos": [{ "id": "9965…", "fecha": "2026-10-05", "motivo": "SUSHI", "monto": 23500, "usd": 0, "banco": "Edwards", "estado": "confirmado" }] } }
```

**`buscar_gastos`** `{ "orden": "creado_desc", "limite": 2 }`

```json
{ "ok": true, "data": [
  { "id": "d241…", "fecha": "2026-10-03", "motivo": "Farmacia", "monto": 14050, "usd": 0, "monto_ciclo": 14050,
    "banco": "BICE", "estado": "confirmado", "origen": "telefono", "grupo": "SALUD", "subcategoria": "Farmacia" },
  { "id": "7a10…", "fecha": "2026-10-03", "motivo": "Uber", "monto": 6900, "usd": 0, "monto_ciclo": 6900,
    "banco": "Edwards", "estado": "pendiente", "origen": "mail", "grupo": "SIN CLASIFICAR", "subcategoria": "Por revisar" }
], "meta": { "total": 1037, "devueltos": 2, "offset": 0, "limite": 2, "truncado": true } }
```

**`resumir_gastos`** `{ "ciclo": "2026-09", "agrupar_por": "banco" }`

```json
{ "ok": true, "data": {
  "total_ciclo": 1500000, "total_nominal": 1480000, "cantidad": 60, "promedio": 25000, "minimo": 250, "maximo": 300000,
  "grupos": [
    { "clave": "Edwards", "total_ciclo": 900000, "cantidad": 35, "porcentaje": 60 },
    { "clave": "BICE", "total_ciclo": 600000, "cantidad": 25, "porcentaje": 40 }
  ]
}, "meta": { "agrupar_por": "banco", "grupos_totales": 2, "truncado": false } }
```

**`comparar_periodos`** `{}` (modo ciclos: compara el ciclo anterior con el actual)

```json
{ "ok": true, "data": {
  "a": { "etiqueta": "2026-09", "desde": "2026-08-29", "hasta": "2026-09-28", "total_ciclo": 1500000, "cantidad": 60 },
  "b": { "etiqueta": "2026-10", "desde": "2026-09-29", "hasta": "2026-10-28", "total_ciclo": 600000, "cantidad": 15 },
  "diferencia_absoluta": -900000, "diferencia_porcentual": -60,
  "desglose": [{ "clave": "TRANSPORTE", "total_a": 80000, "total_b": 50000, "diferencia": -30000 }, "..."]
}, "meta": { "modo": "ciclos", "filtro": {} } }
```

Modo rangos: `{ "modo": "rangos", "fecha_desde_a": "2026-09-01", "fecha_hasta_a": "2026-09-30", "fecha_desde_b": "2026-10-01", "fecha_hasta_b": "2026-10-31", "banco": "BICE" }`.

**`resumen_presupuesto`** `{}` (ciclo actual)

```json
{ "ok": true, "data": {
  "ciclo": "2026-10", "rango": { "desde": "2026-09-29", "hasta": "2026-10-28" }, "dia": 8, "duracion": 30,
  "ingresos": 1800000, "previsto": 2000000, "gastado": 600000, "restante": 1400000, "sin_clasificar": 0,
  "hay_presupuesto": true,
  "semaforos": [{ "grupo": "TRANSPORTE", "real": 50000, "previsto": 60000, "restante": 10000, "estado": "amarillo" }],
  "en_rojo": []
}, "meta": { "ciclo_default": true } }
```

Un ciclo sin `presupuesto_ciclo` devuelve `hay_presupuesto: false` y `previsto: 0`. El
`gastado` sigue siendo el real.

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
| `DATABASE_URL` | Railway / .env | Todos |
| `ACCESS_TOKEN` | Railway / .env | Producción (legacy, en paralelo — ver DEC-009) |
| `PASSKEY_RP_ID`, `PASSKEY_RP_NAME`, `PASSKEY_ORIGIN` | Railway / .env | Producción (dev usa defaults `localhost`) |
| `PASSKEY_BOOTSTRAP_SECRET` | Railway / .env | Todos (solo se usa mientras no exista ninguna passkey) |
| `VITE_N8N_WEBHOOK_URL` | .env (build time) | Dev + prod |
| `CORS_ORIGIN` | .env | Dev (default localhost:6001) |
| `INGESTA_TOKEN` | Railway / .env | Todos (requerida para que `POST /api/ingesta` acepte requests) |
| `GROQ_API_KEY` | Railway / .env | Todos (opcional — extracción y clasificación de respaldo en la ingesta, y transcripción de voz) |
| `GROQ_WHISPER_MODEL` | Railway / .env | Todos (opcional, default `whisper-large-v3-turbo`) |
| `OPENAI_API_KEY` | Railway / .env | Todos (opcional — sin ella, `/api/agente/chat` responde 503 y la ingesta clasifica con Groq o sin tipos) |
| `MCP_TOKEN` | Railway / .env | Todos (opcional — sin ella, `/mcp` responde 401 siempre) |
| `TELEGRAM_AGENTE_TOKEN` | Railway / .env y credencial Header Auth en n8n | Todos (opcional — sin ella, `/api/agente/telegram/*` responde 401 siempre) |
| `N8N_TELEGRAM_AVISO_URL` | Railway / .env | Todos (opcional — sin ella, no salen avisos y la ingesta sigue igual) |

## Entornos

| Integración | Local | Producción |
|-------------|-------|------------|
| PostgreSQL | Local o remoto | PostgreSQL de Railway |
| n8n | Misma URL o instancia dev | Instancia prod (GAP) |
| Railway | N/A | Hosting de API + frontend estático (`railway.json`) |

## Gaps

- GAP: instancia n8n exacta y credenciales de workflows.
- GAP: monitoreo de salud del webhook n8n.
- GAP: dominio real de producción para `PASSKEY_RP_ID`/`PASSKEY_ORIGIN`.
- GAP: `/mcp` no tiene rate limiting. Solo lo protege el Bearer, igual que `/api/ingesta`.
- GAP: el workflow de Telegram en n8n no está versionado; su forma está documentada arriba y se
  valida a mano con el bot real.
- GAP: si el proceso se reinicia entre el insert y el envío, o n8n falla, el aviso de ese gasto se
  pierde (best-effort). Se reenvía con `POST /api/agente/telegram/aviso`.
- GAP: `TELEGRAM_AGENTE_TOKEN` se usa en las dos direcciones (app ↔ n8n). Si hace falta revocarlas
  por separado, agregar un secreto propio para el webhook de avisos.
- GAP: `buscar_gastos` y `resumir_gastos` cargan todas las filas que pasan los filtros SQL y
  paginan o agregan en memoria, porque el filtro por grupo depende de `resolverCategoria`. Sin
  filtros eso es toda la tabla (~1000 filas hoy). Revisar si el volumen crece mucho.
