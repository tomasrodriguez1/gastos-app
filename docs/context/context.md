# Gastos App — Contexto del proyecto

> Documentación canónica del proyecto. La copia en la raíz (`context.md`) apunta aquí.

## Qué hace el proyecto

Aplicación de finanzas personales para comparar **gasto real vs presupuesto por ciclo financiero**. Cada ciclo se nombra por el mes que financia y abarca desde el día 29 del mes anterior hasta el día 28 del mes nominal. Permite sincronizar gastos desde n8n, registrar gastos manuales, asignar categorías presupuestarias, detectar duplicados y analizar tendencias históricas.

## Problema de negocio

Centralizar gastos dispersos (bancos, transferencias, efectivo) y contrastarlos contra un presupuesto por ciclo financiero estructurado por categorías, subcategorías y fondos de ahorro.

## Usuarios principales

Uso personal/familiar. Un operador principal gestiona presupuesto, sincronización y revisión de gastos.

## Flujos principales

| Ruta | Propósito |
|------|-----------|
| `/` | Dashboard: resumen del ciclo financiero, gráficos, semáforos por categoría, fondos de ahorro |
| `/cashflow` | Vista de flujo de caja con sincronización n8n |
| `/analisis` | Análisis histórico: comparador por ciclos, tendencias por categoría, gastos recurrentes |
| `/gastos` | Tabla de gastos por ciclo (sync + manuales), filtro secundario por mes calendario, asignación presupuestaria y duplicados |
| `/log` | Log de últimos gastos ingresados (todos los meses), ordenado por `created_at`, resalta lo nuevo desde la última visita, edición inline |
| `/presupuesto` | Editor de presupuesto por ciclo financiero (ingresos, categorías, fondos) |
| `/tarjeta` | Reconciliación de tarjeta de crédito por banco: gastos no pagados, "por cobrar" (`split`, compras de terceros), y saldo reservado para pagarla |
| `/passkeys` | Gestión de passkeys: ver, agregar, eliminar (requiere sesión) |

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS v4, Recharts |
| Backend | Hono 4 sobre Bun |
| Base de datos | PostgreSQL (`postgres` npm package) |
| Integración | n8n webhook (`VITE_N8N_WEBHOOK_URL`) |
| Deploy | Coolify (objetivo; `railway.json` es histórico — ver `docs/operations/deployment.md`) |
| Auth | Passkeys/WebAuthn (`@simplewebauthn/*`), `ACCESS_TOKEN` legacy en paralelo |

**Desarrollo local:** `bun run dev` → API `:3001` + Vite `:6001` (proxy `/api`).

**Lanzador macOS:** `Iniciar-Gastos.command` en la raíz del repo.

## Estado actual

- Backend migrado de SQLite a PostgreSQL; scripts legacy de SQLite permanecen para migración one-shot (`bun run migrate:pg`).
- Schema PG se inicializa en dev o con `RUN_SCHEMA_INIT=true` (`server/db/init.js` + `schema.pg.sql`).
- Autenticación por passkey/WebAuthn (ver DEC-009 en `docs/architecture/decisions.md`).
  `ACCESS_TOKEN` + cookie `gastos_access` se mantienen activos en paralelo hasta confirmar
  login passkey en producción real — no eliminar todavía.
- Tests: `bun test server` (unitarios, sin browser) y `bun test tests/e2e` (E2E con Playwright
  + autenticador virtual WebAuthn de CDP). Antes de este cambio no había suite automatizada.

## Qué no debe cambiarse sin autorización

- Lógica de `montoReal()` en `src/utils/calculos.js` (montos efectivos).
- Preservación de overrides manuales en sync UPSERT (`COALESCE` en `server/index.js`).
- Separación gastos sync (`es_manual=false`) vs manuales (`es_manual=true`).
- Reglas de mapeo con prioridad y `_NONE_` como destino sin mapeo.
- Whitelist de campos en `PATCH /api/gastos/:id`.

## Decisiones clave

- Estado centralizado en `App.jsx` (props), sin store global.
- Presupuesto normalizado en tablas separadas (`presupuesto_*`).
- Catálogos y reglas de mapeo en DB, no hardcodeados en cliente.
- Sync n8n con revisión manual antes de persistir (`SyncReview` modal).

## API — Autenticación

Endpoints bajo `/api/auth/*` (detalle completo en `docs/architecture/integrations.md`):
`GET /status`, `POST /passkey/register/options`, `POST /passkey/register/verify`,
`POST /passkey/login/options`, `POST /passkey/login/verify`, `POST /logout`,
`GET /passkeys`, `DELETE /passkeys/:id`. El resto de la API (`/api/gastos`, `/api/presupuesto`,
etc.) no cambió — sigue detrás del mismo gate global, ahora combinado (sesión passkey o
`ACCESS_TOKEN` legacy).

## Gaps

- GAP: dueño/responsable operacional del deploy.
- GAP: documentación formal del workflow n8n (nodos, formato de respuesta).
- GAP: estrategia de backups de PostgreSQL en producción.
- GAP: `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` de producción sin definir todavía (dominio real
  pendiente) — ver `docs/operations/env-vars.md`.
- GAP: retiro definitivo de `ACCESS_TOKEN` — pendiente de confirmación humana de login
  passkey en producción real (ver `docs/operations/runbook.md`).
