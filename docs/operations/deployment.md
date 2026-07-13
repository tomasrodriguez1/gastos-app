# Gastos App — Deployment

## Entornos

| Entorno | Descripción |
|---------|-------------|
| Local | Vite + API Bun, PostgreSQL local o remoto |
| Producción | Railway (config en `railway.json`) |

## Plataforma

**Railway** — build y start definidos en `railway.json`:

```json
{
  "build": { "buildCommand": "bun install && bun run build" },
  "deploy": { "startCommand": "bun run start" }
}
```

## Servicios

Un solo servicio Railway ejecuta:

1. API Hono en `server/index.js`
2. Frontend estático desde `dist/` (solo `NODE_ENV=production`)

## Comandos

| Fase | Comando |
|------|---------|
| Build | `bun install && bun run build` |
| Start | `bun run start` → `bun run server/index.js` |
| Dev | `bun run dev` |

## Base de datos

- PostgreSQL vía `DATABASE_URL` (requerida).
- Schema: `initSchema()` corre si `RUN_SCHEMA_INIT=true` o en no-producción.
- Migración inicial SQLite→PG: `bun run migrate:pg` (one-shot, requiere SQLite local).

## Variables de entorno requeridas (prod)

| Variable | Requerida |
|----------|-----------|
| `DATABASE_URL` | Sí |
| `NODE_ENV` | Sí (`production`) |
| `ACCESS_TOKEN` | Sí |
| `VITE_N8N_WEBHOOK_URL` | Sí (build time) |
| `PORT` | Auto (Railway) |
| `CORS_ORIGIN` | No en prod (same-origin) |
| `RUN_SCHEMA_INIT` | Opcional (true para init schema) |

Ver `docs/operations/env-vars.md`.

## Proceso de deploy

1. Push a branch conectada a Railway (supuesto).
2. Railway ejecuta build (instala deps + `vite build`).
3. Start ejecuta servidor Bun.
4. Verificar health: app carga, token funciona, API responde.

## Rollback

1. Revertir commit en Railway o redeploy versión anterior.
2. GAP: procedimiento formal de rollback de schema PG no documentado.
3. Si schema cambió: restaurar backup DB (GAP: política de backups).

## Gaps

- GAP: URL de producción exacta.
- GAP: branch de deploy (main vs otra).
- GAP: CI/CD pipeline aparte de Railway.
- GAP: health check endpoint dedicado.
- GAP: estrategia de migraciones PG en prod post-deploy.
