# Gastos App — Context (legacy)

> **Documentación canónica:** ver [`docs/context/context.md`](docs/context/context.md).
>
> Este archivo se mantiene por compatibilidad con prompts existentes (`Read gastos-app/context.md`).
> Contenido actualizado en la carpeta `docs/` según estándar Zalantos.

## Quick reference

| Ruta | Propósito |
|------|-----------|
| `/` | Dashboard |
| `/cashflow` | Cashflow + sync n8n |
| `/analisis` | Análisis histórico |
| `/gastos` | Tabla de gastos |
| `/presupuesto` | Editor presupuesto |

**Stack:** React 19 · Vite 8 · Hono/Bun · **PostgreSQL** · n8n

**Dev:** `bun run dev` → API `:3001` + Vite `:6001`

## Where to read next

| Área | Archivos |
|------|----------|
| Contexto completo | `docs/context/context.md` |
| Modelo de datos | `docs/context/data_model_context.md` |
| Arquitectura | `docs/architecture/architecture.md` |
| Agentes IA | `AGENTS.md` |
| Dashboard | `pages/DashboardPage.jsx`, `utils/calculos.js` |
| Gastos | `pages/GastosPage.jsx`, `hooks/useGastos*.js` |
| API / DB | `server/index.js`, `server/db/schema.pg.sql` |
| Sync n8n | `hooks/useSyncN8n.js` |

**New chat prompt:** `Read docs/context/context.md and AGENTS.md, then only files for [area].`
