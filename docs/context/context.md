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
| `/agente` | Agente conversacional (F3): captura en lenguaje natural, triage de bandeja (listar/resumir/editar, nunca confirma), consultas de solo lectura del ciclo, aviso de duplicados al crear. Streaming de pasos con `useChat`. Layout en dos columnas en desktop: chat a la izquierda y bandeja (`BandejaLista`) embebida y colapsable a la derecha. También accesible desde cualquier página vía `AgenteFlotante` |
| `/presupuesto` | Editor de presupuesto por ciclo financiero (ingresos previstos —con todas las fuentes activas del catálogo, aunque el ciclo no tenga monto—, categorías, fondos) y un resumen de ingresos reales del ciclo (real, previsto, por aprobar) con enlace a `/ingresos` |
| `/ingresos` | Ingresos reales (DEC-020). **Por aprobar**: lo que registraron el agente, el MCP o un pago de clases por MCP, con Aprobar / Editar / Descartar (no cuenta hasta aprobar; un pago de clases se aprueba completo). **Previsto vs real del ciclo** por fuente (real, esperado, estado: llegó / por aprobar / pendiente / atrasado; Clases con lo por cobrar y por confirmar; Uso de fondos aparte). **Registrar ingreso** manual (queda confirmado, avisa de posibles duplicados). **Repartir ingreso** (DEC-023): al aprobar un ingreso, o con "Repartir" en uno ya confirmado de la lista (salvo "Uso de fondos"), un panel sugiere cuánto aportar al fondo TC (lo que falta para cubrir toda la deuda de tarjeta) y a cada fondo de ahorro manual (su aporte previsto del ciclo); los montos se editan y lo confirmado se registra como aportes normales. Lista del ciclo con editar/borrar (los de pagos de clases no se tocan acá: se deshace el pago en `/clases`). **Fuentes de ingreso** (catálogo: tipo, día esperado, activar/desactivar). El menú muestra un contador de pendientes |
| `/tarjeta` | Vista consolidada de tarjetas Edwards/BICE (multi-selección) en CLP o USD: gasto total pendiente, ya facturado / no facturado, fondo común aportado manualmente (`fondo_tarjeta_movimiento`: aportes, ajustes y pagos automáticos) y falta aportar, con barra de cobertura y desglose por tarjeta. Arriba, un KPI de deuda en pesos suma el CLP pendiente y los USD convertidos (`monto_clp_manual`, o un tipo de cambio escrito en el KPI que no se guarda); a la derecha del monto muestra la cobertura en pesos (facturado, no facturado y fondo, con el fondo USD convertido a esa tasa). Es una vista para planificar, no la deuda que se paga. Registro de pago directo, una tarjeta y moneda a la vez. Día de cierre y día de pago configurables por tarjeta (`tarjeta_ciclo`, chip en la barra de filtros: p. ej. Edwards paga el 5 y BICE el 12) para distinguir movimientos ya facturados de los que aún no y calcular el vencimiento de cada período. Un indicador "Próximo vencimiento" (también en `/fondos`) muestra la próxima fecha de pago de cada tarjeta y si el fondo TC la cubre (DEC-022). Al presionar un movimiento se abre el mismo formulario de edición que en `/gastos` |
| `/fondos` | **FGP** (Fondo Gastos Previstos, DEC-016): saldo acumulado con arrastre entre ciclos, gastos FGP con tarjeta pendientes de mover al fondo TC (mover / marcar como ya movido, por gasto, por ciclo o todo, con historial desde el primer ciclo con líneas FGP), cobertura de saldo negativo (fondo de ahorro manual, próximo sueldo = déficit, u otro origen), compromisos con el próximo sueldo, historial de excesos por ciclo y movimientos deshacibles. Un aviso global (`AvisoFGP`) en todas las páginas salvo `/fondos` avisa cuando falta plata en el fondo TC para un vencimiento que está a 10 días o menos (ámbar) o ya pasó (rojo) —lejos del vencimiento no avisa— y cuando el saldo FGP está en rojo; cada gasto pendiente de mover se puede dejar **en standby** (por gasto, por ciclo o todo) sin marcarlo como movido: sale de "por mover" pero sigue visible y reactivable en `/fondos` (DEC-022); la card FGP de `/cashflow` muestra saldo acumulado y pendiente. Además agrupa los tres sistemas de "fondo" (ver F6 abajo) en una sola vista, los tres con el mismo formato aporte(+)/pago(−)/ajuste(±) — ver DEC-015: fondos de ahorro del presupuesto (`presupuesto_fondo`, mismo componente `FondosAhorro` y mismo dato que el Dashboard — aportar/usar/archivar desde cualquiera de las dos páginas actualiza lo mismo; "Ver movimientos" combina aportes [gastos de la categoría si está vinculado, o el libro `fondo_ahorro_movimiento` si es manual — ahí sí es la fuente del saldo] con pagos [siempre gastos con `financiado_por`, nunca duplicados]), reservas de ahorro externas (crear/editar/archivar, registrar saldo leído con desglose Pago/Aporte/Ajuste, historial — antes solo gestionable por el agente) y el fondo de tarjeta con su historial completo de movimientos (mismo componente que `/tarjeta`, ya era el modelo de referencia) y link para gestionarlo ahí. El Dashboard conserva su propio bloque de fondos de ahorro (no se quitó, solo se duplicó la vista) |
| `/clases` | Clases particulares (módulo aparte, DEC-019; reemplaza la base de Notion). Tiene: tabla por mes calendario como la de Notion (alumno, fecha, hora, modalidad, dictada, cobro, precio, horas), con filtros por estado/cobro y un pie con cantidad, suma de precios y suma de lo dictado; alta y "Mover" (fecha, hora, duración, modalidad o precio) de clases programadas y sin cobrar; marcar dictada; cancelar si no está pagada; eliminar si no está pagada; deuda por alumno (dictado y no cobrado, desde la clase impaga más vieja); familias (cuenta de cobro: hermanos + apoderado con WhatsApp; la deuda se agrupa por familia); "Cobrar" arma un mensaje para WhatsApp (saludo al apoderado, cada clase con su fecha por alumno, subtotales y total del mes; sin datos de transferencia) con botones Copiar y Abrir WhatsApp, y desde el mismo panel se registra el pago de varias clases (de un alumno o de los hermanos de una familia) en un pago, que crea un ingreso real "Clases particulares" en el ciclo del mes siguiente a las clases (las de octubre son ingreso de noviembre, DEC-021; si el cobro mezcla meses se registra un pago por ciclo); deshacer un pago; alumnos (alta, precio por hora, desactivar; no se borran); y un KPI con los ingresos de clases de un ciclo (los pagos de las clases del mes anterior). No toca la tarjeta Ingresos del Dashboard |
| `/clases/analisis` | Análisis de clases particulares (sección "Clases particulares" del menú, junto a `/clases` "Agenda y cobros"). Todo sobre las clases dictadas, por la fecha de la clase ("facturado", cobrado o no). Muestra: KPIs (facturado, cobrado, sin cobrar, $/clase, clases, horas, alumnos, meses activos); insights (concentración por familia y top 3, riesgo si una cuenta pesa ≥ 25%, mayores deudas, hora peak y días fuertes/flojos, peso de online); métricas mensuales con tabla por año; mismo mes vs años anteriores (y cómo vas al día de hoy); proyección de cierre del mes según cómo creció ese mes en años previos; facturado por mes y año; por año; estacionalidad; día de semana; hora; mapa día × hora; modalidad; tarifas por hora; familias con hermanos; ranking ordenable de alumnos. Datos: `GET /api/clases/analisis`; cálculo en `src/utils/analisisClases.js` |
| `/passkeys` | Gestión de passkeys: ver, agregar, eliminar (requiere sesión) |

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS v4, Recharts |
| Backend | Hono 4 sobre Bun |
| Base de datos | PostgreSQL en Railway (`postgres` npm package) |
| Integración | n8n webhook (`VITE_N8N_WEBHOOK_URL`) |
| Deploy | Railway (`railway.json` — ver `docs/operations/deployment.md`), app y PostgreSQL, en `https://tomas-gastos-app.venturanalytic.com`. El servicio corre en hora de Chile (`America/Santiago`): el ciclo actual y el "hoy" del servidor usan la hora local del proceso |
| Auth | Passkeys/WebAuthn (`@simplewebauthn/*`), `ACCESS_TOKEN` legacy en paralelo |

**Producción:** `https://tomas-gastos-app.venturanalytic.com` (servidor MCP en `https://tomas-gastos-app.venturanalytic.com/mcp`).

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
revisan en `/bandeja` y `/log`. Si el comercio no está en memoria, lo clasifica el modelo
del agente (`server/ingesta/agente.js`); Groq queda como respaldo. No pasa por el chat.
`POST /api/ingesta/telefono` recibe comercio y monto desde un atajo del teléfono
(banco fijo BICE, mismo `INGESTA_TOKEN`) y sigue la misma clasificación. Detalle y
contrato HTTP en `docs/architecture/integrations.md`; modelo de `estado` en
`docs/context/data_model_context.md`. Ver DEC-012.

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
origen (mail o chat) — con `buscar_gastos_pendientes` (busca/lista por texto, banco, estado o
tipos sobre gastos `pendiente`/`error_parseo`, con `offset` para seguir un lote) y `editar_gasto`
(aplica cambios de campo sobre un `gastoId` encontrado así, reusando el mismo camino que
`PATCH /api/gastos/:id` vía `server/gastos/actualizar.js`). `resumir_bandeja` agrega conteos por
banco/estado/origen sin listar filas, para guiar un triage por voz/chat. `editar_gasto` no tiene
`estado` en su schema de entrada — no puede confirmarlo aunque se lo pidan — y su `execute`
chequea server-side que el gasto siga `pendiente`/`error_parseo` antes de tocar nada, rechazando
cualquier intento sobre uno ya `confirmado`. La bandeja (`src/components/Bandeja/BandejaLista.jsx`,
la misma que usa `/bandeja`) se muestra embebida y colapsable a la derecha del chat en `/agente`
(debajo del chat en viewport chico).

**Duplicados al crear:** `crear_gasto` llama a `buscarSimilares` (`server/duplicados.js`) antes de
insertar. Si hay un candidato (alta: misma fecha+motivo+monto aunque el banco difiera; media/baja
igual que el detector de ciclo) y `ignorar_duplicado` es false, **no inserta** y devuelve
`bloqueado=true` con los candidatos. Solo reintenta con `ignorar_duplicado=true` si el usuario
insiste. No confirma el duplicado de bandeja.

**Consultas de estado (solo lectura):** `resumen_ciclo` y `buscar_gastos` leen presupuesto y gastos
del ciclo financiero (default: ciclo actual, corte 29–28). Totales usan `montoDelCiclo()` igual que
el dashboard: pendientes sin categoría → `SIN CLASIFICAR`, confirmados sin mapeo excluidos, USD puro
fuera. No escriben presupuesto ni confirman gastos. Implementación en `server/consultas/ciclo.js`.

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

**Reservas de ahorro (F6):** bolsillos externos (ej. Mercado Pago: mantención auto, patente,
vacaciones, plata para terceros) — no los fondos de ahorro del dashboard ni el fondo de tarjetas
de `/tarjeta` (`fondo_tarjeta_movimiento`). Gestionables desde `/fondos` (crear/editar/archivar,
registrar saldo, ver historial) o por el agente. Tools: `listar_reservas`, `crear_reserva`, `editar_reserva`
(nombre/emoji/tasa/archivar; no cambia la categoría vinculada ni borra), `listar_saldos_reserva`
y `registrar_saldos_reserva` (ahora también disponible como `POST /api/reservas/:id/saldos` desde
la UI, con `origen='manual'` en vez de `'foto_agente'`). `crear_reserva` valida grupo/subcategoría contra el catálogo
(`validarVinculadoContraCatalogo`) y reusa `POST /api/reservas` vía `crearReserva()`: no inventa
grupos, no crea `presupuesto_fondo`, y si el nombre ya existe inactivo sugiere reactivar.
El prompt exige confirmación explícita en el turno siguiente antes de crear, editar o registrar
un saldo — igual que `crear_gasto`. A diferencia de un gasto, estas tools escriben directo
(sin `estado='pendiente'`, porque no es una transacción — solo leen de `gastos` para calcular
el esperado, nunca escriben ahí). `registrar_saldos_reserva` es idempotente por `(reserva, fecha)`:
una corrección posterior el mismo día es volver a llamarla con el monto correcto. Si la reserva
se acaba de crear en el mismo turno, usa el id que devolvió `crear_reserva` (ya no depende de un
snapshot del prompt). Detalle del cálculo de "esperado" (retiros implícitos por categoría
vinculada + crecimiento estimado) en `docs/context/data_model_context.md`.

**Ingresos reales:** distinto de "ingresos previstos" del presupuesto (previsión planificada,
`presupuesto_ingreso`, no se toca desde el agente). Tools `listar_ingresos` (lectura, por ciclo,
con `estado` y las fuentes válidas del catálogo) y `registrar_ingreso` (fuente del catálogo, monto
entero, fecha, nota, `fondo` si es "Uso de fondos", `ignorar_duplicado`). Mantiene el resumen +
confirmación explícita en el chat, y además lo que registra queda **pendiente** de aprobación
humana en `/ingresos` (`origen='chat'`, `estado='pendiente'`; DEC-020): el agente debe decir que no
cuenta todavía. Si hay un ingreso parecido devuelve los candidatos sin crear nada. No registra
ingresos de Clases particulares (eso es un pago de clases) y no tiene tools de clases.

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

## API — Agente por Telegram

El mismo agente de `/agente` atiende un chat personal de Telegram; n8n solo transporta (recibe,
filtra el username, transcribe voz y reenvía). Tres endpoints con `Authorization: Bearer
<TELEGRAM_AGENTE_TOKEN>`, exentos del gate global y con 401 siempre sin token:

- `POST /api/agente/telegram/chat` `{ conversacionId, texto, replyToMessageId? }` → `{ texto }`.
  El historial vive en el servidor (`telegram:<chat.id>`). Usa el mismo modelo, prompt, tools y
  tope de pasos que `/api/agente/chat`, sin streaming. Si contesta un aviso registrado, el turno
  completa ese gasto con `editar_gasto` y lo deja `pendiente`.
- `POST /api/agente/telegram/avisos` `{ gastoId, chatId, messageId, texto? }`: respaldo para
  registrar desde afuera el `message_id` de un aviso (`telegram_avisos`). 404/409 si el gasto no
  existe o ya no está pendiente.
- `POST /api/agente/telegram/aviso` `{ gastoId }`: evalúa, redacta y reenvía el aviso de un gasto a
  mano.

Aviso proactivo: cuando `/api/ingesta` o `/api/ingesta/telefono` insertan un gasto flaco
(`error_parseo`, sin hit de memoria o sin contexto), la app hace un POST por gasto a
`N8N_TELEGRAM_AVISO_URL` con el texto redactado por el modelo. El webhook manda el mensaje por el
bot y responde con lo que devolvió Telegram; con eso la app registra sola el aviso. Es best-effort: sin la variable no
sale nada y la ingesta no se afecta. Contrato completo en `docs/architecture/integrations.md`;
decisión en DEC-018.

## API — Servidor MCP remoto

`POST /mcp` — servidor MCP (Streamable HTTP, `@modelcontextprotocol/sdk`) para agentes externos,
en el mismo proceso. Auth propia: `Authorization: Bearer <MCP_TOKEN>`, exento del gate global y
con 401 siempre sin token, también en dev. Tiene 17 tools. **Ninguna escritura queda confirmada**:
los gastos quedan pendientes en la bandeja y los ingresos y pagos de clases quedan por aprobar en
`/ingresos` (human in the loop).

**Gastos (6):**
- `crear_gasto`: la única escritura. Deja el gasto `pendiente` con `origen='mcp'` vía
  `ejecutarCrearGasto` y nunca lo confirma.
- Lectura: `buscar_gastos`, `resumir_gastos`, `comparar_periodos`, `resumen_presupuesto` (reusa
  `resumenCiclo`) y `listar_catalogos`.

**Clases particulares (9, DEC-019):**
- Lectura: `listar_alumnos`, `buscar_clases`, `resumen_clases`.
- Escritura: `crear_alumno`, `agendar_clase`, `mover_clase`, `marcar_dictada`, `cancelar_clase` y
  `registrar_pago`, que deja el pago y su ingreso **por confirmar** (las clases siguen sin cobrar
  hasta que un humano lo apruebe).
- No pueden borrar alumnos, clases ni pagos, confirmar ni deshacer un pago, editar ingresos ni
  tocar gastos o presupuesto.

**Ingresos (2, DEC-020):**
- `registrar_ingreso`: escritura. Deja el ingreso `pendiente` (`origen='mcp'`) con fuente del
  catálogo, monto entero y fecha no futura; `code: duplicado` si hay uno parecido; rechaza la fuente
  automática (Clases particulares).
- `resumen_ingresos` (lectura): previsto vs real por fuente del ciclo, totales y pendientes.
- No hay tool para aprobar, editar ni borrar ingresos.

Implementación en `server/mcp/` (`tools.js`, `toolsClases.js`, `toolsIngresos.js`),
`server/consultas/gastos.js`, `server/clases/clases.js`, `server/ingresos.js` e
`server/ingresosCiclo.js`. Contrato y ejemplos en `docs/architecture/integrations.md`. Decisiones
en DEC-017 y DEC-019. El agente interno de `/agente` no tiene las tools de clases.

## API — Clases particulares

`/api/clases/*`, detrás del gate global. Es la UI de `/clases`, una capa fina sobre
`server/clases/clases.js`.

| Endpoint | Qué hace |
|----------|----------|
| `GET/POST /alumnos`, `PATCH /alumnos/:id` | Alumnos. `POST` con un nombre que ya existe → 409. `PATCH` acepta `familia_id` (o `null`) |
| `GET/POST /familias`, `PATCH/DELETE /familias/:id` | Familias (`nombre`, `apoderado_nombre`, `apoderado_telefono`). `DELETE` solo si está vacía |
| `GET /?desde&hasta&alumno_id&familia_id&estado&cobro&limite&offset` | `{ filas, meta }` |
| `POST /` | Agendar |
| `PATCH /:id` | Mover o editar una clase programada y sin cobrar |
| `POST /:id/dictada`, `POST /:id/cancelar` | Cambios de estado |
| `DELETE /:id` | Elimina una clase sin cobrar; una pagada → 409. Las importadas no vuelven al reimportar |
| `GET /resumen?desde&hasta&ciclo` | Horas, dictado, cobrado (solo pagos confirmados), deuda por alumno y por familia (con `por_confirmar`) y `ingresos_ciclo` (Σ `ingreso` confirmados de fuente "Clases particulares" del ciclo) |
| `GET /analisis` | `{ clases }`: todas las clases dictadas, compactas, para `/clases/analisis` |
| `GET/POST /pagos` | `POST` recibe `{ clase_ids, fecha, monto? }` |
| `POST /pagos/:id/confirmar` | Aprueba un pago por confirmar: pago e ingreso confirmados y clases pagadas |
| `DELETE /pagos/:id` | Deshace el pago (o descarta uno por confirmar): las clases vuelven a pendiente y se borra el ingreso |

Errores: `{ error, code }` con `code` ∈ `validacion` (400), `no_encontrado` (404) y `conflicto`
(409). El modelo y las reglas están en `docs/context/data_model_context.md`. El import desde Notion
se hace con `bun run import:clases`.

## Memoria de comercios (F2)

Tabla `comercio_mapeo` (`server/comercios.js`) aprende de cada confirmación humana en
`/bandeja` o `/log`: al confirmar o corregir un gasto, `PATCH /api/gastos/:id`
(`server/index.js`) hace upsert best-effort de `tipos`/`contexto`/`presupuesto_manual` por
comercio normalizado (`src/utils/comercio.js`). Se consulta **antes** del LLM tanto en
`/api/ingesta` como en `/api/agente/chat`. En el mail la cascada es memoria (gratis) →
clasificador del agente → Groq → sin clasificar. Gestión mínima en `GET/DELETE /api/comercios`,
sin UI dedicada todavía.

## API — Ingresos

`/api/ingresos/*`, detrás del gate global (`server/routes/ingresos.js`). Dominio en
`server/ingresos.js` (catálogo, CRUD, duplicados) y `server/ingresosCiclo.js` (aprobar y resumen).

| Endpoint | Qué hace |
|----------|----------|
| `GET /?ciclo&estado` | Ingresos (pendientes y confirmados) |
| `POST /` | Alta manual: fuerza `origen='manual'` y `estado='confirmado'` (ignora ambos del body) |
| `PATCH /:id`, `DELETE /:id` | Editar / borrar; los de `origen='clases'` → 409 |
| `GET /pendientes` | Por aprobar, con el detalle del pago si vienen de clases |
| `POST /:id/confirmar` | Aprueba (uno de clases: confirma su pago completo) |
| `POST /:id/descartar` | Descarta un pendiente (uno de clases: deshace su pago) |
| `GET /resumen?ciclo` | Previsto vs real por fuente + totales (`previsto`, `real`, `esperado`, `por_aprobar`, `fondos`) |
| `GET /similares?fuente&monto&fecha` | Posibles duplicados |
| `GET/POST /fuentes`, `PATCH /fuentes/:id` | Catálogo de fuentes |

Errores: `{ error, code }` con `code` ∈ `validacion` (400), `no_encontrado` (404), `conflicto` (409).

## API — Autenticación

Endpoints bajo `/api/auth/*` (detalle completo en `docs/architecture/integrations.md`):
`GET /status`, `POST /passkey/register/options`, `POST /passkey/register/verify`,
`POST /passkey/login/options`, `POST /passkey/login/verify`, `POST /logout`,
`GET /passkeys`, `DELETE /passkeys/:id`. El resto de la API (`/api/gastos`, `/api/presupuesto`,
etc.) no cambió — sigue detrás del mismo gate global, ahora combinado (sesión passkey o
`ACCESS_TOKEN` legacy).

## Gaps

- GAP: aviso por vencimiento (DEC-022) — la cobertura usa el fondo TC en CLP, y el saldo en USD no
  cubre nada. Un gasto en USD sin `monto_clp_manual` se estima a 950 por dólar
  (`TIPO_CAMBIO_USD_DEFAULT`, constante en `src/utils/vencimientosTarjeta.js`, no editable desde la
  UI); `/tarjeta` avisa cuántos se estimaron. Una tarjeta sin `dia_pago` no entra al aviso hasta
  configurarla. Un gasto de tarjeta pagado en la vida real pero sin registrar el pago en `/tarjeta`
  sigue contando (y pasa a "vencido").
- GAP: reparto de ingresos (DEC-023) — el reparto no queda ligado al ingreso: repartir dos veces el
  mismo ingreso duplica los aportes (el panel no lo detecta). No hay aporte registrable al FGP (se
  deriva del previsto) ni a fondos vinculados (se alimentan con los gastos de su categoría), así
  que el panel solo reparte al fondo TC y a fondos de ahorro manuales.
- GAP: FGP (DEC-016) — los gastos `pendiente` de la bandeja cuentan en el gasto del FGP pero no
  aparecen como "por mover a TC" hasta confirmarse; los gastos de `gastosLocales` nunca
  aparecen ahí (no tienen fila en `gastos`). Una línea FGP pagada con débito consume el fondo
  sin pedir traspaso. Sin push/notificación: el aviso es solo dentro de la app.

- GAP: dueño/responsable operacional del deploy.
- GAP: documentación formal del workflow n8n (nodos, formato de respuesta).
- GAP: estrategia de backups de PostgreSQL en producción.
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
- GAP: las tools `buscar_gastos_pendientes`/`editar_gasto`/`buscar_gastos` del agente (F3) solo ven gastos ya
  sincronizados a Postgres — no pueden buscar ni editar `gastosLocales` (gastos manuales
  guardados solo en `localStorage` del browser), porque el agente corre server-side.
- GAP: el modo privacidad no oculta montos en el chat del agente.
- GAP: los adjuntos de imagen del chat (boletas/comprobantes) se persisten como `data:` URL
  base64 dentro de `agente_mensajes.parts` (JSONB) — sin límite de tamaño ni storage aparte;
  puede crecer la fila/DB con el tiempo si se suben muchas fotos.
- GAP: no hay forma de borrar o renombrar una conversación del agente desde la UI — solo
  listar (`GET /api/agente/conversaciones`) y reabrir.
- GAP: ingresos (DEC-020). "Uso de fondos" no descuenta el saldo de la reserva o del fondo de
  ahorro, y registrarlo además de un gasto con `financiado_por` cuenta doble (la UI lo advierte,
  no lo bloquea). El agente de `/agente` no tiene las tools de clases, así que "Isabel me
  transfirió" no propone el pago de la familia. "Otros" del previsto es una mezcla que el usuario
  separará. Sin captura de ingresos por mail (decisión del usuario, por ahora).
- GAP: `fondo_ahorro_movimiento` (libro de aportes/ajustes de fondos de ahorro manuales, ahora
  la fuente real del saldo — ver DEC-015) no tiene fila inicial para fondos creados/editados
  antes de esa migración; el saldo desde ese punto en adelante es correcto pero el historial de
  un fondo viejo puede arrancar sin explicación.
- GAP: clases particulares. Las clases importadas de Notion como `Pagado` no tienen fila en `pago`
  ni ingreso: no suman a "cobrado" (no tienen fecha de pago), pero sí cuentan como ingreso
  automático del ciclo siguiente (DEC-021). Hoy una clase solo pasa a cobrada con un pago
  registrado o por el import: no hay "marcar cobrada" sin pago. El formato real del export de Notion se
  validó con el CSV del usuario (checkbox `Property`, `Horas` como `1:30` / `1 (2)`).
  `buscar_clases.actualizada_desde` depende de `updated_at`, que solo se actualiza por la app.
- El Dashboard (DEC-020): la card "Ingresos" muestra el ingreso **real confirmado** (con el previsto
  y lo por aprobar en el detalle), y hay dos saldos: **Saldo real** (real + uso de fondos −
  gastado) y **Saldo esperado** (esperado + uso de fondos − gastado). Al comienzo del ciclo, antes de
  que llegue el sueldo, el saldo real es negativo. `/cashflow`, `resumenCiclo` y la tool
  `resumen_presupuesto` siguen usando el ingreso previsto.
