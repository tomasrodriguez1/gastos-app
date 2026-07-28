# Gastos App — Runbook operacional

## Arranque local

### Prerrequisitos

- [Bun](https://bun.sh) instalado
- PostgreSQL accesible
- Archivo `.env` con `DATABASE_URL` (y opcionalmente `VITE_N8N_WEBHOOK_URL`)

### Comandos

```bash
cd gastos-app
cp .env.example .env   # editar valores (incluir PASSKEY_BOOTSTRAP_SECRET)
bun install
bun run dev            # API :3001 + Vite :6001
```

### Enrolamiento inicial de la primera passkey (dev o prod)

1. Definir `PASSKEY_BOOTSTRAP_SECRET` en `.env` (dev) o en las variables de Coolify (prod)
   antes de arrancar. En prod, definir también `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` con el
   dominio real HTTPS — en dev usan el default `localhost`/`http://localhost:6001`.
2. Abrir la app en el navegador. Si no hay ninguna passkey registrada
   (`GET /api/auth/status` → `bootstrapRequired: true`), se muestra la pantalla de
   configuración inicial.
3. Ingresar el `PASSKEY_BOOTSTRAP_SECRET` y, opcionalmente, un nombre para la passkey (ej.
   "1Password", "MacBook", "iPhone").
4. El navegador pide confirmar con Touch ID / Face ID / Windows Hello / PIN, o guardarla en un
   gestor de passkeys (1Password, iCloud Keychain, Google Password Manager).
5. Al verificarse, queda una sesión activa automáticamente — no hace falta loguear de nuevo.
6. **Recomendado:** agregar una segunda passkey desde `/passkeys` (otro dispositivo o
   proveedor) para no depender de un solo autenticador — ver Recuperación más abajo.
7. Una vez confirmado que el login funciona, `PASSKEY_BOOTSTRAP_SECRET` ya no se puede volver
   a usar (queda inerte mientras exista al menos una passkey) — no hace falta rotarlo ni
   quitarlo, pero puede quitarse si se prefiere no dejarlo configurado.

### macOS (doble clic)

`Iniciar-Gastos.command` — arranca `bun run dev` y abre `http://localhost:6001`.

**Nota:** path hardcodeado a `/Users/tomasrodriguez/Desktop/Gastos/gastos-app`.

## Logs

| Fuente | Dónde |
|--------|-------|
| API | Terminal donde corre `bun run server` o `bun run dev` |
| Vite | Misma terminal (concurrently) |
| DB init | `[db] Schema initialized` |
| Errores presupuesto | `[presupuesto PUT]` en servidor |

GAP: logs centralizados en Railway no documentados.

## Reinicio

### Local

`Ctrl+C` en terminal → `bun run dev`.

### Producción (Coolify)

Redeploy o restart del servicio desde el dashboard de Coolify.

## Migraciones

### PostgreSQL (schema)

- Auto en dev: `initSchema()` al arrancar.
- Prod: `RUN_SCHEMA_INIT=true` en primer deploy o manualmente.

### Ciclos financieros 29–28

```bash
# Idempotente: recalcula mes calendario, asigna ciclo y verifica el histórico.
bun run migrate:ciclos
```

### SQLite → PostgreSQL (one-shot)

```bash
# Requiere data/gastos.db local y DATABASE_URL configurado
bun run migrate:pg
```

### SQLite legacy (histórico)

```bash
bun run migrate   # solo si se usa SQLite local legacy
```

### Tests

```bash
bun run lint       # ESLint
bun test           # unitarios de auth y ciclos, sin browser
bun run test:e2e   # E2E completo (Playwright + autenticador virtual WebAuthn de CDP)
```

`test:e2e` levanta su propio `bun run dev`, corre el flujo completo de bootstrap → login →
logout → gestión de passkeys, y limpia toda la data que crea al terminar (no debe dejar
residuos). Requiere `PASSKEY_BOOTSTRAP_SECRET` en el entorno.

## Errores comunes

| Error | Causa probable | Acción |
|-------|----------------|--------|
| `DATABASE_URL is required` | Falta env var | Configurar `.env` |
| `Acceso no autorizado` (legacy) | `ACCESS_TOKEN` inválido en prod | Usar URL con `?t=TOKEN` correcto, o loguear con passkey |
| `No autorizado` en `/api/auth/passkey/register/*` | `PASSKEY_BOOTSTRAP_SECRET` incorrecto, o ya existe una passkey y falta sesión | Revisar el secreto; si ya hay passkeys, hace falta sesión válida (o el procedimiento de recuperación, ver abajo) |
| `Challenge inválido o expirado` | Pasaron >2 min entre pedir opciones y verificar, o el challenge ya se usó | Reintentar desde cero (pedir opciones de nuevo) |
| El navegador no ofrece crear/usar passkey | Navegador sin soporte WebAuthn, o `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` no coinciden con el dominio real | Probar con Safari/Chrome/Edge actualizados; verificar env vars |
| `Webhook URL no configurada` | Falta `VITE_N8N_WEBHOOK_URL` | Agregar a `.env`, rebuild si prod |
| `Error al conectar con n8n` | Webhook caído o CORS | Verificar instancia n8n |
| Presupuesto no guarda | Error DB/transacción | Ver logs `[presupuesto PUT]`, recargar |
| Build falla | Deps o syntax | `bun run lint`, revisar errores |

## Validación en producción

1. Abrir la app en el dominio real (HTTPS).
2. Si es la primera vez: completar el bootstrap con `PASSKEY_BOOTSTRAP_SECRET` y una passkey
   real (ver "Enrolamiento inicial" arriba).
3. Verificar cookie `gastos_session` seteada (`httpOnly`, `Secure`, `SameSite=Strict`).
4. Dashboard carga gastos del mes.
5. `GET /api/gastos` responde 200 (con sesión activa).
6. Guardar cambio en presupuesto persiste tras reload.
7. Cerrar sesión y volver a entrar solo con la passkey — sin escribir nada.
8. (Legacy, mientras dure la convivencia) confirmar que un link con `?t=ACCESS_TOKEN` sigue
   funcionando como método alternativo.

## Recuperación (passkeys perdidas / lockout)

Estrategia preferida: mantener **al menos dos passkeys** registradas desde el principio (ej.
1Password + iCloud Keychain), gestionadas desde `/passkeys`. Si ambas se pierden:

1. Requiere acceso directo al servidor/Coolify (variables de entorno).
2. Setear `PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL` a un timestamp ISO en el futuro cercano (ej.
   1 hora: `date -u -v+1H +%FT%TZ` en macOS, o calcular a mano).
3. Redeployar/reiniciar el servicio para que tome la nueva variable.
4. Volver a hacer el enrolamiento inicial con `PASSKEY_BOOTSTRAP_SECRET` — esto registra una
   passkey nueva sin borrar las existentes (que probablemente ya no sirven, pero no se tocan).
5. Desetear `PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL` inmediatamente después de usarlo y
   redeployar/reiniciar de nuevo — no debe quedar disponible permanentemente. Aunque venza
   solo, desetearlo explícitamente evita dejar una ventana de recuperación abierta más tiempo
   del necesario.
6. No existe una ruta pública ni un bypass oculto: sin esta variable, con ≥1 passkey ya
   registrada, `PASSKEY_BOOTSTRAP_SECRET` no sirve para nada (401 genérico).

## Playbooks de integraciones

### n8n sync falla

1. Verificar `VITE_N8N_WEBHOOK_URL` en env de build.
2. Probar webhook con curl POST `{ "since": "2024-01-01" }`.
3. Verificar formato respuesta: `{ entries, syncedAt }`.
4. Revisar dedup: gastos ya existentes no aparecen en modal.

### PostgreSQL connection fail

1. Verificar `DATABASE_URL` y conectividad.
2. En prod: confirmar SSL (`sslmode` o auto-require).
3. Revisar pool limits en `server/db/client.js`.

## Guía de prueba manual (passkeys, navegador real)

Para validar el flujo completo sin depender de los tests automatizados:

1. `bun run dev` (o abrir la app deployada).
2. Si no hay passkeys: completar el bootstrap (secreto + nombre opcional), autorizar con
   Touch ID/Face ID/Windows Hello/PIN o guardar en 1Password/iCloud Keychain.
3. Verificar que se entra directo al dashboard sin pedir login adicional.
4. Ir a `/passkeys`, confirmar que aparece la passkey recién creada con nombre y fecha.
5. Cerrar sesión (botón "Cerrar sesión" en el sidebar o en `/passkeys` en mobile).
6. Confirmar que vuelve a la pantalla "Ingresar con passkey" y que las rutas de la app
   (`/`, `/gastos`, etc.) ya no cargan datos.
7. Click en "Ingresar con passkey" — debería autenticar sin pedir texto ni contraseña.
8. Agregar una segunda passkey desde otro dispositivo o proveedor.
9. Intentar borrar todas las passkeys menos una — el botón "Eliminar" de la última debe estar
   deshabilitado, con tooltip explicando por qué.
10. (Opcional) Confirmar que un link legacy con `?t=ACCESS_TOKEN` correcto sigue funcionando
    en paralelo, sin pedir passkey.

## Contactos / responsables

GAP: responsable operacional no documentado en repo.

## Gaps

- GAP: procedimiento de backup/restore PostgreSQL.
- GAP: alertas de downtime.
- GAP: rotación de `ACCESS_TOKEN` documentada más allá de "rotar si se filtró" (ver
  `docs/engineering/security-checklist.md`) — de todas formas, en camino a retirarse (DEC-009).
- GAP: dominio real de producción para completar `PASSKEY_RP_ID`/`PASSKEY_ORIGIN`.
- GAP: confirmar si Coolify necesita configuración adicional (health check, Dockerfile) —
  ver `docs/operations/deployment.md`.
