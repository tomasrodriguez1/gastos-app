# Gastos App

Aplicación de finanzas personales para comparar **gasto real vs presupuesto mensual**. Sincroniza gastos desde n8n, permite registro manual, asignación presupuestaria, detección de duplicados y análisis de tendencias.

## Problema de negocio

Centralizar gastos de múltiples fuentes (bancos, transferencias, efectivo) y contrastarlos contra un presupuesto estructurado por categorías, subcategorías y fondos de ahorro.

## Usuarios principales

Uso personal/familiar. Un operador gestiona presupuesto, sincronización y revisión.

## Tech stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS v4, Recharts |
| Backend | Hono 4 sobre Bun |
| Base de datos | PostgreSQL |
| Integración | n8n webhook |
| Deploy | Railway |

## Setup local

### Prerrequisitos

- [Bun](https://bun.sh)
- PostgreSQL accesible

### Instalación

```bash
git clone <repo-url>
cd gastos-app
cp .env.example .env   # editar DATABASE_URL y VITE_N8N_WEBHOOK_URL
bun install
bun run dev
```

- API: http://localhost:3001
- App: http://localhost:6001

**macOS:** doble clic en `Iniciar-Gastos.command` para arrancar y abrir el navegador.

## Scripts principales

| Script | Descripción |
|--------|-------------|
| `bun run dev` | API + Vite en paralelo |
| `bun run server` | Solo API |
| `bun run start` | API producción |
| `bun run build` | Build frontend → `dist/` |
| `bun run lint` | ESLint |
| `bun run migrate:pg` | Migración one-shot SQLite → PostgreSQL |

## Estructura del repositorio

```txt
gastos-app/
├── AGENTS.md, CLAUDE.md, CHANGELOG.md
├── docs/                  # Documentación Zalantos
├── server/                # API Hono + DB
│   ├── index.js
│   └── db/schema.pg.sql
├── src/
│   ├── App.jsx
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   └── utils/
├── public/
├── railway.json
└── vite.config.js
```

## Mapa de documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/context/context.md](docs/context/context.md) | Contexto del proyecto, rutas, flujos |
| [docs/context/data_model_context.md](docs/context/data_model_context.md) | Modelo de datos |
| [docs/architecture/architecture.md](docs/architecture/architecture.md) | Arquitectura |
| [docs/operations/runbook.md](docs/operations/runbook.md) | Operaciones |
| [AGENTS.md](AGENTS.md) | Reglas para agentes IA |

## Estado del proyecto

- Backend en PostgreSQL (migrado desde SQLite).
- Deploy configurado para Railway.
- Auth por token en producción.
- Sin suite de tests automatizados (ver [testing-strategy.md](docs/engineering/testing-strategy.md)).

## Gaps conocidos

- GAP: URL de producción y responsable operacional.
- GAP: documentación del workflow n8n.
- GAP: migraciones PG versionadas post-migración inicial.
- GAP: tests automatizados y CI.

## Licencia

Proyecto privado.
