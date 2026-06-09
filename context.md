# Gastos App — Context

Read this at the start of each session, then only files for the area you are changing.

## Overview

Personal finance app: **actual spending vs monthly budget**. Local-only, SQLite. Lives in `Gastos/` next to `whisper-money/` (unrelated stack).

| Route | Purpose |
|-------|---------|
| `/` | Dashboard: month summary, charts, category traffic lights, savings funds, n8n sync |
| `/gastos` | Expense table (synced + manual), filters, budget assignment |
| `/presupuesto` | Monthly budget editor (income, categories, funds) |

## Stack

React 19 · React Router 7 · Vite 8 · Tailwind v4 · Recharts · **Hono 4 on Bun** (`bun:sqlite`) · SQLite `data/gastos.db` · n8n webhook `VITE_N8N_WEBHOOK_URL`

Dev: `bun run dev` → API `:3001` + Vite `:6001` (proxies `/api`).

Lanzador de escritorio: `Iniciar-Gastos.command` (raíz de `gastos-app/`). Doble clic desde el Escritorio abre Terminal, arranca ambos procesos y luego abre el navegador en `:6001`. Hay un symlink en `~/Desktop/Iniciar-Gastos.command` apuntando a este archivo.

## Layout

```
gastos-app/
├── context.md
├── server/index.js, migrations/run.js, db/schema.sql
├── data/gastos.db
├── public/data/gastos_data_canonical.json   # seed if DB empty
└── src/
    ├── App.jsx          # hooks + routes
    ├── pages/           # Dashboard, Gastos, Presupuesto
    ├── components/      # Dashboard/, Gastos/, Presupuesto/, shared/
    ├── hooks/           # useGastos, useGastosLocales, usePresupuesto, useSyncN8n, useCatalogos
    ├── contexts/        # PrivacyModeContext
    └── utils/           # persistencia, calculos, mapeo, formatters
```

## Data model

**`gastos`** (single table, `es_manual` flag):

| Source | `es_manual` | Key |
|--------|-------------|-----|
| n8n / bulk | `0` | UUID `id` + `sync_key` = `fecha\|motivo` (lowercase) |
| UI manual | `1` | UUID `id`, no `sync_key` |

Important fields: `fecha`, `mes`, `motivo`, `banco`, `tipos[]`, `contexto`, amounts (`monto`, `monto_real`, `usd`, `monto_clp_manual`), `presupuesto_manual`, overrides, `pagado`.

**Effective amount** — always `montoReal()` in `calculos.js`: manual budget amount → else exclude pure-USD rows → else `monto_real ?? monto`.

**Budget** (normalized): `presupuesto_mes` + `presupuesto_ingreso` / `_categoria` / `_fondo` (funds may have `vinculado` JSON).

**Catalogs** (`catalogo_*`) and **`regla_mapeo`** (priority rules → `grupo_dest` / `subcat_dest`; `_NONE_` = unmapped). Migrations run on server start (`migrations/run.js`).

## Key flows

1. **Boot** (`App.jsx`): load mapping rules → synced expenses → manual expenses (legacy `localStorage` migrate) → all budgets. Dashboard merges both expense lists; `/gastos` keeps them separate.
2. **n8n sync**: POST webhook `{ since: lastSync }` → dedupe via `/api/gastos/sync-keys` → `SyncReview` modal → save on confirm (`POST /api/datos?clave=gastos`).
3. **Expense → budget**: `presupuesto_manual` > DB rules (`mapeo.js` + server) > client fallback.
4. **Updates**: synced → optimistic UI + `PATCH /api/gastos/:id`; manual → full array `POST ...gastos_manuales`; budget → `PUT /api/presupuesto/:mes` (partial sections only replace what you send).
5. **Duplicates**: `useDuplicados` hook fetches `GET /api/gastos/duplicados?mes=…` on mount/mes-change; button in `/gastos` shows badge with count; `DuplicadosReview` modal shows groups by confidence (alta/media/baja) with inline edit (`EditarAsignacion`) and delete. "No es duplicado" stores pair in `duplicado_exclusion` table (migration 010).

**Privacy**: `PrivacyModeContext` + `privacyFormat()` hide amounts in UI.

## API (dev: `/api` → `:3001`)

- Expenses: `GET/PATCH/DELETE /api/gastos`, `sync-keys`, legacy `GET/POST /api/datos?clave=gastos|gastos_manuales`
- Duplicados: `GET /api/gastos/duplicados?mes=YYYY-MM` → `{ mes, resumen, grupos[] }`; `POST /api/gastos/duplicados/excluir` body `{ id_a, id_b }` — persiste pares que el usuario marca como "no es duplicado".
- Budget: `GET /presupuesto/meses`, `GET/PUT /presupuesto/:mes`, `POST .../copiar-anterior`
- Catalogs & rules: `/api/catalogos/*`, `/api/reglas-mapeo`

## Conventions

- JSX only; state from `App.jsx` props — no global store.
- CLP formatting: `formatters.js`. Aggregations: `calculos.js`. Assignment: `mapeo.js`.
- Backend: routes in `server/index.js`; PATCH fields whitelisted; sync UPSERT preserves manual overrides via `COALESCE`.
- Schema changes: new migration in `run.js` — never edit applied migrations.
- Do not commit `data/gastos.db`, `.env`, or add docs unless asked.

## Commands

```bash
bun run dev      # API + Vite
bun run server   # API only
bun run build && bun run lint
```

## Pitfalls

- Two expense sources: `gastos` (sync) vs `gastosLocales` (manual) — merged on dashboard only.
- UI id may be `fecha|motivo`; DB uses UUID for PATCH/DELETE.
- Pure-USD rows excluded from totals. Manual overrides must survive sync.
- After rule CRUD: `invalidarReglas()` + `cargarReglas()`.
- Budget PUT is section-scoped. DB context `Polola` (migration 009); client fallback may still say `Ale`.

## Where to read next

| Area | Files |
|------|-------|
| Dashboard | `pages/DashboardPage.jsx`, `utils/calculos.js`, `components/Dashboard/*` |
| Expenses UI | `pages/GastosPage.jsx`, `components/Gastos/*`, `hooks/useGastos*.js` |
| Duplicates | `server/duplicados.js`, `hooks/useDuplicados.js`, `components/Gastos/DuplicadosReview.jsx` |
| Budget UI | `pages/PresupuestoPage.jsx`, `hooks/usePresupuesto.js`, `components/Presupuesto/*` |
| n8n sync | `hooks/useSyncN8n.js`, `components/Dashboard/SyncReview.jsx` |
| Mapping | `utils/mapeo.js`, `EditarAsignacion.jsx`, `server/index.js` (reglas) |
| API / DB | `server/index.js`, `migrations/run.js`, `db/schema.sql` |
| Shell / privacy | `App.jsx`, `shared/Header.jsx`, `PrivacyModeContext.jsx` |

**New chat prompt:** `Read gastos-app/context.md, then only files for [area].`
