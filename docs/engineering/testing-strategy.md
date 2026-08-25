# Gastos App — Estrategia de testing

## Estado actual

- **ESLint** configurado (`bun run lint`).
- **Bun test** (`bun test server`) cubre `server/routes/auth.js` — endpoints de passkeys,
  gate de rutas, claim atómico de challenges, regla de última passkey. Sin browser.
- **Playwright** (`bun run test:e2e`) cubre el flujo completo de passkeys con un autenticador
  virtual WebAuthn (Chrome DevTools Protocol) — criptografía real, sin dispositivo físico:
  bootstrap, login, logout, agregar/eliminar passkeys, guard de última passkey, rechazo de
  bootstrap repetido. Ver `tests/e2e/passkey.spec.js`.
- El resto de la app (cálculos, sync, presupuesto) sigue sin suite automatizada — testing
  predominantemente manual fuera de auth.

## Qué debe testearse siempre (cuando exista suite)

| Área | Prioridad | Motivo |
|------|-----------|--------|
| `montoReal()` / `calculos.js` | Alta | Montos efectivos afectan todos los totales |
| Sync UPSERT preserva overrides | Alta | Pérdida de datos en sync |
| Reglas de mapeo (prioridad, `_NONE_`) | Alta | Asignación presupuestaria |
| Detección duplicados | Media | Falsos positivos/negativos |
| `detectarRecurrentes` | Media | Heurísticas complejas |
| Presupuesto PUT por sección | Media | Borrado parcial de secciones |
| Asignación de ciclo 29–28 | Alta | Define filtros, totales, gráficos y comparaciones presupuestarias |
| Reconciliación de tarjeta | Alta | Un cierre parcial o un total mezclado puede marcar deuda incorrectamente |
| Auth passkey (registro, login, sesión, última passkey) | Alta | Cubierto — ver `server/routes/auth.test.js` y `tests/e2e/passkey.spec.js` |

## Qué puede testearse manualmente al inicio

- Sync n8n end-to-end (webhook → modal → guardado).
- CRUD gastos sync y manual.
- Editor de presupuesto + copiar ciclo anterior.
- Duplicados: excluir par, eliminar, editar asignación.
- Modo privacidad (ocultar montos).
- Deploy Coolify con passkey.

## Cómo ejecutar

```bash
bun run lint          # ESLint
bun run build         # Build de producción
bun run migrate:ciclos # Migración/verificación histórica PostgreSQL
bun test              # Unitarios de auth (server/routes/auth.test.js)
bun run test:e2e      # E2E de auth con Playwright + autenticador virtual
bun run dev           # Smoke test manual local
```

Nota sobre `bun test`/`test:e2e`: corren contra el `DATABASE_URL` configurado en `.env` — si
apunta a una base compartida (dev/staging/prod), ambas suites están escritas para crear solo
datos marcados (`__e2e_*`, `test-*`) y limpiarlos al terminar (`afterAll`), sin depender de ni
alterar el estado ambiente. Antes de correrlas contra una base que no sea 100% desechable,
confirmar que ese comportamiento de limpieza sigue intacto si se modifican los tests.

## Scripts disponibles

| Script | Propósito |
|--------|-----------|
| `dev` | API + Vite concurrentes |
| `server` | Solo API |
| `start` | API prod |
| `build` | Vite build → `dist/` |
| `lint` | ESLint |
| `test` | `bun test server src` — unitarios de auth y lógica de ciclos |
| `test:e2e` | `bun test tests/e2e` — E2E de auth con Playwright |
| `migrate` | Migraciones SQLite legacy |
| `migrate:pg` | SQLite → PostgreSQL one-shot |
| `migrate:ciclos` | Migra y verifica períodos históricos 29–28 en PostgreSQL |

## Casos críticos

1. Gasto sync con `presupuesto_manual` no se pierde al re-sync.
2. Gasto pure-USD excluido de totales CLP.
3. Manual vs sync: PATCH va al hook correcto según `es_manual`.
4. Fondo con `vinculado` cambiado propaga a gastos.
5. Sesión inválida o ausente → 401 en rutas de gestión de passkeys; `ACCESS_TOKEN` legacy
   inválido → 401 en el resto de la API (en prod).
6. Fechas 1–28 quedan en el ciclo nominal; fechas 29–31 pasan al ciclo siguiente, incluido el cambio de año.
7. Cambiar `fecha` recalcula `mes` calendario y `ciclo_financiero` sin alterar montos, categorías, cuentas ni overrides.
8. `en_presupuesto=false` y `split` solo modifican agregaciones presupuestarias, nunca la deuda de tarjeta.
9. Conciliar y pagar verifican banco, moneda, total e IDs dentro de una única transacción; un descuadre no modifica filas.
10. Un gasto con `financiado_por` baja el saldo del fondo y no entra en `montoDelCiclo()` / totales del ciclo; el análisis histórico puede incluirlo con `incluirFinanciados: true`. Archivar (`estado=cerrado`) no borra el fondo ni los usos.

## Criterios mínimos antes de merge

- [ ] `bun run lint` sin errores nuevos
- [ ] `bun run build` exitoso
- [ ] `bun test` sin fallos (si se tocó auth)
- [ ] Smoke test manual del flujo afectado
- [ ] Docs actualizadas si cambió API/modelo/env

## Gaps

- GAP: presupuesto y sync todavía no tienen cobertura de integración completa; la asignación pura de ciclos sí tiene unitarios.
- GAP: CI en GitHub Actions (los tests existen pero no corren automáticamente en cada push).
- GAP: fixtures de datos para tests de cálculos.
- GAP: estrategia de DB de test dedicada (hoy corre contra la DB de `DATABASE_URL`, con
  limpieza propia — ver nota arriba) en vez de una base desechable independiente.
