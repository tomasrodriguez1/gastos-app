# Gastos App — Deployment

## Entornos

| Entorno | Descripción |
|---------|-------------|
| Local | Vite + API Bun, PostgreSQL local o remoto |
| Producción | Coolify (objetivo). `railway.json` es config histórica de Railway — GAP: confirmar si se retira o se mantiene como alternativa. |

## Plataforma

**Coolify** — Nixpacks/buildpack, sin Dockerfile (mismo patrón build/start que Railway hoy):

| Fase | Comando |
|------|---------|
| Build | `bun install && bun run build` |
| Start | `bun run start` → `bun run server/index.js` |
| Dev | `bun run dev` |

**Dominio y HTTPS:** WebAuthn/passkeys exigen HTTPS en producción (excepto `localhost`). El
dominio configurado en Coolify debe coincidir **exactamente** con `PASSKEY_RP_ID` (sin
protocolo) y `PASSKEY_ORIGIN` (con `https://`) — sin wildcards, sin subdominios distintos.

## Servicios

Un solo servicio ejecuta:

1. API Hono en `server/index.js` (incluye `/api/auth/*`)
2. Frontend estático desde `dist/` (solo `NODE_ENV=production`)

## Base de datos

- PostgreSQL vía `DATABASE_URL` (requerida).
- Schema: `initSchema()` corre si `RUN_SCHEMA_INIT=true` o en no-producción. Las tablas de
  passkeys (`passkey_credentials`, `webauthn_challenges`, `auth_sessions`) se crean con el
  resto del schema — no hace falta un paso de migración separado, es el mismo mecanismo
  `CREATE TABLE IF NOT EXISTS` que ya usa el resto de `schema.pg.sql`.
- Migración inicial SQLite→PG: `bun run migrate:pg` (one-shot, requiere SQLite local).
- Migración 29–28: antes de desplegar esta versión ejecutar `bun run migrate:ciclos` con
  `DATABASE_URL` apuntando al PostgreSQL objetivo. Es idempotente, conserva fechas y montos,
  y falla si la verificación detecta una asignación de período inconsistente. El servidor
  vuelve a ejecutar la misma comprobación al arrancar.

## Variables de entorno requeridas (prod)

| Variable | Requerida |
|----------|-----------|
| `DATABASE_URL` | Sí |
| `NODE_ENV` | Sí (`production`) |
| `PASSKEY_RP_ID` | Sí — dominio real, sin protocolo |
| `PASSKEY_ORIGIN` | Sí — `https://` + dominio real |
| `PASSKEY_BOOTSTRAP_SECRET` | Sí — para el enrolamiento inicial |
| `PASSKEY_RP_NAME` | No (default `Gastos App`) |
| `SESSION_MAX_AGE_SECONDS` | No (default 30 días) |
| `ACCESS_TOKEN` | No — legacy, mantener solo durante la transición (ver DEC-009) |
| `VITE_N8N_WEBHOOK_URL` | Sí (build time) |
| `PORT` | Auto |
| `CORS_ORIGIN` | No en prod (same-origin) |
| `RUN_SCHEMA_INIT` | Opcional (true para init schema) |

Ver `docs/operations/env-vars.md`.

## Proceso de deploy

1. Push a la branch conectada a Coolify (GAP: confirmar branch de deploy).
2. Configurar `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` con el dominio real HTTPS antes del primer
   deploy — WebAuthn no funciona con placeholders ni con `localhost` en producción.
3. Para el release de ciclos financieros, ejecutar `bun run migrate:ciclos` contra la DB objetivo.
4. Coolify ejecuta build (`bun install && bun run build`) y start (`bun run start`).
5. **Validar la primera passkey antes de retirar `ACCESS_TOKEN`** (ver checklist abajo).
6. Verificar health: app carga, login con passkey funciona, API responde.

## Validar la primera passkey antes de retirar ACCESS_TOKEN

1. Con `ACCESS_TOKEN` todavía configurado, abrir la app en el dominio real (HTTPS).
2. Debería verse la pantalla de bootstrap (`bootstrapRequired: true` en `GET /api/auth/status`).
3. Ingresar `PASSKEY_BOOTSTRAP_SECRET` y crear la passkey con un autenticador real (Touch ID,
   Face ID, Windows Hello, o guardándola en 1Password/iCloud Keychain).
4. Confirmar que la sesión queda activa (dashboard visible) y que la cookie `gastos_session`
   se ve como `Secure` + `HttpOnly` en las DevTools del navegador (pestaña Application/Storage
   → Cookies).
5. Cerrar sesión y volver a entrar solo con la passkey — sin escribir nada.
6. Agregar una segunda passkey desde otro proveedor/dispositivo (recomendado, reduce riesgo de
   bloqueo — ver `docs/operations/runbook.md` → Recuperación).
7. Solo después de validar los pasos 1-6: se puede considerar retirar `ACCESS_TOKEN` del
   entorno (ver `docs/operations/env-vars.md` y DEC-009 para el procedimiento exacto).

## Verificar cookies Secure en producción

- DevTools → Application/Storage → Cookies → `gastos_session` debe tener `Secure` ✓,
  `HttpOnly` ✓, `SameSite=Strict`.
- Si `COOKIE_SECURE=false` está seteada (solo debería pasar en HTTP privado/homelab), la
  cookie NO tendrá `Secure` — confirmar que esto es intencional antes de exponer la app a
  internet público.

## Rollback

1. Revertir commit en Coolify o redeploy versión anterior.
2. Rollback de código es seguro respecto al schema: las tablas de passkeys son aditivas, no
   hay `DROP`/`ALTER` destructivo — una versión anterior del código simplemente no las usa.
3. Si se necesita revertir el swap de middleware específicamente: `ACCESS_TOKEN` sigue
   aceptado en paralelo durante toda la transición, así que un rollback de código no deja a
   nadie sin acceso mientras esa variable siga configurada.
4. GAP: procedimiento formal de rollback de schema PG no documentado más allá de lo anterior.
5. Si schema cambió de forma incompatible: restaurar backup DB (GAP: política de backups).

## Gaps

- GAP: URL de producción exacta (bloquea completar `PASSKEY_RP_ID`/`PASSKEY_ORIGIN`).
- GAP: branch de deploy (main vs otra).
- GAP: CI/CD pipeline aparte de Coolify.
- GAP: health check endpoint dedicado (`GET /api/auth/status` sirve como proxy razonable
  mientras tanto — no requiere auth y confirma que la API y la DB responden).
- GAP: estrategia de migraciones PG en prod post-deploy.
- GAP: confirmar si Coolify necesita un Dockerfile propio o si el buildpack detecta Bun
  automáticamente — no se creó ninguno en este cambio, asumiendo detección automática.
