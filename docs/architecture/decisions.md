# Gastos App — Decisiones de arquitectura

## DEC-001 - SQLite local como persistencia inicial

Date: (histórico, pre-2026)
Status: replaced
Context: App personal local-only, simplicidad de setup sin servidor de DB.
Decision: Usar `bun:sqlite` con archivo `data/gastos.db`.
Alternatives considered: JSON files, localStorage only.
Consequences: Fácil desarrollo local; difícil deploy multi-instancia; migrado a PostgreSQL.

## DEC-002 - Presupuesto normalizado en tablas separadas

Date: (migración 003)
Status: active
Context: Presupuesto almacenado como JSON monolítico dificultaba queries y updates parciales.
Decision: Tablas normalizadas de cabecera, ingresos, categorías y fondos. La cabecera se
denomina `presupuesto_ciclo` desde DEC-010.
Alternatives considered: JSONB single table, document store.
Consequences: PUT por sección; joins en lectura; mejor integridad referencial.

## DEC-003 - Tabla única de gastos con flag es_manual

Date: (diseño original)
Status: active
Context: Gastos de n8n y manuales comparten schema pero distinta semántica de identidad.
Decision: Una tabla `gastos` con `es_manual` y `sync_key` nullable para manuales.
Alternatives considered: Tablas separadas gastos_sync / gastos_manual.
Consequences: Queries unificadas posibles; lógica de merge en App.jsx; dos hooks de fetching.

## DEC-004 - Reglas de mapeo en DB con prioridad

Date: (migración 005)
Status: active
Context: Asignación gasto→categoría presupuestaria necesitaba ser editable sin deploy.
Decision: Tabla `regla_mapeo` con prioridad, condiciones y `_NONE_` para sin mapeo.
Alternatives considered: Hardcode en cliente, ML classification.
Consequences: CRUD vía API; cliente cachea reglas al boot; override manual siempre gana.

## DEC-005 - Sync n8n con revisión manual

Date: (diseño useSyncN8n)
Status: active
Context: Import automático puede traer duplicados o gastos incorrectos.
Decision: Webhook devuelve entries → modal SyncReview → POST solo aprobados.
Alternatives considered: Auto-import silencioso.
Consequences: Mejor control; paso extra para el usuario; `lastSync` en localStorage.

## DEC-006 - Migración a PostgreSQL para producción

Date: 2026 (inferido de `schema.pg.sql`, `migrate-to-pg.js`)
Status: active
Context: Deploy en Railway requiere DB managed y acceso remoto.
Decision: PostgreSQL con `postgres` driver; schema en `schema.pg.sql`; script one-shot desde SQLite.
Alternatives considered: Mantener SQLite en volumen Railway.
Consequences: `DATABASE_URL` obligatorio; SSL en prod; scripts SQLite legacy permanecen.

## DEC-007 - Auth por token compartido en producción

Date: (server/index.js middleware)
Status: superseded by DEC-009
Context: App personal desplegada en internet sin multi-usuario.
Decision: `ACCESS_TOKEN` + cookie HTTP-only; bypass en dev.
Alternatives considered: OAuth, basic auth, VPN-only.
Consequences: Simple; un solo secreto; no hay roles ni permisos granulares. `ACCESS_TOKEN`
se mantiene activo en paralelo durante la transición a DEC-009 — ver esa entrada para el
procedimiento de retiro.

## DEC-008 - Hono sirve frontend en producción

Date: (server/index.js serveStatic)
Status: active
Context: Un solo servicio en Railway simplifica deploy.
Decision: `bun run build` → `dist/` servido por Hono en prod.
Alternatives considered: CDN separado, Vercel frontend + API separada.
Consequences: Un contenedor; CORS relevante solo en dev.

## DEC-009 - Auth por passkey/WebAuthn (reemplaza DEC-007)

Date: 2026-07-21
Status: active
Context: `ACCESS_TOKEN` es un secreto único compartido, sin revocación granular, transmitido
en texto plano en la URL en la primera visita (`?t=TOKEN`) y sin segundo factor. Para una
app single-owner expuesta en internet, passkeys dan login passwordless resistente a phishing
sin necesidad de gestionar contraseñas ni un sistema de usuarios completo.
Decision: `@simplewebauthn/server` + `@simplewebauthn/browser`. Login discoverable/usernameless
(`allowCredentials: []`), `userVerification: 'required'` en registro y login. Sesión propia
desacoplada de la passkey: token opaco de 256 bits, hasheado (SHA-256) en `auth_sessions`,
cookie `gastos_session` (`httpOnly`, `Secure` en prod, `SameSite=Strict`). Enrolamiento inicial
protegido por `PASSKEY_BOOTSTRAP_SECRET` (env var), utilizable solo mientras no exista ninguna
passkey — una vez registrada la primera, el secreto de bootstrap queda completamente inerte y
agregar passkeys adicionales requiere sesión válida. Migración: `ACCESS_TOKEN` se mantiene
activo en paralelo (middleware combinado: sesión válida O `ACCESS_TOKEN` legacy) hasta que el
usuario confirme login con passkey en producción real; recién ahí se retira (ver
`docs/operations/env-vars.md` y `docs/operations/runbook.md` para el procedimiento).
Alternatives considered: email+password (requiere gestión de contraseñas, no pedido),
OAuth/login social (multiusuario innecesario para single-owner), JWT de larga duración para
sesión (se prefirió sesión opaca server-side por revocación inmediata en logout).
Consequences: Nuevas tablas `passkey_credentials`, `webauthn_challenges`, `auth_sessions`
(`server/db/schema.pg.sql`); nuevo router `server/routes/auth.js` montado en `/api/auth/*`,
exento del gate global; nueva dependencia `zod` (validación de payloads WebAuthn) y
`@simplewebauthn/*`; rate limiting en memoria (por proceso, no compartido entre instancias —
ver GAP); sin `SESSION_SECRET` (token ya es random de 256 bits, un hash simple sin pepper es
suficiente — no hay material reversible que proteger). n8n no se ve afectado: no tiene webhook
entrante, el sync es 100% client-initiated y pasa por el mismo gate que cualquier request
humano.

## DEC-010 - Presupuesto por ciclos financieros 29–28

Date: 2026-07-28
Status: active
Context: El presupuesto por mes calendario no representaba el período realmente financiado.
Decision: El período presupuestario principal es `ciclo_financiero`, nombrado por el mes que
financia. Las fechas 1–28 pertenecen al ciclo del mismo mes y las fechas 29–31 al ciclo
siguiente. `gastos.fecha` no cambia y `gastos.mes` se conserva como filtro calendario
secundario. Los presupuestos históricos mantienen su clave nominal al migrar.
Consequences: Totales, gráficos, comparaciones, fondos, recurrencias y duplicados agrupan por
ciclo. El servidor deriva ambos períodos desde `fecha` y no permite editarlos directamente.

## DEC-011 - Dos proveedores LLM: Groq para ingesta de mail, OpenAI para el agente conversacional

Date: 2026-08-02
Status: active
Context: F2 (memoria de comercios) + F3 (agente conversacional) agregan una segunda vía de
captura de gastos, en lenguaje natural, para lo que no llega por mail (BICE, efectivo,
transferencias). El clasificador existente (`server/ingesta/groq.js`, Groq) es un `fetch`
directo sin SDK: suficiente para clasificación batch de un `motivo` ya extraído, pero no
ofrece tool calling estructurado ni streaming de eventos parciales, y el agente necesita
ambas cosas para (a) decidir dinámicamente si preguntar el banco o crear el gasto, y (b)
mostrar en el chat qué está haciendo paso a paso ("buscó el comercio", "creó el gasto") en
vez de una respuesta opaca.
Decision: El agente conversacional (`server/agente.js`) usa el Vercel AI SDK
(`ai` + `@ai-sdk/react` + `@ai-sdk/openai`) contra OpenAI, con tool calling
(`buscar_comercio`, `crear_gasto`) y `streamText().toUIMessageStreamResponse()` consumido en
el cliente vía `useChat`. `server/ingesta/groq.js` no se migra ni se toca — sigue siendo un
`fetch` directo a Groq, sin SDK, porque no necesita ninguna de esas dos capacidades y
migrarlo no aportaría nada. Ambos caminos comparten la misma memoria de comercios
(`comercio_mapeo`) y el mismo filtro duro contra el catálogo real antes de insertar — el
LLM nunca es el único guardián del catálogo, en ninguno de los dos proveedores.
Consequences: Dos API keys distintas en producción (`GROQ_API_KEY`, `OPENAI_API_KEY`), cada
una opcional de forma independiente — si falta la de OpenAI, solo `/api/agente/chat` queda
deshabilitado (503), el resto de la app (incluida la ingesta de mail) sigue intacto. Nueva
dependencia de tres paquetes (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) que no existía antes
en el repo. Default de `OPENAI_MODEL`: `gpt-5.6-luna` (familia GPT-5.6, variante más
rápida/económica — function calling + streaming, 1M de contexto), confirmado contra la
documentación oficial de OpenAI.

## DEC-012 - El mail desconocido se clasifica con el modelo del agente

Date: 2026-10-01
Status: active
Context: Un comercio que no está en `comercio_mapeo` se clasificaba con Groq
(`llama-3.1-8b-instant`) dentro de `POST /api/ingesta`. Esa sugerencia de tipos/contexto
es lo que llega a la bandeja, y un modelo más chico obliga a corregir más. El agente
conversacional (`server/agente.js`, OpenAI) ya conoce el catálogo y el mapeo a
grupo/subcategoría, pero su prompt espera un segundo turno de confirmación antes de
`crear_gasto`, y esa tool guarda `origen='chat'` sin `fuente_id`. Un webhook de n8n no
tiene ese segundo turno y perdería la idempotencia del id de Gmail.
Decision: La ingesta sigue siendo el único entrypoint (`POST /api/ingesta`, parser,
`fuente_id`, `origen='mail'`, `crearGastoPendiente`). Si no hay memoria, un clasificador
one-shot (`server/ingesta/agente.js`) usa el mismo `OPENAI_MODEL` con `generateText` y
salida estructurada de tipos/contexto, filtrada contra el catálogo. No abre conversación
ni llama tools de escritura. Si no hay `OPENAI_API_KEY`, el modelo falla o devuelve vacío,
sigue Groq `clasificarGasto`. El chat de `/agente` no cambia.
Consequences: Un mail de un comercio nuevo puede llamar a OpenAI (tope 15s, best-effort).
Sin esa key la ingesta no se corta: cae a Groq o queda sin tipos. DEC-011 sigue vigente
para el chat (tool calling + streaming) y para no migrar `groq.js` al SDK. Grupo y
subcategoría siguen sin persistirse: los deriva `src/utils/mapeo.js` a partir de los tipos
y el contexto que eligió el clasificador.

## DEC-013 - Ingresos reales en tabla `ingreso` separada de `presupuesto_ingreso`

Date: 2026-10-05
Status: active
Context: `presupuesto_ingreso` es solo la previsión por ciclo (un número editado a mano, que se
reemplaza entero en cada PUT del presupuesto) — no existía forma de registrar que un ingreso
real efectivamente llegó, con fecha, y verlo acumulado. Meter esos registros como filas de
`gastos` con signo negativo rompería `montoReal()`/`montoDelCiclo()` (marcados como intocables
sin revisión) y mezclaría dos conceptos distintos en la misma tabla.
Decision: Tabla `ingreso` nueva (fecha, fuente, monto, nota, origen), igual criterio que
`reserva` vs `presupuesto_fondo`: un registro histórico de hechos vive separado de un plan que
se reescribe. Se puede registrar a mano en `/presupuesto` o desde el agente conversacional
(`registrar_ingreso`, F3) con `origen='chat'`. Sin `UNIQUE` por fecha — a diferencia de
`reserva_saldo`, un ingreso real puede repetirse el mismo día sin ser un error.
Alternatives considered: fila en `gastos` con monto negativo (descartada, ver arriba); ampliar
`presupuesto_ingreso` con un campo "real" (descartada, el previsto es un valor único por fuente
y ciclo, no soporta múltiples eventos con fecha propia).
Consequences: Nueva tabla y router (`server/ingresos.js`, `server/db/migrate-ingresos.js`),
montados en `server/index.js` junto a los demás módulos standalone (`reserva`,
`fondo_tarjeta_movimiento`). El Dashboard y `/presupuesto` muestran previsto y real como dos
números separados — el cálculo de "Saldo" del Dashboard sigue usando el previsto; cambiarlo a
real es una decisión aparte, no tomada acá (ver GAP en `docs/context/context.md`). Sin
detección de duplicados para ingresos repetidos.

## DEC-014 - `fondo_ahorro_movimiento` es un log informativo, no la fuente del saldo

Date: 2026-10-05
Status: superseded by DEC-015 (unas horas más tarde el mismo día: se pidió explícitamente el
cambio de comportamiento que acá se había descartado — ver esa entrada)
Context: Al pedir ver "ingresos y egresos" de los fondos de ahorro del presupuesto
(`presupuesto_fondo`), un fondo vinculado a categoría ya tenía ambos lados derivables de
`gastos` (sin cambios de schema); un fondo manual (sin vincular) solo tenía los egresos
("Usos", vía `gastos.financiado_por`) — los aportes manuales ("+ Aportar") solo incrementaban
`presupuesto_fondo.acumulado`, un número sin historial por fecha.
Decision: Tabla nueva `fondo_ahorro_movimiento` (fondo_nombre, fecha, monto, nota) que se
inserta además de (no en vez de) la actualización de `acumulado` en cada "+ Aportar" manual.
Es deliberadamente informativa: `acumulado` sigue siendo el campo autoritativo del saldo —
"Editar fondo" lo sigue pudiendo pisar directo, y el saldo mostrado (`calcularSaldoFondo`) no
cambia. Convertir `acumulado` en `SUM(fondo_ahorro_movimiento.monto)` (como ya funciona
`fondo_tarjeta_movimiento`) sería más consistente a largo plazo pero es un cambio de
comportamiento más grande (afecta creación, edición, desvinculación) que no se pidió acá.
Alternatives considered: derivar el saldo desde la tabla nueva (descartada por alcance, ver
arriba); no persistir nada y mostrar solo "último aporte" (descartada, el pedido era ver una
lista).
Consequences: Dos fuentes para la misma información, sin garantía de que queden sincronizadas
si `acumulado` se edita por fuera de "+ Aportar" (p.ej. "Editar fondo"). Aportes previos a este
cambio no tienen fila — la lista puede verse incompleta en fondos antiguos. Renombrar el fondo
actualiza `fondo_ahorro_movimiento.fondo_nombre` igual que ya hacía con `gastos.financiado_por`.

## DEC-015 - Formato unificado aporte(+)/pago(−)/ajuste(±) en los 3 fondos, sin duplicar el gasto

Date: 2026-10-05
Status: active
Context: Fondo de tarjeta (`fondo_tarjeta_movimiento`), fondos de ahorro del presupuesto
(`presupuesto_fondo`) y reservas (`reserva_saldo`) mostraban ingresos/egresos con tres formatos
distintos. Se pidió unificarlos al modelo que ya usa el fondo de tarjeta. El reto: un "pago"
(uso) de un fondo de ahorro ya es, desde siempre, un gasto con `financiado_por = nombre` — una
fila real, con signo implícito, por fecha. Convertirlo en una fila nueva en
`fondo_ahorro_movimiento` lo duplicaría (la misma regla ya protegida para
`fondo_tarjeta_movimiento`/`reserva_tarjeta`: "vincularlo al presupuesto duplicaría el gasto").
Decision:
- **Pago**, en cualquier fondo de ahorro (vinculado o manual): nunca es una fila en
  `fondo_ahorro_movimiento` — sigue siendo el gasto con `financiado_por`. `tipo` en esa tabla
  solo admite `'aporte'`/`'ajuste'`.
- **Aporte**, fondo **vinculado**: sigue siendo gastos de su categoría (sin cambios, ya no se
  duplicaba).
- **Aporte/Ajuste**, fondo **manual**: `fondo_ahorro_movimiento` pasa de informativo a ser la
  fuente real del saldo (`SUM(monto)`), reemplazando `presupuesto_fondo.acumulado` (que queda
  vestigial — no se borra de schema, simplemente nadie lo lee después de este cambio). "+
  Aportar" inserta `aporte`; crear con saldo inicial, desvincular, o corregir el "Saldo
  acumulado" desde "Editar fondo" insertan `ajuste` (puede ser negativo).
- **Reservas**: sin cambio de datos — `retiros`/`crecimiento`/`diferencia` (ya calculados y
  persistidos, ver entrada de `reserva_saldo` arriba) se relabelean como Pago/Aporte/Ajuste en la
  UI. Siguen siendo lecturas de un saldo externo (Mercado Pago), no movimientos reales que la app
  controle — no tiene sentido forzarlas a un libro de transacciones propio.
Alternatives considered: hacer que "Usar" también escriba una fila `pago` en
`fondo_ahorro_movimiento` en paralelo al gasto (descartada — duplica la contabilidad, y como un
gasto manual puede vivir con `es_manual=true` en la misma tabla `gastos`, igual que uno
sincronizado, no hay necesidad real de una segunda fuente); convertir las lecturas de reserva en
transacciones aporte/pago/ajuste reales (descartada — el usuario deposita/retira *fuera* de esta
app, en Mercado Pago; la app solo lee fotos/dictados de un saldo externo).
Consequences: `GET /api/fondos-ahorro/movimientos` (nuevo, sin filtro por nombre) para que el
Dashboard/`/fondos` pueda calcular el saldo de todos los fondos manuales con un solo fetch, en
vez de recalcular desde `presupuesto_fondo.acumulado`. El campo `acumulado` de
`presupuesto_fondo` sigue existiendo, se sigue copiando en "Copiar ciclo anterior", pero ya no
significa nada para un fondo manual — efecto colateral positivo: como `fondo_ahorro_movimiento`
no tiene columna `ciclo` (es global por nombre), el saldo de un fondo manual ya no depende de que
el usuario recuerde copiar el ciclo anterior. Fondos manuales con aportes anteriores a esta
migración no tienen fila inicial en el ledger (mismo criterio ya aceptado para
`fondo_tarjeta_movimiento`/Edwards).

## DEC-016 - FGP como fondo con arrastre y traspaso explícito al fondo de tarjeta

Date: 2026-10-06
Context: el FGP era solo una vista del ciclo (previsto vs gastado de las líneas `fgp=true`): lo
que sobraba se perdía y los excesos no quedaban registrados. En la práctica la plata del FGP se
aparta del sueldo y, cuando se gasta con tarjeta, se pasa al fondo común de tarjeta
(`fondo_tarjeta_movimiento`); los excesos se terminan pagando con el sueldo siguiente.
Decision:
- **Arrastre**: lo que sobra de un ciclo pasa al siguiente; un exceso se come el saldo.
- **Aporte y gasto derivados** (previsto de las líneas FGP de cada ciclo y gastos de esas líneas),
  calculados en el cliente (`src/utils/fgp.js`) con todos los presupuestos ya cargados — mismo
  criterio que los fondos vinculados: no se duplica el gasto en otra tabla.
- **`fgp_movimiento`** guarda solo lo no derivable: `traspaso_tc` (por gasto), `cobertura`,
  `deficit` y `ajuste`.
- **Traspaso a TC explícito**, no automático: "mover" crea un aporte real en el fondo de tarjeta
  (uno por lote) y "marcar" solo registra que ya se movió a mano (para el historial previo).
  Ambos por gasto, por ciclo o todo.
- **Déficit** = cobertura cuyo origen es el sueldo siguiente; queda como compromiso visible hasta
  que pasa ese ciclo.
Alternatives considered: extender `presupuesto_fondo.vinculado` a varias líneas (descartada — en
un fondo vinculado los gastos de la categoría son *aportes*; en el FGP son *pagos*, semántica
opuesta); aporte automático al fondo TC al confirmar cada gasto (descartada — la plata se mueve
físicamente a mano y el usuario quiere elegir cuándo, por gasto o en bloque); persistir el saldo
por ciclo (descartada — cambiar el presupuesto o recategorizar un gasto pasado lo dejaría
desfasado).
Consequences: el saldo depende de que los presupuestos pasados conserven sus marcas `fgp`. Deshacer
un traspaso real borra su aporte en el fondo TC (CASCADE), así ambos libros quedan consistentes.
La cobertura desde fondo de ahorro solo está disponible para fondos manuales (los vinculados
derivan su saldo de gastos, no admiten un ajuste negativo).

## DEC-017 - Servidor MCP remoto en el mismo proceso, con token propio y una sola escritura

Date: 2026-10-06
Context: se quiere consultar y registrar gastos desde agentes externos (clientes MCP). La passkey
no sirve para un bot remoto, y el chat de `/agente` es una sesión de browser.
Decision:
- `POST /mcp` en el mismo proceso Hono, con MCP Streamable HTTP stateless y respuesta JSON, usando
  el SDK oficial `@modelcontextprotocol/sdk` (`WebStandardStreamableHTTPServerTransport`). Antes de
  agregarlo se verificó que corre en Bun y que usa el `zod@4` del repo sin traer una copia propia.
- Auth con `MCP_TOKEN` propio (Bearer, timing-safe), montado antes del gate y exento de él, como
  `/api/ingesta`. Sin token: 401 siempre, también en dev.
- Seis tools. La única escritura es `crear_gasto`, que reutiliza `ejecutarCrearGasto` (ahora acepta
  `{ origen }` como tercer argumento, con default `'chat'`) y deja el gasto `pendiente` con
  `origen='mcp'`. Las lecturas reutilizan `resumenCiclo`, `cargarCatalogos` y un read service
  nuevo (`server/consultas/gastos.js`) que resuelve la categoría con `resolverCategoria` y suma con
  `montoDelCiclo`.
- Las validaciones y los errores son propios (`{ ok, error, code }`). Se usa el `Server` de bajo
  nivel del SDK para que la validación del SDK no reemplace ese formato.
Alternatives considered: un proceso o servicio aparte (descartada: duplicaría el acceso a la DB y
la lógica de ciclo, mapeo y duplicados); reutilizar `INGESTA_TOKEN` (descartada: no se podría
revocar uno sin afectar al otro); exponer las tools del chat tal cual (descartada: esas tools
editan la bandeja y están pensadas para un humano en el loop).
Consequences: confirmar un gasto sigue siendo un acto humano en `/bandeja` o `/log`. Un cliente
con el token puede crear gastos pendientes, pero no confirmarlos, editarlos ni borrarlos. Se
agrega una dependencia (`@modelcontextprotocol/sdk`). No hay rate limiting en `/mcp`.

## DEC-018 - Agente por Telegram con n8n como tubo y avisos de gastos flacos

Date: 2026-10-06
Context: se quiere usar el agente de `/agente` desde Telegram y que avise al instante cuando un
gasto de tarjeta entra sin clasificar bien, para completarlo contestando el mensaje.
Decision:
- El cerebro sigue en el servidor. `construirAgente` (`server/agente.js`) comparte modelo, prompt,
  tools y tope de 16 pasos entre `/api/agente/chat` y `/api/agente/telegram/chat`. n8n solo
  transporta: filtra el username, transcribe la voz y reenvía texto. No hay modelo de chat en n8n.
- Endpoint propio `/api/agente/telegram/chat` (JSON, historial en el servidor), en vez de reutilizar
  el stream de sesión de browser.
- `TELEGRAM_AGENTE_TOKEN` propio (Bearer, timing-safe), montado antes del gate y exento, como `/mcp`.
- El aviso sale de la ingesta de tarjeta (mail y teléfono), solo al insertar y solo si el gasto es
  flaco. El texto lo redacta el modelo del agente en un paso aparte, con una plantilla de
  respaldo. Es fire-and-forget y best-effort.
- La respuesta queda atada al gasto con `telegram_avisos` (`message_id` → `gasto_id`), porque
  Telegram no guarda metadata. El webhook de n8n responde con el mensaje enviado y la app lo
  registra sola, así el flujo de avisos en n8n queda en dos nodos (Webhook → Telegram). El turno inyecta los datos del gasto en el prompt y edita con
  `editar_gasto`, sin confirmar.
Alternatives considered: AI Agent dentro de n8n (descartada: duplicaría prompt y reglas fuera del
repo); que n8n consulte avisos pendientes cada X minutos (descartada: llegan con retraso); texto del
aviso con plantilla fija (se eligió el modelo, con la plantilla como respaldo).
Consequences: una llamada a OpenAI por gasto flaco. Un aviso perdido no se reintenta solo
(`POST /api/agente/telegram/aviso` lo reenvía). El token se comparte en las dos direcciones.
Confirmar sigue siendo un acto humano en `/bandeja`.

## GAP: decisions to document

- Política de rotación de `ACCESS_TOKEN` (hasta su retiro definitivo, ver DEC-009).
- Decisión sobre retirar scripts SQLite legacy.
