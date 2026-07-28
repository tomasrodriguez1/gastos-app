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
- **Auth:** middleware global combinado (`server/auth.js`) — sesión passkey válida O
  `ACCESS_TOKEN` legacy. Endpoints de auth en `server/routes/auth.js`, montados en
  `/api/auth/*` y exentos del gate (cada uno aplica su propio control interno)

## Base de datos

- **Motor:** PostgreSQL
- **Cliente:** `postgres` (porsager/postgres)
- **Conexión:** `DATABASE_URL` (requerida)
- **SSL:** requerido en prod si URL no incluye `sslmode=`
- **Inicialización:** `RUN_SCHEMA_INIT=true` o `NODE_ENV !== 'production'` ejecuta `schema.pg.sql`
- **Período presupuestario:** `gastos.ciclo_financiero` se deriva de `fecha`; `gastos.mes` se conserva únicamente para consultas por mes calendario.
- **Migración de ciclos:** `bun run migrate:ciclos` renombra las claves históricas de presupuesto y recalcula/verifica los períodos sin alterar datos financieros.

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

Passkeys/WebAuthn (`@simplewebauthn/server` + `@simplewebauthn/browser`), single-owner. Sesión
propia (token opaco hasheado en `auth_sessions`) vía cookie HTTP-only `gastos_session`.
Enrolamiento inicial protegido por `PASSKEY_BOOTSTRAP_SECRET`. `ACCESS_TOKEN` (cookie legacy
`gastos_access`) se mantiene activo en paralelo durante la transición — ver DEC-009 en
`docs/architecture/decisions.md` y `docs/context/context.md` para el detalle de endpoints.

## Entornos

| Entorno | Frontend | API | DB | Auth |
|---------|----------|-----|-----|------|
| Local | Vite :6001 | Bun :3001 | PostgreSQL local/remoto | Passkey real u opcional (gate legacy sigue abierto en dev) |
| Producción (Coolify) | `dist/` estático | mismo proceso | PostgreSQL managed | Passkey requerida; `ACCESS_TOKEN` legacy aceptado en paralelo |

## Flujo general

```txt
Usuario → Browser (React SPA)
              ↕ fetch /api/*
         Hono (Bun) ←→ PostgreSQL
              ↕ (dev only)
         n8n webhook ← POST desde browser (VITE_N8N_WEBHOOK_URL)
```

## Riesgos

- `ACCESS_TOKEN` en URL en primera visita (legacy, en paralelo — se redirige a URL limpia,
  pero puede quedar en logs del browser). Se retira una vez confirmado el login passkey.
- Rate limiting de `/api/auth/*` en memoria por proceso — se resetea en restart y no se
  comparte entre instancias (aceptable para un solo contenedor; revisar si se escala).
- Webhook n8n llamado desde el cliente (URL expuesta en bundle si `VITE_*`).
- Sin rate limiting en el resto de la API (`/api/gastos`, `/api/presupuesto`, etc.).
- Schema PG sin migraciones versionadas post-migración SQLite (las tablas de auth siguen el
  mismo patrón `CREATE TABLE IF NOT EXISTS` en `schema.pg.sql`).

## Decisiones pendientes

- GAP: formalizar migraciones PG versionadas.
- GAP: mover sync n8n al backend para no exponer webhook URL.
- GAP: estrategia de backup/restore PostgreSQL.
