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
Decision: Tablas `presupuesto_mes`, `presupuesto_ingreso`, `presupuesto_categoria`, `presupuesto_fondo`.
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
Status: active
Context: App personal desplegada en internet sin multi-usuario.
Decision: `ACCESS_TOKEN` + cookie HTTP-only; bypass en dev.
Alternatives considered: OAuth, basic auth, VPN-only.
Consequences: Simple; un solo secreto; no hay roles ni permisos granulares.

## DEC-008 - Hono sirve frontend en producción

Date: (server/index.js serveStatic)
Status: active
Context: Un solo servicio en Railway simplifica deploy.
Decision: `bun run build` → `dist/` servido por Hono en prod.
Alternatives considered: CDN separado, Vercel frontend + API separada.
Consequences: Un contenedor; CORS relevante solo en dev.

## GAP: decisions to document

- Elección específica de proveedor PostgreSQL (Railway vs Neon).
- Política de rotación de `ACCESS_TOKEN`.
- Decisión sobre retirar scripts SQLite legacy.
