# Gastos App — Checklist de seguridad

## Datos sensibles

- [ ] Gastos personales (montos, bancos, motivos) — tratar como PII.
- [ ] No loguear montos ni tokens en producción.
- [ ] No commitear `.env`, `*.db`, `data/`.
- [ ] `.env.example` solo con placeholders, nunca secretos reales.

## Autenticación

- [ ] `ACCESS_TOKEN` configurado en producción.
- [ ] Token no expuesto en repos ni docs.
- [ ] Cookie `gastos_access`: `httpOnly`, `secure` vía `COOKIE_SECURE` (default `true`; `false` solo en HTTP privado), `sameSite: Lax`.
- [ ] Primera visita con `?t=` redirige a URL sin token.
- [ ] Dev bypass solo cuando `NODE_ENV !== 'production'`.

## Autorización

- [ ] Sin multi-usuario: un token = acceso total.
- [ ] GAP: rate limiting no implementado.
- [ ] GAP: sin auditoría de acciones.

## Base de datos

- [ ] `DATABASE_URL` solo en servidor, nunca en cliente.
- [ ] SSL habilitado en prod (`server/db/client.js`).
- [ ] Queries parametrizadas (tagged templates postgres).
- [ ] GAP: RLS no aplicable (app single-tenant).

## Storage

- [ ] No hay uploads de archivos de usuario.
- [ ] `localStorage` solo para `lastSync` y legacy — no datos sensibles críticos.

## APIs

- [ ] CORS restringido a `CORS_ORIGIN` en dev.
- [ ] PATCH gastos con whitelist de campos.
- [ ] POST `/api/datos` limitado a claves `gastos` y `gastos_manuales`.
- [ ] Validar inputs en endpoints de catálogos y reglas.

## Logs

- [ ] Revisar que errores no filtren `DATABASE_URL`.
- [ ] GAP: logging estructurado y retención definida.

## Proveedores externos

- [ ] `VITE_N8N_WEBHOOK_URL` expuesta en bundle — evaluar proxy server-side.
- [ ] GAP: autenticación del webhook n8n.

## Variables de entorno

- [ ] Rotar `ACCESS_TOKEN` si se filtró (historial: `.env.example` tenía token real).
- [ ] Separar credenciales dev/prod.
- [ ] Documentar en `docs/operations/env-vars.md`.

## Checklist pre-producción

- [ ] `NODE_ENV=production`
- [ ] `ACCESS_TOKEN` fuerte (random, ≥32 chars)
- [ ] `COOKIE_SECURE` no definida o `true` en HTTPS; `false` solo si el acceso es HTTP
- [ ] `DATABASE_URL` apunta a DB prod con SSL
- [ ] Build frontend sin source maps sensibles (revisar config Vite)
- [ ] `.env` en `.gitignore`

## Checklist pre-deploy

- [ ] `bun run build` exitoso
- [ ] Migraciones/schema PG aplicado
- [ ] Smoke test: login con token, listar gastos, guardar presupuesto
- [ ] Verificar CORS no necesario en prod (same-origin)
