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
| `presupuesto_fondo` | Fondos de ahorro con `vinculado` JSON, `fecha_meta`, `emoji` |

**PUT presupuesto:** reemplazo por sección dentro del ciclo (solo las secciones enviadas se borran/reescriben).

**`vinculado` JSON:** `{ grupo, subcategoria, desde? }` — cambios propagan a gastos vinculados.

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
reserva_tarjeta.banco ~ gastos.banco (convención, no FK)
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

**PG:** schema aplicado vía `initSchema()` leyendo `schema.pg.sql`. GAP: sistema de migraciones versionadas para PG — las tablas nuevas siguen el mismo patrón `CREATE TABLE IF NOT EXISTS` que el resto del archivo.

## Qué no debe romperse

- Unicidad de `sync_key` para deduplicación n8n.
- Unicidad de `fuente_id` para idempotencia de `/api/ingesta`.
- Ningún gasto ingresado por `/api/ingesta` debe nacer en `estado='confirmado'` — ni el parser
  determinista ni Groq deben poder saltarse la revisión humana.
- Ningún gasto creado por el agente conversacional (`/api/agente/chat`, F3) debe nacer en
  `estado='confirmado'` — el agente solo crea, nunca confirma (ver `server/agente.js`).
- Ni Groq ni el agente conversacional pueden escribir `tipos`/`contexto` fuera del catálogo
  real (`catalogo_tipo`/`catalogo_contexto`) — filtro duro server-side en ambos casos.
- Preservación de `presupuesto_manual`, `contexto_override`, `monto_clp_manual`, `monto_presupuesto_manual` en sync.
- Integridad referencial presupuesto → `presupuesto_ciclo`.
- Orden de prioridad en `regla_mapeo`.
