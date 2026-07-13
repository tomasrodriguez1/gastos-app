# Gastos App — Estrategia de testing

## Estado actual

- **ESLint** configurado (`bun run lint`).
- **Playwright** en devDependencies pero **sin suite de tests detectada**.
- Testing predominantemente manual.

## Qué debe testearse siempre (cuando exista suite)

| Área | Prioridad | Motivo |
|------|-----------|--------|
| `montoReal()` / `calculos.js` | Alta | Montos efectivos afectan todos los totales |
| Sync UPSERT preserva overrides | Alta | Pérdida de datos en sync |
| Reglas de mapeo (prioridad, `_NONE_`) | Alta | Asignación presupuestaria |
| Detección duplicados | Media | Falsos positivos/negativos |
| `detectarRecurrentes` | Media | Heurísticas complejas |
| Presupuesto PUT por sección | Media | Borrado parcial de secciones |
| Auth middleware | Media | Acceso no autorizado en prod |

## Qué puede testearse manualmente al inicio

- Sync n8n end-to-end (webhook → modal → guardado).
- CRUD gastos sync y manual.
- Editor de presupuesto + copiar mes anterior.
- Duplicados: excluir par, eliminar, editar asignación.
- Modo privacidad (ocultar montos).
- Deploy Railway con token.

## Cómo ejecutar

```bash
bun run lint          # ESLint
bun run build         # Build de producción
bun run dev           # Smoke test manual local
```

GAP: comando de test unitario (`bun test` o similar) no configurado.

## Scripts disponibles

| Script | Propósito |
|--------|-----------|
| `dev` | API + Vite concurrentes |
| `server` | Solo API |
| `start` | API prod |
| `build` | Vite build → `dist/` |
| `lint` | ESLint |
| `migrate` | Migraciones SQLite legacy |
| `migrate:pg` | SQLite → PostgreSQL one-shot |

## Casos críticos

1. Gasto sync con `presupuesto_manual` no se pierde al re-sync.
2. Gasto pure-USD excluido de totales CLP.
3. Manual vs sync: PATCH va al hook correcto según `es_manual`.
4. Fondo con `vinculado` cambiado propaga a gastos.
5. Token inválido → 401 en prod.

## Criterios mínimos antes de merge

- [ ] `bun run lint` sin errores nuevos
- [ ] `bun run build` exitoso
- [ ] Smoke test manual del flujo afectado
- [ ] Docs actualizadas si cambió API/modelo/env

## Gaps

- GAP: configurar runner de tests (Bun test o Vitest).
- GAP: tests E2E con Playwright para rutas principales.
- GAP: CI en GitHub Actions.
- GAP: fixtures de datos para tests de cálculos.
