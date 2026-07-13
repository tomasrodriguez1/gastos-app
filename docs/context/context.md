# Gastos App — Contexto del proyecto

> Documentación canónica del proyecto. La copia en la raíz (`context.md`) apunta aquí.

## Qué hace el proyecto

Aplicación de finanzas personales para comparar **gasto real vs presupuesto mensual**. Permite sincronizar gastos desde n8n, registrar gastos manuales, asignar categorías presupuestarias, detectar duplicados y analizar tendencias históricas.

## Problema de negocio

Centralizar gastos dispersos (bancos, transferencias, efectivo) y contrastarlos contra un presupuesto mensual estructurado por categorías, subcategorías y fondos de ahorro.

## Usuarios principales

Uso personal/familiar. Un operador principal gestiona presupuesto, sincronización y revisión de gastos.

## Flujos principales

| Ruta | Propósito |
|------|-----------|
| `/` | Dashboard: resumen del mes, gráficos, semáforos por categoría, fondos de ahorro |
| `/cashflow` | Vista de flujo de caja con sincronización n8n |
| `/analisis` | Análisis histórico: comparador mensual, tendencias por categoría (6m), gastos recurrentes |
| `/gastos` | Tabla de gastos (sync + manuales), filtros, asignación presupuestaria, duplicados |
| `/log` | Log de últimos gastos ingresados (todos los meses), ordenado por `created_at`, resalta lo nuevo desde la última visita, edición inline |
| `/presupuesto` | Editor de presupuesto mensual (ingresos, categorías, fondos) |

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS v4, Recharts |
| Backend | Hono 4 sobre Bun |
| Base de datos | PostgreSQL (`postgres` npm package) |
| Integración | n8n webhook (`VITE_N8N_WEBHOOK_URL`) |
| Deploy | Railway (`railway.json`) |

**Desarrollo local:** `bun run dev` → API `:3001` + Vite `:6001` (proxy `/api`).

**Lanzador macOS:** `Iniciar-Gastos.command` en la raíz del repo.

## Estado actual

- Backend migrado de SQLite a PostgreSQL; scripts legacy de SQLite permanecen para migración one-shot (`bun run migrate:pg`).
- Schema PG se inicializa en dev o con `RUN_SCHEMA_INIT=true` (`server/db/init.js` + `schema.pg.sql`).
- Autenticación por token en producción (`ACCESS_TOKEN` + cookie `gastos_access`).
- Sin suite de tests automatizados detectada (GAP).

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

## Gaps

- GAP: dueño/responsable operacional del deploy en Railway.
- GAP: documentación formal del workflow n8n (nodos, formato de respuesta).
- GAP: estrategia de backups de PostgreSQL en producción.
- GAP: tests automatizados.
