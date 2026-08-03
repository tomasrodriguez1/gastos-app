# Gastos App — Decisiones de arquitectura

## DEC-001 - SQLite local como persistencia inicial

Date: (histórico, pre-2026)
Status: replaced
Context: App personal local-only, simplicidad de setup sin servidor de DB.
Decision: Usar `bun:sqlite` con archivo `data/gastos.db`.
Alternatives considered: JSON files, localStorage only.
Consequences: Fácil desarrollo local; difícil deploy multi-instancia; migrado a PostgreSQL.

## DEC-002 - Presupuesto normalizado en tablas separadas

Date: (migración 003)
Status: active
Context: Presupuesto almacenado como JSON monolítico dificultaba queries y updates parciales.
Decision: Tablas normalizadas de cabecera, ingresos, categorías y fondos. La cabecera se
denomina `presupuesto_ciclo` desde DEC-010.
Alternatives considered: JSONB single table, document store.
Consequences: PUT por sección; joins en lectura; mejor integridad referencial.

## DEC-003 - Tabla única de gastos con flag es_manual

Date: (diseño original)
Status: active
Context: Gastos de n8n y manuales comparten schema pero distinta semántica de identidad.
Decision: Una tabla `gastos` con `es_manual` y `sync_key` nullable para manuales.
Alternatives considered: Tablas separadas gastos_sync / gastos_manual.
Consequences: Queries unificadas posibles; lógica de merge en App.jsx; dos hooks de fetching.

## DEC-004 - Reglas de mapeo en DB con prioridad

Date: (migración 005)
Status: active
Context: Asignación gasto→categoría presupuestaria necesitaba ser editable sin deploy.
Decision: Tabla `regla_mapeo` con prioridad, condiciones y `_NONE_` para sin mapeo.
Alternatives considered: Hardcode en cliente, ML classification.
Consequences: CRUD vía API; cliente cachea reglas al boot; override manual siempre gana.

## DEC-005 - Sync n8n con revisión manual

Date: (diseño useSyncN8n)
Status: active
Context: Import automático puede traer duplicados o gastos incorrectos.
Decision: Webhook devuelve entries → modal SyncReview → POST solo aprobados.
Alternatives considered: Auto-import silencioso.
Consequences: Mejor control; paso extra para el usuario; `lastSync` en localStorage.

## DEC-006 - Migración a PostgreSQL para producción

Date: 2026 (inferido de `schema.pg.sql`, `migrate-to-pg.js`)
Status: active
Context: Deploy en Railway requiere DB managed y acceso remoto.
Decision: PostgreSQL con `postgres` driver; schema en `schema.pg.sql`; script one-shot desde SQLite.
Alternatives considered: Mantener SQLite en volumen Railway.
Consequences: `DATABASE_URL` obligatorio; SSL en prod; scripts SQLite legacy permanecen.

## DEC-007 - Auth por token compartido en producción

Date: (server/index.js middleware)
Status: superseded by DEC-009
Context: App personal desplegada en internet sin multi-usuario.
Decision: `ACCESS_TOKEN` + cookie HTTP-only; bypass en dev.
Alternatives considered: OAuth, basic auth, VPN-only.
Consequences: Simple; un solo secreto; no hay roles ni permisos granulares. `ACCESS_TOKEN`
se mantiene activo en paralelo durante la transición a DEC-009 — ver esa entrada para el
procedimiento de retiro.

## DEC-008 - Hono sirve frontend en producción

Date: (server/index.js serveStatic)
Status: active
Context: Un solo servicio en Railway simplifica deploy.
Decision: `bun run build` → `dist/` servido por Hono en prod.
Alternatives considered: CDN separado, Vercel frontend + API separada.
Consequences: Un contenedor; CORS relevante solo en dev.

## DEC-009 - Auth por passkey/WebAuthn (reemplaza DEC-007)

Date: 2026-07-21
Status: active
Context: `ACCESS_TOKEN` es un secreto único compartido, sin revocación granular, transmitido
en texto plano en la URL en la primera visita (`?t=TOKEN`) y sin segundo factor. Para una
app single-owner expuesta en internet, passkeys dan login passwordless resistente a phishing
sin necesidad de gestionar contraseñas ni un sistema de usuarios completo.
Decision: `@simplewebauthn/server` + `@simplewebauthn/browser`. Login discoverable/usernameless
(`allowCredentials: []`), `userVerification: 'required'` en registro y login. Sesión propia
desacoplada de la passkey: token opaco de 256 bits, hasheado (SHA-256) en `auth_sessions`,
cookie `gastos_session` (`httpOnly`, `Secure` en prod, `SameSite=Strict`). Enrolamiento inicial
protegido por `PASSKEY_BOOTSTRAP_SECRET` (env var), utilizable solo mientras no exista ninguna
passkey — una vez registrada la primera, el secreto de bootstrap queda completamente inerte y
agregar passkeys adicionales requiere sesión válida. Migración: `ACCESS_TOKEN` se mantiene
activo en paralelo (middleware combinado: sesión válida O `ACCESS_TOKEN` legacy) hasta que el
usuario confirme login con passkey en producción real; recién ahí se retira (ver
`docs/operations/env-vars.md` y `docs/operations/runbook.md` para el procedimiento).
Alternatives considered: email+password (requiere gestión de contraseñas, no pedido),
OAuth/login social (multiusuario innecesario para single-owner), JWT de larga duración para
sesión (se prefirió sesión opaca server-side por revocación inmediata en logout).
Consequences: Nuevas tablas `passkey_credentials`, `webauthn_challenges`, `auth_sessions`
(`server/db/schema.pg.sql`); nuevo router `server/routes/auth.js` montado en `/api/auth/*`,
exento del gate global; nueva dependencia `zod` (validación de payloads WebAuthn) y
`@simplewebauthn/*`; rate limiting en memoria (por proceso, no compartido entre instancias —
ver GAP); sin `SESSION_SECRET` (token ya es random de 256 bits, un hash simple sin pepper es
suficiente — no hay material reversible que proteger). n8n no se ve afectado: no tiene webhook
entrante, el sync es 100% client-initiated y pasa por el mismo gate que cualquier request
humano.

## DEC-010 - Presupuesto por ciclos financieros 29–28

Date: 2026-07-28
Status: active
Context: El presupuesto por mes calendario no representaba el período realmente financiado.
Decision: El período presupuestario principal es `ciclo_financiero`, nombrado por el mes que
financia. Las fechas 1–28 pertenecen al ciclo del mismo mes y las fechas 29–31 al ciclo
siguiente. `gastos.fecha` no cambia y `gastos.mes` se conserva como filtro calendario
secundario. Los presupuestos históricos mantienen su clave nominal al migrar.
Consequences: Totales, gráficos, comparaciones, fondos, recurrencias y duplicados agrupan por
ciclo. El servidor deriva ambos períodos desde `fecha` y no permite editarlos directamente.

## DEC-011 - Dos proveedores LLM: Groq para ingesta de mail, OpenAI para el agente conversacional

Date: 2026-08-02
Status: active
Context: F2 (memoria de comercios) + F3 (agente conversacional) agregan una segunda vía de
captura de gastos, en lenguaje natural, para lo que no llega por mail (BICE, efectivo,
transferencias). El clasificador existente (`server/ingesta/groq.js`, Groq) es un `fetch`
directo sin SDK: suficiente para clasificación batch de un `motivo` ya extraído, pero no
ofrece tool calling estructurado ni streaming de eventos parciales, y el agente necesita
ambas cosas para (a) decidir dinámicamente si preguntar el banco o crear el gasto, y (b)
mostrar en el chat qué está haciendo paso a paso ("buscó el comercio", "creó el gasto") en
vez de una respuesta opaca.
Decision: El agente conversacional (`server/agente.js`) usa el Vercel AI SDK
(`ai` + `@ai-sdk/react` + `@ai-sdk/openai`) contra OpenAI, con tool calling
(`buscar_comercio`, `crear_gasto`) y `streamText().toUIMessageStreamResponse()` consumido en
el cliente vía `useChat`. `server/ingesta/groq.js` no se migra ni se toca — sigue siendo un
`fetch` directo a Groq, sin SDK, porque no necesita ninguna de esas dos capacidades y
migrarlo no aportaría nada. Ambos caminos comparten la misma memoria de comercios
(`comercio_mapeo`) y el mismo filtro duro contra el catálogo real antes de insertar — el
LLM nunca es el único guardián del catálogo, en ninguno de los dos proveedores.
Consequences: Dos API keys distintas en producción (`GROQ_API_KEY`, `OPENAI_API_KEY`), cada
una opcional de forma independiente — si falta la de OpenAI, solo `/api/agente/chat` queda
deshabilitado (503), el resto de la app (incluida la ingesta de mail) sigue intacto. Nueva
dependencia de tres paquetes (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) que no existía antes
en el repo. Default de `OPENAI_MODEL`: `gpt-5.6-luna` (familia GPT-5.6, variante más
rápida/económica — function calling + streaming, 1M de contexto), confirmado contra la
documentación oficial de OpenAI.

## GAP: decisions to document

- Elección específica de proveedor PostgreSQL (Railway vs Neon).
- Política de rotación de `ACCESS_TOKEN` (hasta su retiro definitivo, ver DEC-009).
- Decisión sobre retirar scripts SQLite legacy.
- Confirmar plataforma de deploy definitiva: docs históricamente dicen Railway
  (`railway.json`), pero el despliegue real objetivo es Coolify (Nixpacks/buildpack, sin
  Dockerfile) — ver `docs/operations/deployment.md`.
