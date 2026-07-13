# Reglas para agentes de IA — Gastos App

## Reglas generales

1. No modificar código funcional salvo que la tarea lo requiera explícitamente.
2. No inventar campos del modelo de datos; verificar en `server/db/schema.pg.sql`.
3. No commitear `.env`, `data/`, `*.db` ni secretos.
4. No agregar dependencias sin justificación.
5. Preservar overrides manuales en flujos de sync.
6. Responder en español cuando el usuario escriba en español.

## Política de carga de contexto

**No cargar toda la documentación por defecto.**

Para cualquier tarea, leer primero:

- `docs/context/context.md`
- `docs/context/data_model_context.md`
- `docs/architecture/architecture.md`
- `AGENTS.md`

Leer documentos adicionales solo cuando la tarea lo requiera:

| Documento | Cuándo |
|-----------|--------|
| `docs/context/context-extended.md` | Lógica de negocio core, flujos principales |
| `docs/architecture/decisions.md` | Cambios de arquitectura, deps, infra, auth, storage |
| `docs/architecture/integrations.md` | APIs, webhooks, n8n, terceros |
| `docs/engineering/security-checklist.md` | Auth, permisos, datos personales, prod |
| `docs/engineering/testing-strategy.md` | Lógica de negocio, cálculos, permisos |
| `docs/operations/deployment.md`, `env-vars.md`, `runbook.md` | Deploy, env vars, prod, cron |

## Protocolo antes de editar

1. Identificar área (Dashboard, Gastos, Presupuesto, API, etc.).
2. Leer archivos del área según tabla en `docs/context/context.md`.
3. Verificar impacto en modelo de datos y sync n8n.
4. Confirmar si hay dos fuentes de gastos (sync vs manual).

## Protocolo después de editar

1. Ejecutar `bun run lint` si se tocó JS/JSX.
2. Actualizar docs si cambió modelo, API, env vars o flujos.
3. Reportar archivos modificados y riesgos.

## Prohibiciones

- Refactorizar `server/index.js` sin pedido explícito.
- Editar migraciones SQLite ya aplicadas.
- Cambiar `montoReal()` sin revisión.
- Modificar auth/permisos sin revisar `security-checklist.md`.
- Exponer secretos en docs o commits.

## Reglas de documentación

- Marcar incertidumbre con `GAP:` o `(supuesto:)`.
- No presentar supuestos como hechos.
- Actualizar `CHANGELOG.md` en cambios significativos.

## Reglas de testing

- Ver `docs/engineering/testing-strategy.md`.
- Probar manualmente flujos de sync, presupuesto y duplicados si se tocan.

## Reglas de seguridad

- Ver `docs/engineering/security-checklist.md` antes de tocar auth o prod.

## Reglas del modelo de datos

- Cambios de schema: actualizar `schema.pg.sql` + `data_model_context.md`.
- GAP: definir proceso de migraciones PG versionadas antes de cambios en prod.

## Formato de respuesta

- Explicar qué cambió y por qué.
- Citar código con formato `startLine:endLine:filepath`.
- Listar GAPs descubiertos.
