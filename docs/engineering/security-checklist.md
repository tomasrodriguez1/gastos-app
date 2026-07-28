# Gastos App — Checklist de seguridad

## Datos sensibles

- [ ] Gastos personales (montos, bancos, motivos) — tratar como PII.
- [ ] No loguear montos ni tokens en producción.
- [ ] No commitear `.env`, `*.db`, `data/`.
- [ ] `.env.example` solo con placeholders, nunca secretos reales.

## Autenticación (passkeys / WebAuthn — ver DEC-009)

- [ ] `@simplewebauthn/server` + `@simplewebauthn/browser` — sin criptografía WebAuthn propia.
- [ ] `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` configurados con el dominio real en producción, sin
      wildcards; `verifyRegistrationResponse`/`verifyAuthenticationResponse` validan origin y
      RP ID estrictamente contra esos valores.
- [ ] `userVerification: 'required'` en registro y login (biometría/PIN obligatorios —
      justificado: app single-owner, la fricción es mínima y elimina passkeys sin verificación).
- [ ] Challenges (`webauthn_challenges`) de un solo uso — reclamados atómicamente
      (`UPDATE ... WHERE consumed_at IS NULL AND expires_at > NOW()`), expiran a los 2 min,
      persistidos en Postgres (no solo en memoria — sobreviven restarts).
- [ ] `PASSKEY_BOOTSTRAP_SECRET` comparado con `timingSafeEqual` sobre hashes SHA-256 (evita
      timing attacks y el throw por longitudes distintas).
- [ ] Bootstrap solo posible mientras `COUNT(passkey_credentials) === 0` (o con
      `PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL` activo — procedimiento de recuperación, ver
      `runbook.md`). Una vez bootstrapeado, el secreto queda inerte: sin sesión, cualquier
      intento devuelve `401` genérico, nunca `200`.
- [ ] Sesión propia (`auth_sessions`), no la passkey misma: token opaco de 256 bits, solo se
      guarda `SHA-256(token)` — nunca el token en texto plano.
- [ ] Cookie `gastos_session`: `httpOnly`, `secure` vía `COOKIE_SECURE` (default `true`;
      `false` solo en HTTP privado), `sameSite: Strict`, `path: /`.
- [ ] Rate limiting en memoria por IP en `/api/auth/*` (login, bootstrap, gestión de passkeys)
      — GAP: por proceso, no compartido entre instancias si se escala horizontalmente.
- [ ] `GET /api/auth/status` no expone secretos, `credential_id` ni `public_key` — solo
      3 booleanos.
- [ ] `GET /api/auth/passkeys` nunca expone `credential_id` ni `public_key` completos.
- [ ] No se puede eliminar la última passkey (`400` server-side, no solo deshabilitado en UI).
- [ ] Content-Type `application/json` validado estrictamente en los endpoints de auth POST.
- [ ] Validación estructural con Zod antes de pasar el body a las funciones de verificación
      de `@simplewebauthn/server`.
- [ ] Sin tokens/challenges/secretos en logs (`console.error` solo loguea `e.message` genérico
      en fallos de verificación, nunca el payload completo).
- [ ] Sin passkey ni token de sesión en `localStorage` — solo cookie `httpOnly`.
- [ ] `ACCESS_TOKEN` (legacy): sigue activo en paralelo — no se elimina hasta confirmar login
      passkey real en producción (ver checklist en `docs/operations/deployment.md`). Cookie
      `gastos_access`: `httpOnly`, `secure` vía `COOKIE_SECURE`, `sameSite: Lax`. Dev bypass
      solo cuando `NODE_ENV !== 'production'`.

## Autorización

- [ ] Sin multi-usuario: una sesión válida (passkey) o `ACCESS_TOKEN` legacy = acceso total.
- [ ] No existe registro público de passkeys sin bootstrap secret o sesión.
- [ ] No existe bypass permanente: la recuperación (`PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL`) exige
      acceso directo al servidor, tiene expiración, y debe desetearse tras usarla.
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
- [ ] `PASSKEY_BOOTSTRAP_SECRET` fuerte (random, ≥32 chars) y rotado si se filtró — mientras
      no exista ninguna passkey, ese secreto es la única puerta de entrada.
- [ ] Separar credenciales dev/prod.
- [ ] Documentar en `docs/operations/env-vars.md`.

## Checklist pre-producción

- [ ] `NODE_ENV=production`
- [ ] `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` configurados con el dominio real HTTPS (sin wildcards)
- [ ] `PASSKEY_BOOTSTRAP_SECRET` fuerte (random, ≥32 chars)
- [ ] `ACCESS_TOKEN` fuerte (random, ≥32 chars) — legacy, en paralelo hasta retirarlo
- [ ] `COOKIE_SECURE` no definida o `true` en HTTPS; `false` solo si el acceso es HTTP
- [ ] `DATABASE_URL` apunta a DB prod con SSL
- [ ] Build frontend sin source maps sensibles (revisar config Vite)
- [ ] `.env` en `.gitignore`

## Checklist pre-deploy

- [ ] `bun run build` exitoso
- [ ] `bun run lint` sin errores nuevos
- [ ] `bun test server` sin fallos
- [ ] Migraciones/schema PG aplicado (incluye tablas de passkeys)
- [ ] Smoke test: registrar/loguear con passkey real, listar gastos, guardar presupuesto
- [ ] Verificar CORS no necesario en prod (same-origin)
