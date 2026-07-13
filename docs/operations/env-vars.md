# Gastos App — Variables de entorno

Nunca commitear valores reales. Usar `.env.example` como referencia.

| Variable | Servicio | Entorno | Required | Safe example | Purpose | Source |
|----------|----------|-----------|----------|--------------|---------|--------|
| `DATABASE_URL` | PostgreSQL | All | Yes | `postgresql://user:pass@localhost:5432/gastos` | Conexión a PostgreSQL | `server/db/client.js` |
| `ACCESS_TOKEN` | API auth | Prod | Yes | `your-random-secret-token-here` | Token de acceso HTTP/cookie | `server/index.js` |
| `NODE_ENV` | Runtime | All | Prod: Yes | `production` / `development` | Modo de ejecución | `server/index.js`, `server/db/client.js` |
| `PORT` | API | All | No | `3001` | Puerto del servidor Hono | `server/index.js` |
| `CORS_ORIGIN` | API CORS | Dev | No | `http://localhost:6001` | Origen permitido en dev | `server/index.js` |
| `RUN_SCHEMA_INIT` | DB schema | All | No | `true` | Ejecutar `schema.pg.sql` al arrancar | `server/index.js` |
| `VITE_N8N_WEBHOOK_URL` | n8n (client) | All | Yes* | `https://n8n.example.com/webhook/gastos` | Webhook para sync de gastos | `src/hooks/useSyncN8n.js` |

\* Requerida para usar sync n8n; app funciona sin ella pero sync falla con mensaje de error.

## Notas

- Variables `VITE_*` se embeben en el bundle en build time.
- En dev, auth está deshabilitada si `NODE_ENV !== 'production'` o sin `ACCESS_TOKEN`.
- SSL a PostgreSQL se fuerza en prod si `DATABASE_URL` no incluye `sslmode=`.

## Grupos por servicio

### PostgreSQL
- `DATABASE_URL`
- `RUN_SCHEMA_INIT`

### API (Hono/Bun)
- `PORT`
- `NODE_ENV`
- `ACCESS_TOKEN`
- `CORS_ORIGIN`

### Frontend (Vite)
- `VITE_N8N_WEBHOOK_URL`

## GAPs

- GAP: variables Railway específicas del proyecto no documentadas en repo.
- GAP: confirmar si Neon u otro proveedor PG en prod.
