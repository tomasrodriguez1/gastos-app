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
| `mes` | TEXT | Mes contable (YYYY-MM) |
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
| `created_at`, `updated_at` | TIMESTAMPTZ | Auditoría |

**Índices:** `mes`, `fecha`, `sync_key` (parcial WHERE NOT NULL).

**Reglas de negocio:**

- Monto efectivo siempre vía `montoReal()` en `src/utils/calculos.js`.
- Sync UPSERT preserva overrides manuales con `COALESCE`.
- Filas pure-USD excluidas de totales agregados.
- UI puede usar `fecha|motivo` como id lógico; PATCH/DELETE usan UUID o `sync_key`.

### Presupuesto (normalizado)

| Tabla | Propósito |
|-------|-----------|
| `presupuesto_mes` | Cabecera por mes (`mes` PK) |
| `presupuesto_ingreso` | Ingresos por fuente |
| `presupuesto_categoria` | Previsto por grupo/subcategoría + flag `fgp` |
| `presupuesto_fondo` | Fondos de ahorro con `vinculado` JSON, `fecha_meta`, `emoji` |

**PUT presupuesto:** reemplazo por sección (solo las secciones enviadas se borran/reescriben).

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

### `duplicado_exclusion`

Pares `(gasto_id_a, gasto_id_b)` marcados como "no es duplicado" por el usuario.

### `config`

Clave-valor genérico (usado en SQLite para tracking de migraciones).

## Relaciones

```txt
presupuesto_mes 1──* presupuesto_ingreso
presupuesto_mes 1──* presupuesto_categoria
presupuesto_mes 1──* presupuesto_fondo
catalogo_grupo 1──* catalogo_subcategoria
gastos.presupuesto_manual → grupo/subcategoria (JSON, no FK)
presupuesto_fondo.vinculado → grupo/subcategoria (JSON)
```

## Máquinas de estado

No hay estados formales en gastos. `pagado` es booleano. Duplicados tienen confianza (alta/media/baja) calculada, no persistida.

## Permisos / RLS

GAP: no hay Row Level Security. App de usuario único con auth por token a nivel HTTP. PostgreSQL accesible solo desde el servidor.

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

**PG:** schema aplicado vía `initSchema()` leyendo `schema.pg.sql`. GAP: sistema de migraciones versionadas para PG.

## Qué no debe romperse

- Unicidad de `sync_key` para deduplicación n8n.
- Preservación de `presupuesto_manual`, `contexto_override`, `monto_clp_manual`, `monto_presupuesto_manual` en sync.
- Integridad referencial presupuesto → `presupuesto_mes`.
- Orden de prioridad en `regla_mapeo`.
