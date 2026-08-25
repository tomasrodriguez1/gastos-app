# CLAUDE.md — Gastos App

Instrucciones específicas para Claude Code en este repositorio.

## Contexto del proyecto

App de finanzas personales: gasto real vs presupuesto mensual. React + Hono/Bun + PostgreSQL. Deploy en Railway.

## Política de carga de contexto

**No cargar toda la documentación por defecto.**

Para cualquier tarea, leer primero:

- `docs/context/context.md`
- `docs/context/data_model_context.md`
- `docs/architecture/architecture.md`
- `AGENTS.md`

Leer adicionalmente solo cuando la tarea lo requiera (ver `AGENTS.md` para la tabla completa).

## Expectativas de planificación

### Tareas pequeñas (1-3 archivos)

- Leer contexto mínimo + archivos del área.
- Implementar directamente.
- Lint + reporte breve.

### Tareas grandes (API, modelo, multi-página)

- Leer contexto extendido y decisiones si aplica.
- Planificar impacto en sync, presupuesto, duplicados.
- Actualizar docs afectadas.
- Listar riesgos y GAPs.

## Reporte de archivos modificados

Al finalizar, listar:

- Archivos creados/modificados
- Docs actualizadas
- Comandos ejecutados (`lint`, `build`)
- GAPs descubiertos

## Prohibiciones

- No modificar código funcional en tareas de solo documentación.
- No commitear secretos.
- No agregar deps sin justificación.
- No asumir SQLite como DB actual (PostgreSQL es el backend activo).

## Actualización de documentación

Actualizar docs cuando cambies:

- Endpoints API → `context.md`, `integrations.md`
- Schema → `data_model_context.md`, `schema.pg.sql`
- Env vars → `env-vars.md`, `.env.example`
- Deploy → `deployment.md`, `runbook.md`
- Decisiones arquitectónicas → `decisions.md`

Marcar lo no verificable como `GAP:`.

## Comandos útiles

```bash
bun run dev       # desarrollo
bun run lint      # ESLint
bun run build     # build producción
bun run migrate:pg  # migración SQLite→PG (one-shot)
```

## Áreas del código

| Área | Punto de entrada |
|------|------------------|
| App / rutas | `src/App.jsx` |
| API | `server/index.js` |
| Cálculos | `src/utils/calculos.js` |
| Mapeo | `src/utils/mapeo.js`, `regla_mapeo` |
| Sync n8n | `src/hooks/useSyncN8n.js` |
| Duplicados | `server/duplicados.js` |
| Reservas de ahorro | `server/reservas.js` |
| Schema | `server/db/schema.pg.sql` |

## Referencia legacy

El archivo `context.md` en la raíz es referencia histórica; la documentación canónica está en `docs/`.
