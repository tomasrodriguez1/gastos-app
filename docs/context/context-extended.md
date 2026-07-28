# Gastos App — Contexto técnico extendido

## Módulos principales

### Frontend (`src/`)

| Módulo | Ubicación | Responsabilidad |
|--------|-----------|-----------------|
| App shell | `App.jsx` | Hooks globales, rutas, merge de gastos sync+manual |
| Páginas | `pages/` | Dashboard, Cashflow, Análisis, Gastos, Presupuesto |
| Componentes | `components/` | UI por dominio (Dashboard, Gastos, Presupuesto, Análisis, shared) |
| Hooks | `hooks/` | Data fetching, sync n8n, presupuesto, duplicados, catálogos |
| Utils | `utils/` | Cálculos, mapeo, formatters, persistencia, recurrentes |
| Contextos | `contexts/PrivacyModeContext.jsx` | Ocultar montos en UI |

### Backend (`server/`)

| Módulo | Ubicación | Responsabilidad |
|--------|-----------|-----------------|
| API | `index.js` | Rutas Hono, auth, serialización, presupuesto, catálogos, reglas |
| DB client | `db/client.js` | Pool PostgreSQL con SSL en prod |
| Schema | `db/schema.pg.sql`, `db/init.js` | DDL PostgreSQL |
| Duplicados | `duplicados.js` | Detección por mes con niveles alta/media/baja |
| Migraciones legacy | `migrations/run.js`, `migrate.js` | SQLite (histórico) |
| Migración PG | `migrate-to-pg.js` | One-shot SQLite → PostgreSQL |

## Flujo de datos

```txt
n8n webhook → useSyncN8n → SyncReview (UI) → POST /api/datos?clave=gastos
                                                    ↓
                                            PostgreSQL (gastos)
                                                    ↓
useGastos / useGastosLocales ← GET /api/datos ←────┘
        ↓
App.jsx merge → páginas → calculos.js / mapeo.js
```

**Presupuesto:** `usePresupuesto` ↔ `GET/PUT /api/presupuesto/:ciclo`. El ciclo se deriva de cada fecha con corte 29–28; `mes` queda como filtro calendario secundario.

**Mapeo:** reglas en `regla_mapeo` → `mapeo.js` (cliente) + `mapearGastoConRegla` (servidor)

## Servicios internos

- **API Hono monolítica** (`server/index.js`): sin capa service/repository separada.
- **Detección de duplicados** (`server/duplicados.js`): Jaccard sobre tokens de motivo + proximidad de monto/fecha.
- **Detección de recurrentes** (`src/utils/recurrentes.js`): client-side, ≥3 meses distintos, estabilidad de montos.

## Jobs / workers

No hay workers ni colas. Sync n8n es on-demand desde el cliente.

## Autenticación

- **Dev:** acceso libre si `NODE_ENV !== 'production'` o sin `ACCESS_TOKEN`.
- **Prod:** cookie `gastos_access` o query param `?t=TOKEN` (primera visita, redirige a URL limpia).
- Rutas `/api/*` validan token vía cookie (middleware global en `server/index.js`).

## Manejo de errores

- Frontend: estados de error en hooks (`syncError`, `errorGuardado`); banner en App si falla guardado de presupuesto.
- Backend: respuestas JSON con `{ error: string }` y códigos HTTP apropiados.
- Sync n8n: errores silenciosos parciales en `confirmarSync` (GAP: mejorar feedback).

## Observabilidad

- Logs en consola del servidor Bun (`console.log` / `console.error`).
- GAP: métricas, APM, alertas estructuradas.

## Riesgos técnicos

- API monolítica grande (`server/index.js` ~600 líneas): difícil de testear por unidad.
- Dos fuentes de gastos (sync vs manual) con IDs y claves distintas.
- `context.md` raíz y docs previos referían SQLite; código actual usa PostgreSQL.
- Cliente fallback de contexto puede decir "Ale" mientras DB usa "Polola" (migración 009).

## Deuda técnica

- Scripts SQLite legacy (`migrations/run.js`, `migrate.js`) coexisten con PG.
- Sin tests automatizados (Playwright en devDependencies pero sin suite visible).
- `.env.example` anterior contenía un token real (corregido en estandarización Zalantos).
- `Iniciar-Gastos.command` tiene path hardcodeado a `/Users/tomasrodriguez/Desktop/Gastos/gastos-app`.
