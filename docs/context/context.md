# Gastos App — Contexto del proyecto

> Documentación canónica del proyecto. La copia en la raíz (`context.md`) apunta aquí.

## Qué hace el proyecto

Aplicación de finanzas personales para comparar **gasto real vs presupuesto por ciclo financiero**. Cada ciclo se nombra por el mes que financia y abarca desde el día 29 del mes anterior hasta el día 28 del mes nominal. Permite sincronizar gastos desde n8n, registrar gastos manuales, asignar categorías presupuestarias, detectar duplicados y analizar tendencias históricas.

## Problema de negocio

Centralizar gastos dispersos (bancos, transferencias, efectivo) y contrastarlos contra un presupuesto por ciclo financiero estructurado por categorías, subcategorías y fondos de ahorro.

## Usuarios principales

Uso personal/familiar. Un operador principal gestiona presupuesto, sincronización y revisión de gastos.

## Flujos principales

| Ruta | Propósito |
|------|-----------|
| `/` | Dashboard: resumen del ciclo financiero, gráficos, semáforos por categoría, fondos de ahorro (aportar / usar / archivar) |
| `/cashflow` | Vista de flujo de caja con sincronización n8n |
| `/analisis` | Análisis histórico: comparador por ciclos, tendencias por categoría, gastos recurrentes |
| `/gastos` | Tabla de gastos por ciclo (sync + manuales), filtro secundario por mes calendario, asignación presupuestaria y duplicados |
| `/log` | Log de últimos gastos ingresados (todos los meses), ordenado por `created_at`, resalta lo nuevo desde la última visita, edición inline. También es la bandeja de revisión de gastos `pendiente`/`error_parseo` llegados por `/api/ingesta` (filtro por estado, confirmar individual o en bloque) |
| `/bandeja` | Bandeja dedicada de gastos `pendiente`/`error_parseo` (filtros por banco/tipo/contexto/búsqueda, confirmar individual o en bloque) — acceso vía `BotonBandeja` |
| `/agente` | Agente conversacional (F3): captura en lenguaje natural gastos que no llegan por mail (BICE, efectivo, transferencias) y también corrige gastos ya pendientes (de mail o de chat) a pedido del usuario. Streaming de pasos con `useChat`; crear y editar siempre dejan el gasto en `pendiente`, nunca confirma. La bandeja (`BandejaLista`, compartida con `/bandeja`) se ve embebida en la misma página, colapsable. La conversación también es accesible desde **cualquier otra página** vía un botón flotante (`AgenteFlotante`) que abre la misma conversación en un panel deslizable, sin navegar — ver más abajo |
| `/presupuesto` | Editor de presupuesto por ciclo financiero (ingresos, categorías, fondos) |
| `/tarjeta` | Reconciliación Edwards/BICE en CLP o USD: fondo derivado, falta depositar, conciliación de estado y registro posterior del pago |
| `/passkeys` | Gestión de passkeys: ver, agregar, eliminar (requiere sesión) |

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS v4, Recharts |
| Backend | Hono 4 sobre Bun |
| Base de datos | PostgreSQL (`postgres` npm package) |
| Integración | n8n webhook (`VITE_N8N_WEBHOOK_URL`) |
| Deploy | Coolify (objetivo; `railway.json` es histórico — ver `docs/operations/deployment.md`) |
| Auth | Passkeys/WebAuthn (`@simplewebauthn/*`), `ACCESS_TOKEN` legacy en paralelo |

**Desarrollo local:** `bun run dev` → API `:3001` + Vite `:6001` (proxy `/api`).

**Lanzador macOS:** `Iniciar-Gastos.command` en la raíz del repo.

## Estado actual

- Backend migrado de SQLite a PostgreSQL; scripts legacy de SQLite permanecen para migración one-shot (`bun run migrate:pg`).
- Schema PG se inicializa en dev o con `RUN_SCHEMA_INIT=true` (`server/db/init.js` + `schema.pg.sql`).
- Autenticación por passkey/WebAuthn (ver DEC-009 en `docs/architecture/decisions.md`).
  `ACCESS_TOKEN` + cookie `gastos_access` se mantienen activos en paralelo hasta confirmar
  login passkey en producción real — no eliminar todavía.
- Tests: `bun test server` (unitarios, sin browser) y `bun test tests/e2e` (E2E con Playwright
  + autenticador virtual WebAuthn de CDP). Antes de este cambio no había suite automatizada.

## Qué no debe cambiarse sin autorización

- Lógica de `montoReal()` en `src/utils/calculos.js` (montos efectivos).
- Preservación de overrides manuales en sync UPSERT (`COALESCE` en `server/index.js`).
- Separación gastos sync (`es_manual=false`) vs manuales (`es_manual=true`).
- Reglas de mapeo con prioridad y `_NONE_` como destino sin mapeo.
- Whitelist de campos en `PATCH /api/gastos/:id`.

## Decisiones clave

- Estado centralizado en `App.jsx` (props), sin store global.
- Presupuesto normalizado en tablas separadas (`presupuesto_*`).
- Catálogos y reglas de mapeo en DB, no hardcodeados en cliente.
- Sync n8n con revisión manual antes de persistir (`SyncReview` modal).

## API — Ingesta externa

`POST /api/ingesta` — n8n empuja mensajes de Gmail (banco Edwards) directo al servidor,
autenticado con `INGESTA_TOKEN` (no passkey). Gastos nacen en `estado='pendiente'` y se
revisan en `/log`. Detalle completo en `docs/architecture/integrations.md` y modelo de
`estado` en `docs/context/data_model_context.md`.

## API — Agente conversacional (F3)

`POST /api/agente/chat` — sesión de chat en tiempo real (no un webhook), detrás del gate
global normal (sesión passkey/`ACCESS_TOKEN`), sin token propio. Usa Vercel AI SDK
(`streamText` + tool calling) contra OpenAI para extraer fecha/monto/comercio/banco de una
frase libre, consulta la memoria de comercios (`comercio_mapeo`, ver abajo) antes de
clasificar con el LLM, y crea el gasto en `estado='pendiente'` con `origen='chat'` — nunca lo
confirma. Requiere `OPENAI_API_KEY`; sin ella responde 503. Deliberadamente separado de
Groq (`server/ingesta/groq.js`, que se queda sin tocar) — ver DEC-011 en
`docs/architecture/decisions.md`.

Además de crear, el agente puede **corregir** un gasto que ya quedó pendiente — de cualquier
origen (mail o chat) — con dos tools adicionales: `buscar_gastos_pendientes` (busca/lista por
texto en `motivo`/`banco` sobre gastos `pendiente`/`error_parseo`) y `editar_gasto` (aplica
cambios de campo sobre un `gastoId` encontrado así, reusando el mismo camino que
`PATCH /api/gastos/:id` vía `server/gastos/actualizar.js`). `editar_gasto` no tiene `estado`
en su schema de entrada — no puede confirmarlo aunque se lo pidan — y su `execute` chequea
server-side que el gasto siga `pendiente`/`error_parseo` antes de tocar nada, rechazando
cualquier intento sobre uno ya `confirmado`. La bandeja (`src/components/Bandeja/BandejaLista.jsx`,
la misma que usa `/bandeja`) se muestra embebida y colapsable arriba del chat en `/agente`.

**Acceso global (frontend):** la conversación vive en `AgenteChatProvider`
(`src/contexts/AgenteChatContext.jsx`), montado una vez en `App.jsx` envolviendo toda la app —
una sola conversación **activa** a la vez, no una por página. `AgentePage` (página completa) y
`AgenteFlotante` (botón flotante + panel deslizable, visible en todas las rutas salvo
`/agente` mismo) consumen ambos el mismo estado vía `useAgenteChat()` y renderizan la misma UI
de chat (`src/components/Agente/AgenteChat.jsx`) — escribir en uno y mirar el otro muestra la
misma conversación. El panel flotante no embebe la tabla de bandeja completa (un `TablaGastos`
angosto se ve mal — cambia de layout por *viewport width*, no por ancho de contenedor); en su
lugar linkea a `/bandeja` vía `BotonBandeja`.

**Nota de voz:** el botón de micrófono en `AgenteChat.jsx` graba audio con `MediaRecorder` y lo
manda a `POST /api/agente/transcribir` (Groq Whisper, `server/agente/transcripcion.js`), que
devuelve `{ texto }`. Ese texto llena el input del chat como si el usuario lo hubiera escrito —
no se envía automáticamente, se revisa/edita antes de apretar "Enviar". Requiere `GROQ_API_KEY`;
sin ella el botón falla con 503 sin afectar el resto del chat. Detalle en
`docs/architecture/integrations.md`.

**Reservas de ahorro (F6):** además de gastos, el agente puede registrar saldos leídos de una
foto de reservas externas (ej. Mercado Pago: mantención auto, patente, vacaciones, plata para
terceros) con la tool `registrar_saldos_reserva`. Las reservas activas (`reserva`, ver
`docs/context/data_model_context.md`) se inyectan en el system prompt igual que tipos/contexto,
así el modelo mapea por nombre sin necesitar una tool de lookup — nunca crea una reserva nueva
por su cuenta (eso es solo vía `POST /api/reservas`, fuera del agente). A diferencia de
`crear_gasto`, la tool escribe el saldo directo (sin `estado='pendiente'`, porque no es una
transacción — solo lee de `gastos` para calcular el esperado, nunca escribe ahí) pero el prompt
igual le exige al modelo mostrar el resumen leído y esperar confirmación explícita del usuario
en el turno siguiente antes de llamar a la tool. Es idempotente por `(reserva, fecha)`: una
corrección posterior el mismo día es solo volver a llamarla con el monto correcto. Detalle del
cálculo de "esperado" (retiros implícitos por categoría vinculada + crecimiento estimado) en
`docs/context/data_model_context.md`.

**Historial de conversaciones (persistencia):** cada mensaje (`UIMessage` con su `parts[]`,
incluidos los tool-calls) se guarda en `agente_conversaciones`/`agente_mensajes`
(`server/agente/historial.js`) — ver `docs/context/data_model_context.md`. La conversación
activa persiste en `localStorage` (`agenteConversacionActual`) y se rehidrata al cargar la
página vía `GET /api/agente/conversaciones/:id`, así sobrevive a un refresh. El body de
`POST /api/agente/chat` ahora requiere `conversacionId` además de `messages`; la respuesta usa
`toUIMessageStreamResponse({ originalMessages, generateMessageId, onFinish })` para persistir
también el mensaje del asistente (con sus tool-parts ya resueltos) al terminar el stream.
`GET /api/agente/conversaciones` lista las conversaciones (más reciente primero, `LIMIT 200`,
sin paginación — GAP si crece mucho) para el dropdown `HistorialConversaciones`
(`src/components/Agente/HistorialConversaciones.jsx`, montado dentro de `AgenteChat.jsx` junto
al botón "+ Nueva conversación"). Al reabrir una conversación pasada, `PasoAgente.jsx` renderiza
los mismos tool-parts persistidos (`state: 'output-available'`, `input`/`output`) como timeline
de acciones — no hay un log de auditoría aparte, las "acciones hechas" son los tool-calls ya
guardados dentro de cada conversación.

## Memoria de comercios (F2)

Tabla `comercio_mapeo` (`server/comercios.js`) aprende de cada confirmación humana en
`/bandeja` o `/log`: al confirmar o corregir un gasto, `PATCH /api/gastos/:id`
(`server/index.js`) hace upsert best-effort de `tipos`/`contexto`/`presupuesto_manual` por
comercio normalizado (`src/utils/comercio.js`). Se consulta **antes** del LLM tanto en
`/api/ingesta` como en `/api/agente/chat` — cascada: memoria (gratis) → LLM → sin
clasificar. Gestión mínima en `GET/DELETE /api/comercios`, sin UI dedicada todavía.

## API — Autenticación

Endpoints bajo `/api/auth/*` (detalle completo en `docs/architecture/integrations.md`):
`GET /status`, `POST /passkey/register/options`, `POST /passkey/register/verify`,
`POST /passkey/login/options`, `POST /passkey/login/verify`, `POST /logout`,
`GET /passkeys`, `DELETE /passkeys/:id`. El resto de la API (`/api/gastos`, `/api/presupuesto`,
etc.) no cambió — sigue detrás del mismo gate global, ahora combinado (sesión passkey o
`ACCESS_TOKEN` legacy).

## Gaps

- GAP: dueño/responsable operacional del deploy.
- GAP: documentación formal del workflow n8n (nodos, formato de respuesta).
- GAP: estrategia de backups de PostgreSQL en producción.
- GAP: `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` de producción sin definir todavía (dominio real
  pendiente) — ver `docs/operations/env-vars.md`.
- GAP: retiro definitivo de `ACCESS_TOKEN` — pendiente de confirmación humana de login
  passkey en producción real (ver `docs/operations/runbook.md`).
- GAP: workflow de n8n para `/api/ingesta` (Gmail trigger, filtros) — lo arma el usuario,
  no vive en este repo.
- GAP: solo el formato de mail `Subject: "Compra con Tarjeta de Crédito"` de Edwards está
  confirmado en `parseEdwardsCompra.js`; otros asuntos dependen del fallback de Groq o caen
  en `error_parseo` para revisión manual.
- GAP: gastos manuales locales (`gastosLocales`, `POST /api/datos?clave=gastos_manuales`) no
  pasan por `PATCH /api/gastos/:id`, así que no alimentan la memoria de comercios.
- GAP: sin UI dedicada para gestionar `comercio_mapeo` (solo `GET/DELETE /api/comercios`).
- GAP: las tools `buscar_gastos_pendientes`/`editar_gasto` del agente (F3) solo ven gastos ya
  sincronizados a Postgres — no pueden buscar ni editar `gastosLocales` (gastos manuales
  guardados solo en `localStorage` del browser), porque el agente corre server-side.
- GAP: los adjuntos de imagen del chat (boletas/comprobantes) se persisten como `data:` URL
  base64 dentro de `agente_mensajes.parts` (JSONB) — sin límite de tamaño ni storage aparte;
  puede crecer la fila/DB con el tiempo si se suben muchas fotos.
- GAP: no hay forma de borrar o renombrar una conversación del agente desde la UI — solo
  listar (`GET /api/agente/conversaciones`) y reabrir.
