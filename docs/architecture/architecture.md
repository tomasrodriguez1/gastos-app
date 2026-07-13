# Gastos App — Arquitectura

## Resumen

SPA React servida por Vite en desarrollo y por Hono (`serveStatic`) en producción. API REST monolítica en el mismo proceso Bun. PostgreSQL como persistencia.

## Frontend

- **Framework:** React 19 + React Router 7
- **Build:** Vite 8 con plugin React y Tailwind v4
- **Estado:** props desde `App.jsx`; hooks por dominio (`useGastos`, `usePresupuesto`, etc.)
- **Gráficos:** Recharts
- **Puerto dev:** 6001, proxy `/api` → 3001

## Backend

- **Runtime:** Bun
- **Framework:** Hono 4
- **Puerto:** `PORT` (default 3001)
- **Archivo principal:** `server/index.js`
- **Auth:** middleware global con cookie/query token en producción

## Base de datos

- **Motor:** PostgreSQL
- **Cliente:** `postgres` (porsager/postgres)
- **Conexión:** `DATABASE_URL` (requerida)
- **SSL:** requerido en prod si URL no incluye `sslmode=`
- **Inicialización:** `RUN_SCHEMA_INIT=true` o `NODE_ENV !== 'production'` ejecuta `schema.pg.sql`

## Storage

No hay object storage. Datos en PostgreSQL. `localStorage` para `lastSync` (n8n), `logLastViewed` (última visita a `/log`, para resaltar gastos nuevos) y migración legacy de gastos manuales.

## Workers / jobs

Ninguno. Sync n8n disparado manualmente desde UI.

## Integraciones

| Servicio | Dirección | Propósito |
|----------|-----------|-----------|
| n8n | Cliente → webhook externo | Importar gastos bancarios |
| Railway | Deploy | Hosting API + frontend estático |
| PostgreSQL (Railway/Neon) | Servidor → DB | Persistencia |

Ver `docs/architecture/integrations.md`.

## Autenticación

Token compartido (`ACCESS_TOKEN`) en producción. Cookie HTTP-only `gastos_access`. Primera visita vía `?t=TOKEN`.

## Entornos

| Entorno | Frontend | API | DB | Auth |
|---------|----------|-----|-----|------|
| Local | Vite :6001 | Bun :3001 | PostgreSQL local/remoto | Deshabilitada |
| Producción (Railway) | `dist/` estático | mismo proceso | PostgreSQL managed | Token requerido |

## Flujo general

```txt
Usuario → Browser (React SPA)
              ↕ fetch /api/*
         Hono (Bun) ←→ PostgreSQL
              ↕ (dev only)
         n8n webhook ← POST desde browser (VITE_N8N_WEBHOOK_URL)
```

## Riesgos

- Token en URL en primera visita (se redirige a URL limpia, pero puede quedar en logs del browser).
- Webhook n8n llamado desde el cliente (URL expuesta en bundle si `VITE_*`).
- Sin rate limiting en API.
- Schema PG sin migraciones versionadas post-migración SQLite.

## Decisiones pendientes

- GAP: formalizar migraciones PG versionadas.
- GAP: mover sync n8n al backend para no exponer webhook URL.
- GAP: estrategia de backup/restore PostgreSQL.
