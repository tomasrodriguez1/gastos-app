# Gastos App — Variables de entorno

Nunca commitear valores reales. Usar `.env.example` como referencia.

| Variable | Servicio | Entorno | Required | Safe example | Purpose | Source |
|----------|----------|-----------|----------|--------------|---------|--------|
| `DATABASE_URL` | PostgreSQL | All | Yes | `postgresql://user:pass@localhost:5432/gastos` | Conexión a PostgreSQL | `server/db/client.js` |
| `PASSKEY_RP_ID` | Passkey auth | Prod | Yes en prod | `gastos.midominio.cl` | Dominio (sin protocolo) del Relying Party WebAuthn. Dev default: `localhost` | `server/auth.js` |
| `PASSKEY_RP_NAME` | Passkey auth | All | No | `Gastos App` | Nombre visible en el prompt de passkey del navegador | `server/auth.js` |
| `PASSKEY_ORIGIN` | Passkey auth | Prod | Yes en prod | `https://gastos.midominio.cl` | Origin exacto (con `https://`) permitido para WebAuthn — sin wildcards. Dev default: `http://localhost:6001` | `server/auth.js` |
| `PASSKEY_BOOTSTRAP_SECRET` | Passkey auth | All | Yes | `un-secreto-random-de-32-o-mas-chars` | Habilita el enrolamiento de la primera passkey; queda inerte apenas existe una passkey registrada | `server/auth.js` |
| `PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL` | Passkey auth | Prod (recuperación) | No | `2026-08-01T00:00:00Z` | Timestamp ISO futuro: reactiva el enrolamiento aunque ya existan passkeys (recuperación ante lockout). Ver `runbook.md` | `server/auth.js` (GAP: aún no implementado, ver Riesgos) |
| `SESSION_MAX_AGE_SECONDS` | Passkey auth | All | No | `2592000` (30 días) | Duración de la sesión; se renueva con uso (throttleado a 1x/hora) | `server/auth.js` |
| `ACCESS_TOKEN` | API auth (legacy) | Prod | No* | `your-random-secret-token-here` | Token de acceso HTTP/cookie — en paralelo con passkeys hasta su retiro (ver DEC-009) | `server/index.js` |
| `COOKIE_SECURE` | API auth | Prod | No | `true` / `false` | Flag `Secure` de las cookies `gastos_session` y `gastos_access`; default `true`; `false` solo en HTTP (homelab) | `server/auth.js`, `server/index.js` |
| `NODE_ENV` | Runtime | All | Prod: Yes | `production` / `development` | Modo de ejecución | `server/index.js`, `server/db/client.js`, `server/auth.js` |
| `PORT` | API | All | No | `3001` | Puerto del servidor Hono | `server/index.js` |
| `CORS_ORIGIN` | API CORS | Dev | No | `http://localhost:6001` | Origen permitido en dev | `server/index.js` |
| `RUN_SCHEMA_INIT` | DB schema | All | No | `true` | Ejecutar `schema.pg.sql` al arrancar | `server/index.js` |
| `VITE_N8N_WEBHOOK_URL` | n8n (client) | All | Yes** | `https://n8n.example.com/webhook/gastos` | Webhook para sync de gastos | `src/hooks/useSyncN8n.js` |
| `INGESTA_TOKEN` | Ingesta externa | All | Yes*** | `your-random-ingesta-token-here` | Token Bearer que valida `POST /api/ingesta` (n8n → app). Sin token configurado, el endpoint rechaza todo | `server/auth.js`, `server/ingesta.js` |
| `GROQ_API_KEY` | Ingesta externa (IA) | All | No | `gsk_...` | Habilita clasificación automática (tipos/contexto) y fallback de extracción de campos en `/api/ingesta`. Sin ella, la ingesta sigue funcionando solo con el parser determinista | `server/ingesta/groq.js` |
| `GROQ_MODEL` | Ingesta externa (IA) | All | No | `llama-3.1-8b-instant` | Modelo Groq a usar; confirmar el nombre vigente al desplegar (Groq puede deprecar modelos) | `server/ingesta/groq.js` |
| `OPENAI_API_KEY` | Agente conversacional (F3) | All | No | `sk-...` | Habilita `POST /api/agente/chat`. Sin ella, el endpoint responde 503 sin afectar el resto de la app | `server/agente.js` |
| `OPENAI_MODEL` | Agente conversacional (F3) | All | No | `gpt-5.6-luna` | Modelo OpenAI a usar — default es el modelo más rápido/económico de la familia GPT-5.6 (function calling + streaming, 1M de contexto) | `server/agente.js` |

\* Ya no requerida para autenticación humana (passkeys la reemplazan), pero debe seguir
configurada mientras dure la convivencia — ver DEC-009 y el procedimiento de retiro en
`runbook.md`.
\*\* Requerida para usar sync n8n; app funciona sin ella pero sync falla con mensaje de error.
\*\*\* Requerida para que `POST /api/ingesta` acepte requests; sin ella el endpoint devuelve
401 siempre (no hay bypass en dev, a diferencia del gate de `ACCESS_TOKEN`).

## Notas

- Variables `VITE_*` se embeben en el bundle en build time.
- En dev, el gate legacy (`ACCESS_TOKEN`) sigue deshabilitado si `NODE_ENV !== 'production'`;
  el flujo de passkeys (bootstrap/login) funciona igual en dev usando los defaults de
  `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` (`localhost` / `http://localhost:6001`).
- `PASSKEY_RP_ID` debe ser el dominio pelado (sin `https://`, sin puerto); `PASSKEY_ORIGIN`
  debe incluir `https://` y coincidir exactamente con el origin real — WebAuthn rechaza
  cualquier mismatch, no admite wildcards.
- `COOKIE_SECURE` es `true` por defecto (cualquier valor distinto de `false`); en HTTPS no hace falta definirla.
- SSL a PostgreSQL se fuerza en prod si `DATABASE_URL` no incluye `sslmode=`.
- No existe `SESSION_SECRET`: el token de sesión es random de 256 bits, hasheado con SHA-256
  antes de guardarse — no hay material reversible que un pepper adicional proteja (ver DEC-009).

## Grupos por servicio

### PostgreSQL
- `DATABASE_URL`
- `RUN_SCHEMA_INIT`

### API (Hono/Bun)
- `PORT`
- `NODE_ENV`
- `COOKIE_SECURE`
- `CORS_ORIGIN`

### Passkeys / WebAuthn
- `PASSKEY_RP_ID`
- `PASSKEY_RP_NAME`
- `PASSKEY_ORIGIN`
- `PASSKEY_BOOTSTRAP_SECRET`
- `PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL`
- `SESSION_MAX_AGE_SECONDS`

### Legacy (retirar tras confirmar passkeys en prod — ver DEC-009)
- `ACCESS_TOKEN`

### Frontend (Vite)
- `VITE_N8N_WEBHOOK_URL`

### Ingesta externa (n8n → `POST /api/ingesta`)
- `INGESTA_TOKEN`
- `GROQ_API_KEY`
- `GROQ_MODEL`

### Agente conversacional (`POST /api/agente/chat`)
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## GAPs

- GAP: variables Coolify específicas del proyecto no documentadas en repo.
- GAP: confirmar proveedor PG en prod.
- GAP: dominio real de producción — `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` quedan como placeholder
  hasta definirlo (ver `deployment.md`).
- GAP: nombre exacto de modelo Groq vigente — confirmar al desplegar, Groq puede deprecar
  modelos entre releases.
