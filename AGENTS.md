# AGENTS.md — Gastos App

Reglas para todos los agentes de IA que trabajen en este repositorio.

## Reglas generales

1. **No cambiar comportamiento funcional** salvo pedido explícito del usuario.
2. **No inventar campos** del modelo de datos; verificar `server/db/schema.pg.sql`.
3. **No commitear** `.env`, `data/`, `*.db`, secretos.
4. **No agregar dependencias** sin justificación clara.
5. **Preservar overrides manuales** en flujos de sync n8n.
6. Responder en **español** cuando el usuario escriba en español.

## Política de carga de contexto

**No cargar toda la documentación por defecto.**

Para cualquier tarea, leer primero:

- `docs/context/context.md`
- `docs/context/data_model_context.md`
- `docs/architecture/architecture.md`
- `AGENTS.md`

Leer documentos adicionales solo cuando la tarea lo requiera:

- `docs/context/context-extended.md` — lógica de negocio core, flujos principales
- `docs/architecture/decisions.md` — arquitectura, deps, infra, storage, auth
- `docs/architecture/integrations.md` — APIs, webhooks, n8n, terceros
- `docs/engineering/security-checklist.md` — auth, permisos, datos personales, prod
- `docs/engineering/testing-strategy.md` — lógica de negocio, cálculos, permisos
- `docs/operations/deployment.md`, `env-vars.md`, `runbook.md` — deploy, prod, env vars

## Archivos requeridos antes de trabajar

Según el área, leer los archivos listados en la tabla "Where to read next" de `docs/context/context.md` (heredada del contexto original).

## Acciones prohibidas

- Refactorizar `server/index.js` masivamente sin pedido.
- Editar migraciones SQLite ya aplicadas.
- Cambiar `montoReal()` sin revisión.
- Modificar auth sin leer `security-checklist.md`.
- Exponer secretos en docs o código.
- Eliminar documentación existente sin migrar contenido útil.

## Comportamiento requerido antes de editar

1. Identificar área afectada (Dashboard, Gastos, API, Presupuesto, etc.).
2. Leer archivos del dominio.
3. Evaluar impacto en sync n8n, presupuesto y duplicados.
4. Confirmar si afecta gastos sync (`es_manual=false`) o manuales (`es_manual=true`).

## Comportamiento requerido después de editar

1. `bun run lint` si se modificó JS/JSX.
2. Actualizar docs si cambió API, modelo, env vars o flujos.
3. Reportar archivos tocados, riesgos y GAPs.

## Formato de respuesta

- Explicar qué cambió y por qué.
- Citar código con `startLine:endLine:filepath`.
- Marcar incertidumbre con `GAP:`.

## Reglas por dominio

### Modelo de datos

- Fuente de verdad: `server/db/schema.pg.sql`.
- Actualizar `docs/context/data_model_context.md` en cambios de schema.

### Arquitectura

- Leer `decisions.md` antes de cambiar stack, DB o deploy.

### Auth / permisos

- Leer `security-checklist.md`.
- Un token = acceso total; no hay roles.

### Integraciones

- Leer `integrations.md` antes de tocar n8n o webhooks.

### Deploy

- Leer `deployment.md`, `env-vars.md`, `runbook.md`.

## Documentación detallada

Ver `docs/engineering/ai-agent-rules.md` para reglas extendidas.
