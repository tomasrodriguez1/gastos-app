# Gastos App — Estándares de código

Stack: JavaScript (JSX), Bun, Hono, PostgreSQL, React 19, Vite, Tailwind v4.

## Naming

- Componentes React: `PascalCase.jsx`
- Hooks: `useNombre.js` (camelCase con prefijo `use`)
- Utils: `camelCase.js`
- Tablas DB: `snake_case`
- Rutas API: kebab-case en paths (`/api/reglas-mapeo`)

## Estructura de carpetas

```txt
src/
  pages/        # Una página por ruta
  components/   # Por dominio (Dashboard, Gastos, etc.)
  hooks/        # Data fetching y estado local
  utils/        # Funciones puras
  contexts/     # React contexts
server/
  index.js      # API monolítica
  db/           # Client, schema, init
  duplicados.js # Lógica de dominio server-side
```

## Error handling

- API: `{ error: string }` + status HTTP (400, 404, 409, 500).
- Frontend: estados en hooks; banner global para errores de presupuesto.
- Evitar catch silencioso salvo en sync confirm (documentar si se mantiene).

## Validación

- PATCH gastos: whitelist de campos en `server/index.js`.
- Query params requeridos validados (ej. `mes` en duplicados).
- Catálogos: validar tipo antes de CRUD.

## Logging

- `console.log` / `console.error` en servidor.
- Prefijos: `[server]`, `[db]`, `[migrate]`, `[presupuesto PUT]`.

## Tipos

Proyecto sin TypeScript. JSDoc opcional en funciones complejas.

## Servicios / controladores

No hay capa separada. Lógica en route handlers y helpers en mismo archivo o `duplicados.js`.

## Migraciones

- SQLite legacy: numeradas en `server/migrations/run.js` — **nunca editar migraciones aplicadas**.
- PostgreSQL: `server/db/schema.pg.sql` + `initSchema()`.
- GAP: migraciones PG versionadas.

## Variables de entorno

- Server: `process.env.*`
- Cliente: `import.meta.env.VITE_*` (solo variables públicas)
- Documentar en `docs/operations/env-vars.md`

## Commits

Estilo inferido del repo: mensajes en español o inglés, descriptivos, enfocados en el "por qué".

## Pull requests

Usar `.github/pull_request_template.md`. Separar feature, refactor y bugfix cuando sea posible.

## JSX / React

- Estado global vía props desde `App.jsx`, no Redux/Zustand.
- Pre-carga de reglas al boot: `cargarReglas()` en `App.jsx`.
- Formateo CLP: `src/utils/formatters.js`.
- Agregaciones: `src/utils/calculos.js`.

## SQL

- Tagged templates con `postgres` (`sql\`...\``).
- Montos: parsear con `toMonto()` desde strings PG.
- Transacciones: `sql.begin()` para operaciones multi-tabla.

## Tailwind

- Tailwind v4 vía plugin Vite.
- Variables CSS: `--background`, etc. en `index.css`.
