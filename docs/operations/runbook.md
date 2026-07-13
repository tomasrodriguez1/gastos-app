# Gastos App — Runbook operacional

## Arranque local

### Prerrequisitos

- [Bun](https://bun.sh) instalado
- PostgreSQL accesible
- Archivo `.env` con `DATABASE_URL` (y opcionalmente `VITE_N8N_WEBHOOK_URL`)

### Comandos

```bash
cd gastos-app
cp .env.example .env   # editar valores
bun install
bun run dev            # API :3001 + Vite :6001
```

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

### Producción (Railway)

Redeploy o restart del servicio desde dashboard Railway.

## Migraciones

### PostgreSQL (schema)

- Auto en dev: `initSchema()` al arrancar.
- Prod: `RUN_SCHEMA_INIT=true` en primer deploy o manualmente.

### SQLite → PostgreSQL (one-shot)

```bash
# Requiere data/gastos.db local y DATABASE_URL configurado
bun run migrate:pg
```

### SQLite legacy (histórico)

```bash
bun run migrate   # solo si se usa SQLite local legacy
```

## Errores comunes

| Error | Causa probable | Acción |
|-------|----------------|--------|
| `DATABASE_URL is required` | Falta env var | Configurar `.env` |
| `Acceso no autorizado` | Token inválido en prod | Usar URL con `?t=TOKEN` correcto |
| `Webhook URL no configurada` | Falta `VITE_N8N_WEBHOOK_URL` | Agregar a `.env`, rebuild si prod |
| `Error al conectar con n8n` | Webhook caído o CORS | Verificar instancia n8n |
| Presupuesto no guarda | Error DB/transacción | Ver logs `[presupuesto PUT]`, recargar |
| Build falla | Deps o syntax | `bun run lint`, revisar errores |

## Validación en producción

1. Abrir app con link `?t=ACCESS_TOKEN` (primera vez).
2. Verificar cookie `gastos_access` seteada.
3. Dashboard carga gastos del mes.
4. `GET /api/gastos` responde 200.
5. Guardar cambio en presupuesto persiste tras reload.

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

## Contactos / responsables

GAP: responsable operacional no documentado en repo.

## Gaps

- GAP: procedimiento de backup/restore PostgreSQL.
- GAP: alertas de downtime.
- GAP: rotación de `ACCESS_TOKEN` documentada.
