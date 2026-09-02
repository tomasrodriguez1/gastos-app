# Gastos App — Modelo de datos

Fuente de verdad: `server/db/schema.pg.sql`. Migraciones históricas SQLite en `server/migrations/run.js`.

## Entidades principales

### `gastos`

Tabla única para gastos sincronizados y manuales.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | TEXT PK | UUID |
| `sync_key` | TEXT UNIQUE | `fecha\|motivo` (lowercase) para sync; NULL si manual |
| `fecha` | TEXT | Fecha del gasto (YYYY-MM-DD) |
| `mes` | TEXT | Mes calendario de la fecha real (YYYY-MM), disponible como filtro secundario |
| `ciclo_financiero` | TEXT | Ciclo presupuestario (YYYY-MM): días 1–28 conservan mes y días 29–31 financian el mes siguiente |
| `motivo` | TEXT | Descripción |
| `banco` | TEXT | Banco/medio de pago |
| `tipos` | JSONB | Array de tipos (catálogo) |
| `contexto` | TEXT | Contexto social/situacional |
| `monto` | NUMERIC | Monto nominal |
| `monto_real` | NUMERIC | Monto efectivo CLP |
| `usd` | NUMERIC | Componente USD |
| `monto_clp_manual` | NUMERIC | Override CLP manual |
| `split` | NUMERIC | Split/compartido |
| `presupuesto_manual` | JSONB | `{ grupo, subcategoria }` override |
| `contexto_override` | TEXT | Override de contexto |
| `monto_presupuesto_manual` | NUMERIC | Override monto presupuestario |
| `es_manual` | BOOLEAN | `false`=sync/n8n, `true`=UI manual |
| `pagado` | BOOLEAN | Marcado como pagado |
| `plata_en_cuenta` | BOOLEAN | El importe completo del gasto ya está reservado en el fondo de pago de TC |
| `en_presupuesto` | BOOLEAN | Si el gasto impacta las agregaciones presupuestarias |
| `financiado_por` | TEXT | Nombre del fondo de ahorro que financió el gasto; NULL si sale del ciclo |
| `conciliado` | BOOLEAN | El movimiento fue incluido en un estado de cuenta cuyo total cuadró |
| `estado` | TEXT | `confirmado` (default, todo lo pre-existente) \| `pendiente` \| `error_parseo` \| `descartado` — ver "Bandeja de ingesta" abajo |
| `origen` | TEXT | `manual` (default) \| `mail` \| `chat` (F3, agente conversacional) — de dónde entró el gasto |
| `fuente_id` | TEXT | Id externo (p.ej. id de mensaje de Gmail) para idempotencia de ingesta; único (parcial WHERE NOT NULL) |
| `payload_raw` | JSONB | Mensaje/evento crudo tal como llegó a `/api/ingesta`, preservado siempre aunque el parseo falle |
| `created_at`, `updated_at` | TIMESTAMPTZ | Auditoría |

**Índices:** `ciclo_financiero`, `mes`, `fecha`, `sync_key` (parcial WHERE NOT NULL),
`fuente_id` (único, parcial WHERE NOT NULL), `estado` (parcial WHERE != 'confirmado').

**Reglas de negocio:**

- Monto efectivo siempre vía `montoReal()` en `src/utils/calculos.js`; el impacto presupuestario usa `montoPresupuestable()` para aplicar `en_presupuesto` y `split` sin alterar ese monto base.
- Un gasto con `financiado_por` sigue visible en análisis de categorías (`incluirFinanciados: true`) pero no come el sobre del ciclo: `montoDelCiclo()` lo trata como 0 (la plata ya se apartó en aportes al fondo).
- Sync UPSERT preserva overrides manuales con `COALESCE`.
- Filas pure-USD excluidas de totales agregados.
- UI puede usar `fecha|motivo` como id lógico; PATCH/DELETE usan UUID o `sync_key`.

### Bandeja de ingesta (`estado`)

Gastos que llegan por `POST /api/ingesta` (ver `docs/architecture/integrations.md`) nacen en
`estado='pendiente'` — nunca se confirman automáticamente, ni por el parser determinista ni
por la clasificación de Groq. `/log` es la bandeja donde se revisan y confirman
(`PATCH /api/gastos/:id` con `{ estado: 'confirmado' }`) o descartan (soft-delete vía
`{ estado: 'descartado' }`, conserva `payload_raw` para auditoría — distinto de `DELETE`, que
borra la fila). Si ni el parser ni Groq logran extraer los campos, el gasto queda en
`estado='error_parseo'` con `monto=0` y el usuario lo completa a mano.

Gastos `pendiente` sin `grupo` resuelto (comercio aún no clasificado) cuentan igual en los
totales por categoría del Dashboard/Análisis/Presupuesto, agrupados en el bucket sintético
`SIN CLASIFICAR` (`src/utils/calculos.js`) — la plata ya salió de la cuenta, solo falta la
categoría. Gastos `confirmado` sin grupo (tipos como `Ajuste`/`Turno`/`Otro`, ver
`mapeo.js`) siguen excluidos de esos totales a propósito, sin cambios.

### Presupuesto por ciclo (normalizado)

| Tabla | Propósito |
|-------|-----------|
| `presupuesto_ciclo` | Cabecera por ciclo financiero (`ciclo` PK) |
| `presupuesto_ingreso` | Ingresos por fuente |
| `presupuesto_categoria` | Previsto por grupo/subcategoría + flag `fgp` |
| `presupuesto_fondo` | Fondos de ahorro con `vinculado` JSON, `fecha_meta`, `emoji`, `estado` (`activo`\|`cerrado`) |

**PUT presupuesto:** reemplazo por sección dentro del ciclo (solo las secciones enviadas se borran/reescriben).

**`vinculado` JSON:** `{ grupo, subcategoria, desde? }` — cambios propagan a gastos vinculados.

**Uso del fondo:** no se borra ni se cubre con un ingreso falso. El gasto real queda con `financiado_por = nombre del fondo`; el saldo mostrado es `aportes − usos`. `estado='cerrado'` lo archiva (sigue en el ciclo, no se copia al siguiente). Renombrar el fondo actualiza `gastos.financiado_por`.

### Catálogos

| Tabla | Relación |
|-------|----------|
| `catalogo_grupo` | Grupos presupuestarios |
| `catalogo_subcategoria` | FK → `catalogo_grupo` |
| `catalogo_tipo` | Tipos de gasto |
| `catalogo_banco` | Bancos/medios |
| `catalogo_contexto` | Contextos (ej. Polola, Trabajo, Amigos) |

Seed inicial en migración SQLite 004 (replicado vía `migrate-to-pg.js`).

### `regla_mapeo`

Reglas de asignación automática gasto → presupuesto.

| Campo | Uso |
|-------|-----|
| `prioridad` | Orden ascendente |
| `contexto`, `tipo`, `banco`, `motivo_regex` | Condiciones (NULL = wildcard) |
| `grupo_dest`, `subcat_dest` | Destino; `_NONE_` = sin mapeo |
| `activa` | Soft enable |

### `comercio_mapeo` (F2 — memoria de comercios)

Aprendida de confirmaciones humanas, se consulta **antes** que cualquier LLM en la cascada
de clasificación (ver `docs/architecture/integrations.md`).

| Campo | Uso |
|-------|-----|
| `comercio_normalizado` | PK — motivo normalizado (`src/utils/comercio.js`: mayúsculas, sin tildes, sin prefijos de adquirente/pasarela, sin sufijos numéricos) |
| `comercio_ejemplo` | Último `motivo` real visto (sin normalizar), para mostrar en UI |
| `tipos`, `contexto` | Última clasificación confirmada — pisa a la anterior (last-write-wins) |
| `presupuesto_manual` | `{ grupo, subcategoria }` si alguna vez se forzó a mano para ese comercio; NULL si no |
| `banco_habitual` | Último banco visto para ese comercio |
| `veces_confirmado` | Contador acumulativo — señal de confianza en UI, no gatea si se aplica (se aplica desde la 1ª confirmación) |
| `ultima_confirmacion` | Timestamp de la última vez que se aprendió/actualizó |

Se alimenta desde `PATCH /api/gastos/:id` (`server/index.js`): cuando el UPDATE deja el gasto
en `estado='confirmado'`, hace upsert best-effort (`server/comercios.js:aprenderComercio`) —
nunca hace fallar el guardado del gasto. No aprende de gastos `pendiente` editados, solo de
confirmaciones.

### Historial del agente conversacional (F3)

| Tabla | Propósito |
|-------|-----------|
| `agente_conversaciones` | Una fila por sesión de `/agente`: `id` (TEXT PK, generado client-side), `titulo` (derivado del primer texto del usuario, `LEFT(texto, 60)`, se fija una sola vez), `created_at`, `updated_at` |
| `agente_mensajes` | Un mensaje por fila: `id` (TEXT PK — el `message.id` que ya genera `useChat`/`generateMessageId`), `conversacion_id` (FK → `agente_conversaciones` ON DELETE CASCADE), `role`, `parts` (JSONB — el `UIMessage.parts[]` completo: texto, adjuntos, tool-calls con `input`/`output`/`state`), `created_at` |

La conversación se crea recién con el primer mensaje (`crearConversacion`, upsert
`ON CONFLICT DO NOTHING`) — si nunca se escribe nada, no queda fila. `parts` se guarda tal cual
llega del stream del agente (`server/agente/historial.js`): como ya incluye los tool-parts con
su resultado, reabrir una conversación reconstruye tanto el diálogo como las acciones
(crear/editar gasto) sin un modelo de datos aparte para eso. Sin paginación en
`listarConversaciones()` (`LIMIT 200`) — GAP si crece mucho. Adjuntos de imagen viajan
embebidos como `data:` URL dentro de `parts` — GAP de tamaño, ver `docs/context/context.md`.

### `duplicado_exclusion`

Pares `(gasto_id_a, gasto_id_b)` marcados como "no es duplicado" por el usuario.

### `config`

Clave-valor genérico (usado en SQLite para tracking de migraciones).

### `reserva_tarjeta`

Saldo manual legacy reservado para cada tarjeta. Una fila por `banco` (PK), valor `monto`
editable desde `/tarjeta`. Desde F5 se conserva solo como referencia de transición: no participa
en los totales derivados desde `gastos.plata_en_cuenta`.

**Diseño intencional:** es standalone, **no** un `presupuesto_fondo` vinculado. Vincularlo al
presupuesto (vía `vinculado` + gasto de aporte) duplicaría el gasto: el cargo de la tarjeta ya se
registra una vez en `gastos`; registrar también un "aporte al fondo" lo contaría dos veces. Por eso
`reserva_tarjeta` vive fuera del ciclo de presupuesto y no se toca en el UPSERT de sync.

### `tarjeta_ciclo`

Día de cierre configurable por tarjeta, una fila por `banco` (PK):

```sql
tarjeta_ciclo(banco PK, dia_cierre SMALLINT CHECK 1-28, updated_at)
```

Se usa para calcular si un movimiento pendiente de `/tarjeta` ya quedó en un estado de cuenta
cerrado ("facturado") o si todavía puede aparecer en el próximo corte ("no facturado"). **Diseño
intencional: derivado, no persistido en `gastos`.** `server/tarjeta.js` calcula esto en cada
request (`facturado()`/`cierreDelPeriodo()`) a partir de `gastos.fecha` + `dia_cierre`, en vez de
guardar un campo `facturado` por gasto — así, cambiar el día de cierre desde la UI recalcula todo
al instante sin tener que re-sincronizar filas existentes (mismo motivo que llevó a no persistir
esto). Sin fila para un banco = "sin ciclo configurado"; `crearResumenTarjeta` y el frontend tratan
ese caso como `facturado = null` (no se asume un día por defecto).

`GET/PUT /api/tarjeta/ciclos(/:banco)` gestionan la tabla; `GET /api/tarjeta/resumen` la consulta
para anotar `facturados`/`no_facturados`/`monto_facturado`/`monto_no_facturado` en cada nivel de
`crearResumenTarjeta` (totales, por banco y por categoría).

GAP: el cálculo de facturado se recalcula sobre todos los movimientos pendientes en cada request
a `/api/tarjeta/resumen`; si el volumen de gastos por tarjeta crece mucho podría materializarse.

**Semántica de `gastos.split` en esta vista:** monto CLP del cargo que le deben a Tomás (compra
por terceros). No afecta `montoReal()` ni el presupuesto (deliberado — ver "Qué no debe cambiarse").
En `/tarjeta`: Por pagar = Σ`monto` (no pagados) · Por cobrar = Σ`split` · Gasto neto = la resta.

**F5:** `split` reduce únicamente el impacto presupuestario mediante `montoPresupuestable()` y
no reduce la deuda de tarjeta. Un `monto_presupuesto_manual` explícito tiene prioridad para evitar
restar el split dos veces.

La reconciliación se limita a Edwards y BICE y mantiene CLP/USD separados. `conciliado=true`
representa que el gasto formó parte de un estado cuadrado; `pagado=true` se asigna después, cuando
el pago efectivamente salió. Fondo actual y falta depositar siguen incluyendo conciliados mientras
no estén pagados.

### `reserva` / `reserva_saldo`

Bolsillos de ahorro externos (ej. Mercado Pago: mantención auto, patente, vacaciones, plata
para terceros como Ale/FGP), con historial de saldos leídos por foto o dictados vía el agente
conversacional (F6, ver `context.md`). El agente también crea, lista, edita y archiva el
catálogo (`listar_reservas` / `crear_reserva` / `editar_reserva`); no borra filas ni cambia
`vinculado` después de crear. **No confundir con `reserva_tarjeta`** (arriba): esa es un valor único por
banco sin historial; `reserva` es un catálogo persistente (`nombre`, `vinculado`, `tasa_anual`,
`activa`) con snapshots en `reserva_saldo` (`fecha`, `monto_leido`, `monto_esperado`, `diferencia`).
Ambas coexisten por el mismo motivo: standalone, fuera del ciclo de presupuesto, para no fusionarse
con `presupuesto_fondo` (que se recrea/reemplaza cada mes vía PUT).

```sql
reserva(id, nombre UNIQUE, emoji, vinculado JSONB {grupo, subcategoria?}, tasa_anual, activa)
reserva_saldo(id, reserva_id FK, fecha, monto_leido, monto_esperado, diferencia, origen, UNIQUE(reserva_id, fecha))
```

**Cálculo del esperado** (`calcularSaldoEsperado` en `server/reservas.js`): a diferencia de
`presupuesto_fondo.vinculado` (que no tiene ningún cómputo automático server-side hoy — su
`acumulado` se escribe a mano desde el PUT), `reserva` sí calcula: retiros = suma de `gastos.monto`
(bruto, igual criterio que la deuda de tarjeta en `tarjeta.js` — no usa `montoPresupuestable()`)
de gastos `estado='confirmado'` entre el snapshot anterior y el nuevo, cuya categoría —
**resuelta reutilizando `resolverCategoria()` de `server/tarjeta.js`**, no `presupuesto_manual @>`
directo, porque ese campo solo se llena con overrides explícitos — matchea `vinculado`.
`subcategoria` ausente en `vinculado` = cuenta toda la categoría (grupo). Se suma además un
crecimiento estimado por interés simple prorrateado según `tasa_anual` (default 3%/año, aprox.
de lo que rinde el dinero en Mercado Pago). Gastos en USD puro quedan fuera del cálculo (sin FX
confiable server-side) y se reportan aparte, no se esconden.

**Corrección de una lectura:** no hay tool ni estado de revisión aparte — `UNIQUE(reserva_id,
fecha)` hace que un segundo `registrar_saldos_reserva` el mismo día haga upsert sobre el anterior.

### Autenticación (WebAuthn / Passkeys)

Ver DEC-009 en `docs/architecture/decisions.md`. Reemplaza `ACCESS_TOKEN` (que se mantiene
activo en paralelo durante la transición).

| Tabla | Propósito |
|-------|-----------|
| `passkey_credentials` | Una fila por passkey registrada: `credential_id` (único), `public_key` (BYTEA), `counter`, `transports`, `device_type`, `backed_up`, `name`, `created_at`, `last_used_at` |
| `webauthn_challenges` | Challenges de registro/login: `challenge` (único), `type` (`registration`\|`authentication`), `expires_at`, `consumed_at` — de un solo uso, reclamados atómicamente vía `UPDATE ... WHERE consumed_at IS NULL AND expires_at > NOW() RETURNING id` |
| `auth_sessions` | Sesiones opacas: `token_hash` (SHA-256 del token, único — nunca se guarda el token en texto plano), `expires_at`, `last_used_at`, `revoked_at` |

**Notas de diseño:**

- `passkey_credentials.id` (SERIAL, expuesto al cliente para borrar) es distinto de
  `credential_id` (WebAuthn, nunca expuesto) — así se cumple "nunca mostrar credential_id ni
  public_key completos" en la UI.
- `auth_sessions` no tiene FK a `passkey_credentials`: las sesiones son independientes de la
  credencial que las creó. Borrar una passkey no revoca sesiones ya emitidas con ella, solo
  bloquea logins futuros con esa credencial — trade-off aceptado, no es un bug.
- La tabla genérica `config` (ver arriba) guarda además una fila `clave='webauthn_user_id'` con
  el handle de usuario WebAuthn (generado una sola vez, reutilizado en cada registro — app
  single-owner, no hace falta una tabla de usuarios).
- No se puede eliminar la última passkey (`DELETE /api/auth/passkeys/:id` devuelve `400` si
  `COUNT(*) <= 1`) — guard server-side, no solo de UI.

## Relaciones

```txt
presupuesto_ciclo 1──* presupuesto_ingreso
presupuesto_ciclo 1──* presupuesto_categoria
presupuesto_ciclo 1──* presupuesto_fondo
catalogo_grupo 1──* catalogo_subcategoria
gastos.presupuesto_manual → grupo/subcategoria (JSON, no FK)
presupuesto_fondo.vinculado → grupo/subcategoria (JSON)
gastos.financiado_por → presupuesto_fondo.nombre (convención, no FK)
reserva_tarjeta.banco ~ gastos.banco (convención, no FK)
reserva 1──* reserva_saldo
reserva.vinculado → grupo/subcategoria (JSON, no FK) — mismo shape que presupuesto_fondo.vinculado
```

## Máquinas de estado

La tarjeta usa dos etapas booleanas: `conciliado` y luego `pagado`. Duplicados tienen confianza
(alta/media/baja) calculada, no persistida.

## Permisos / RLS

GAP: no hay Row Level Security. App de usuario único con auth por passkey/sesión a nivel HTTP
(`ACCESS_TOKEN` legacy en paralelo — ver DEC-009). PostgreSQL accesible solo desde el servidor.

## Migraciones relevantes

| ID | Descripción |
|----|-------------|
| 002 | UUID + sync_key (SQLite) |
| 003 | Presupuesto normalizado |
| 004 | Catálogos en DB |
| 005 | Reglas de mapeo + seed |
| 006 | emoji en fondos |
| 007 | pagado + auto-link fondos |
| 008 | `desde` en vinculado |
| 009 | Contextos: Ale → Polola |
| 010 | duplicado_exclusion |
| — | `passkey_credentials`, `webauthn_challenges`, `auth_sessions` (PG-only, ver DEC-009) |
| — | `estado`, `origen`, `fuente_id`, `payload_raw` en `gastos` (PG-only, `server/db/migrate-ingesta.js`) — bandeja de ingesta externa |
| — | `comercio_mapeo` (PG-only, `server/db/migrate-comercios.js`) — memoria de comercios (F2) |
| — | `plata_en_cuenta`, `en_presupuesto`, `conciliado` en `gastos` (PG-only, `server/db/migrate-tarjeta-reconciliacion.js`) — reconciliación F5 |
| — | `agente_conversaciones`, `agente_mensajes` (PG-only, `server/db/migrate-agente-historial.js`) — historial del agente conversacional (F3) |
| — | `gastos.financiado_por`, `presupuesto_fondo.estado` (PG-only, `server/db/migrate-fondo-uso.js`) — uso de fondos de ahorro |
| — | `reserva`, `reserva_saldo` (PG-only, `server/db/migrate-reservas.js`) — tracking de saldos reales vs esperados en reservas externas (F6) |

**PG:** schema aplicado vía `initSchema()` leyendo `schema.pg.sql`. GAP: sistema de migraciones versionadas para PG — las tablas nuevas siguen el mismo patrón `CREATE TABLE IF NOT EXISTS` que el resto del archivo.

## Qué no debe romperse

- Unicidad de `sync_key` para deduplicación n8n.
- Unicidad de `fuente_id` para idempotencia de `/api/ingesta`.
- Ningún gasto ingresado por `/api/ingesta` debe nacer en `estado='confirmado'` — ni el parser
  determinista ni Groq deben poder saltarse la revisión humana.
- Ningún gasto creado por el agente conversacional (`/api/agente/chat`, F3) debe nacer en
  `estado='confirmado'` — el agente solo crea, nunca confirma (ver `server/agente.js`).
- `crear_gasto` no inserta si `buscarSimilares` encuentra candidatos y `ignorar_duplicado` es
  false — el duplicado se avisa, no se confirma ni se descarta desde el chat.
- Ni Groq ni el agente conversacional pueden escribir `tipos`/`contexto` fuera del catálogo
  real (`catalogo_tipo`/`catalogo_contexto`) — filtro duro server-side en ambos casos.
- Preservación de `presupuesto_manual`, `contexto_override`, `monto_clp_manual`, `monto_presupuesto_manual`, `financiado_por` en sync.
- `registrar_saldos_reserva` / `crear_reserva` / `editar_reserva` (agente, F6) escriben directo
  en `reserva` / `reserva_saldo` sin gate de estado en DB (a diferencia de `crear_gasto` /
  `editar_gasto`) — la garantía de "el usuario vio el dato antes de que cuente" vive en el
  prompt (`server/agente.js`), que debe mostrar el resumen y esperar confirmación explícita en
  el turno siguiente antes de llamar a la tool. No quitar ese paso del prompt sin agregar un
  mecanismo de revisión equivalente. `crear_reserva` no acepta un `grupo`/`subcategoria` fuera
  del catálogo (`validarVinculadoContraCatalogo`). El agente no crea `presupuesto_fondo` ni
  borra reservas (solo `activa=false`).
- Integridad referencial presupuesto → `presupuesto_ciclo`.
- Orden de prioridad en `regla_mapeo`.
