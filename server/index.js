import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import sql from './db/client.js'
import { initSchema } from './db/init.js'
import { migrateFinancialCycles } from './db/migrate-financial-cycles.js'
import { migrateIngesta } from './db/migrate-ingesta.js'
import { toMonto } from './db/numeric.js'
import { detectarDuplicadosCiclo } from './duplicados.js'
import { authRouter } from './routes/auth.js'
import { ingestaRouter } from './ingesta.js'
import { agenteRouter } from './agente.js'
import { tarjetaRouter } from './tarjeta.js'
import { createAuthMiddleware } from './auth.js'
import { migrateComercios } from './db/migrate-comercios.js'
import { migrateTarjetaReconciliacion } from './db/migrate-tarjeta-reconciliacion.js'
import { aprenderComercio, listarComercios, olvidarComercio } from './comercios.js'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../src/utils/ciclos.js'

const app = new Hono()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:6001'
const ACCESS_TOKEN = process.env.ACCESS_TOKEN

await migrateFinancialCycles()
await migrateIngesta()
await migrateComercios()
await migrateTarjetaReconciliacion()
if (process.env.RUN_SCHEMA_INIT === 'true' || process.env.NODE_ENV !== 'production') {
  await initSchema()
}

// ─── AUTENTICACIÓN PASSKEY (WebAuthn) ────────────────────────────────────────
// Montado antes del gate para que /api/auth/* nunca quede detrás de él —
// cada endpoint aplica su propio gate (bootstrap secret o sesión).

app.route('/api/auth', authRouter)

// ─── INGESTA EXTERNA (n8n) ───────────────────────────────────────────────────
// Montado antes del gate por el mismo motivo que /api/auth/* — usa su propio
// token (INGESTA_TOKEN), no passkey ni ACCESS_TOKEN. Ver server/ingesta.js.

app.route('/api/ingesta', ingestaRouter)

// ─── GATE GLOBAL: sesión passkey O ACCESS_TOKEN legacy (en paralelo) ────────
// ACCESS_TOKEN se mantiene activo hasta confirmar login passkey en producción
// real — ver docs/architecture/decisions.md DEC-009.

app.use('*', createAuthMiddleware(ACCESS_TOKEN))

app.use('*', cors({ origin: CORS_ORIGIN }))

// ─── AGENTE CONVERSACIONAL (F3) ──────────────────────────────────────────────
// A diferencia de /api/ingesta, esto es una sesión de browser autenticada
// (passkey/ACCESS_TOKEN) — se monta después del gate global y hereda esa auth,
// sin token propio. Ver server/agente.js.

app.route('/api/agente', agenteRouter)
app.route('/api/tarjeta', tarjetaRouter)

// ─── GASTOS ──────────────────────────────────────────────────────────────────

app.get('/api/gastos/sync-keys', async (c) => {
  const rows = await sql`SELECT sync_key FROM gastos WHERE sync_key IS NOT NULL`
  return c.json({ sync_keys: rows.map(r => r.sync_key) })
})

app.get('/api/gastos', async (c) => {
  const ciclo = c.req.query('ciclo')
  const mes = c.req.query('mes')
  let rows
  if (ciclo && mes) {
    rows = await sql`SELECT * FROM gastos WHERE ciclo_financiero = ${ciclo} AND mes = ${mes} ORDER BY fecha DESC`
  } else if (ciclo) {
    rows = await sql`SELECT * FROM gastos WHERE ciclo_financiero = ${ciclo} ORDER BY fecha DESC`
  } else if (mes) {
    rows = await sql`SELECT * FROM gastos WHERE mes = ${mes} ORDER BY fecha DESC`
  } else {
    rows = await sql`SELECT * FROM gastos ORDER BY fecha DESC`
  }
  return c.json(rows.map(deserializarGasto))
})

app.patch('/api/gastos/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const changes = await c.req.json()

  const allowed = [
    'fecha', 'motivo', 'banco', 'tipos', 'contexto', 'monto', 'monto_real',
    'usd', 'monto_clp_manual', 'split', 'pagado', 'estado',
    'plata_en_cuenta', 'en_presupuesto',
    'presupuesto_manual', 'contexto_override', 'monto_presupuesto_manual',
  ]

  const fields = Object.keys(changes).filter(k => allowed.includes(k))
  if (fields.length === 0) return c.json({ error: 'No hay campos válidos' }, 400)

  const updates = {}
  for (const f of fields) updates[f] = serializarCampoGasto(f, changes[f])
  if (fields.includes('fecha')) {
    try {
      updates.mes = obtenerMesCalendario(changes.fecha)
      updates.ciclo_financiero = obtenerCicloFinanciero(changes.fecha)
    } catch (error) {
      return c.json({ error: error.message }, 400)
    }
  }

  const rows = await sql`
    UPDATE gastos
    SET ${sql(updates)}, updated_at = NOW()
    WHERE id = ${id} OR sync_key = ${id}
    RETURNING *
  `

  if (rows.length === 0) return c.json({ error: 'Gasto no encontrado' }, 404)

  // Memoria de comercios (F2): aprender de una confirmación humana es un
  // side-effect best-effort — nunca debe hacer fallar el guardado del gasto
  // que lo disparó. No aprende de pendientes editados, solo de confirmaciones.
  if (rows[0].estado === 'confirmado') {
    try {
      await aprenderComercio(rows[0])
    } catch (error) {
      console.error('[comercios] no se pudo aprender:', error.message)
    }
  }

  return c.json({ ok: true, gasto: deserializarGasto(rows[0]) })
})

app.get('/api/gastos/duplicados', async (c) => {
  const ciclo = c.req.query('ciclo')
  if (!ciclo) return c.json({ error: 'Falta parámetro ciclo' }, 400)
  const { grupos, resumen } = await detectarDuplicadosCiclo(sql, ciclo, deserializarGasto)
  return c.json({ ciclo, resumen, grupos })
})

app.post('/api/gastos/duplicados/excluir', async (c) => {
  const { id_a, id_b } = await c.req.json()
  if (!id_a || !id_b) return c.json({ error: 'Faltan id_a e id_b' }, 400)
  const [a, b] = [id_a, id_b].sort()
  await sql`
    INSERT INTO duplicado_exclusion (gasto_id_a, gasto_id_b)
    VALUES (${a}, ${b})
    ON CONFLICT DO NOTHING
  `
  return c.json({ ok: true })
})

app.delete('/api/gastos/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const rows = await sql`
    DELETE FROM gastos WHERE id = ${id} OR sync_key = ${id} RETURNING id
  `
  if (rows.length === 0) return c.json({ error: 'Gasto no encontrado' }, 404)
  return c.json({ ok: true, deleted: rows.length })
})

// ─── COMPATIBILIDAD: POST /api/datos ─────────────────────────────────────────

app.post('/api/datos', async (c) => {
  const clave = c.req.query('clave')
  const body = await c.req.json()

  if (clave === 'gastos') {
    const gastos = Array.isArray(body) ? body : [body]
    await sql.begin(async (tx) => {
      for (const g of gastos) {
        if (!g.fecha || !g.motivo) continue
        let mesCalendario
        let cicloFinanciero
        try {
          mesCalendario = obtenerMesCalendario(g.fecha)
          cicloFinanciero = obtenerCicloFinanciero(g.fecha)
        } catch {
          continue
        }
        const syncKey = `${g.fecha}|${g.motivo.trim().toLowerCase()}`
        await tx`
          INSERT INTO gastos (id, sync_key, fecha, mes, ciclo_financiero, motivo, banco, tipos, contexto,
            monto, monto_real, usd, monto_clp_manual, split, presupuesto_manual,
            contexto_override, monto_presupuesto_manual, pagado, plata_en_cuenta,
            en_presupuesto, conciliado, es_manual, updated_at)
          VALUES (
            ${crypto.randomUUID()}, ${syncKey},
            ${g.fecha}, ${mesCalendario}, ${cicloFinanciero}, ${g.motivo},
            ${g.banco || ''}, ${g.tipos || []}, ${g.contexto || ''},
            ${g.monto || 0}, ${g.monto_real || 0}, ${g.usd || 0},
            ${g.monto_clp_manual ?? null}, ${g.split || 0},
            ${g.presupuesto_manual ?? null},
            ${g.contexto_override ?? null}, ${g.monto_presupuesto_manual ?? null},
            ${g.pagado ? true : false}, ${g.plata_en_cuenta ? true : false},
            ${g.en_presupuesto !== false}, ${g.conciliado ? true : false}, false, NOW()
          )
          ON CONFLICT(sync_key) DO UPDATE SET
            fecha = EXCLUDED.fecha,
            mes = EXCLUDED.mes,
            ciclo_financiero = EXCLUDED.ciclo_financiero,
            motivo = EXCLUDED.motivo,
            banco = EXCLUDED.banco,
            tipos = EXCLUDED.tipos,
            contexto = EXCLUDED.contexto,
            monto = EXCLUDED.monto,
            monto_real = EXCLUDED.monto_real,
            usd = EXCLUDED.usd,
            split = EXCLUDED.split,
            presupuesto_manual = COALESCE(gastos.presupuesto_manual, EXCLUDED.presupuesto_manual),
            contexto_override = COALESCE(gastos.contexto_override, EXCLUDED.contexto_override),
            monto_clp_manual = COALESCE(gastos.monto_clp_manual, EXCLUDED.monto_clp_manual),
            monto_presupuesto_manual = COALESCE(gastos.monto_presupuesto_manual, EXCLUDED.monto_presupuesto_manual),
            updated_at = NOW()
        `
      }
    })
    return c.text('ok')
  }

  if (clave === 'gastos_manuales') {
    const gastos = Array.isArray(body) ? body : [body]
    await sql.begin(async (tx) => {
      for (const g of gastos) {
        let mesCalendario
        let cicloFinanciero
        try {
          mesCalendario = obtenerMesCalendario(g.fecha)
          cicloFinanciero = obtenerCicloFinanciero(g.fecha)
        } catch {
          continue
        }
        const id = g.id || crypto.randomUUID()
        await tx`
          INSERT INTO gastos (id, sync_key, fecha, mes, ciclo_financiero, motivo, banco, tipos, contexto,
            monto, monto_real, usd, monto_clp_manual, split, presupuesto_manual,
            contexto_override, monto_presupuesto_manual, pagado, plata_en_cuenta,
            en_presupuesto, conciliado, es_manual, updated_at)
          VALUES (
            ${id}, NULL,
            ${g.fecha}, ${mesCalendario}, ${cicloFinanciero}, ${g.motivo || ''},
            ${g.banco || ''}, ${g.tipos || []}, ${g.contexto || ''},
            ${g.monto || 0}, ${g.monto_real || 0}, ${g.usd || 0},
            ${g.monto_clp_manual ?? null}, ${g.split || 0},
            ${g.presupuesto_manual ?? null},
            ${g.contexto_override ?? null}, ${g.monto_presupuesto_manual ?? null},
            ${g.pagado ? true : false}, ${g.plata_en_cuenta ? true : false},
            ${g.en_presupuesto !== false}, ${g.conciliado ? true : false}, true, NOW()
          )
          ON CONFLICT(id) DO UPDATE SET
            fecha = EXCLUDED.fecha,
            mes = EXCLUDED.mes,
            ciclo_financiero = EXCLUDED.ciclo_financiero,
            motivo = EXCLUDED.motivo,
            banco = EXCLUDED.banco,
            tipos = EXCLUDED.tipos,
            contexto = EXCLUDED.contexto,
            monto = EXCLUDED.monto,
            monto_real = EXCLUDED.monto_real,
            usd = EXCLUDED.usd,
            monto_clp_manual = EXCLUDED.monto_clp_manual,
            split = EXCLUDED.split,
            presupuesto_manual = EXCLUDED.presupuesto_manual,
            contexto_override = EXCLUDED.contexto_override,
            monto_presupuesto_manual = EXCLUDED.monto_presupuesto_manual,
            pagado = EXCLUDED.pagado,
            plata_en_cuenta = EXCLUDED.plata_en_cuenta,
            en_presupuesto = EXCLUDED.en_presupuesto,
            conciliado = EXCLUDED.conciliado,
            updated_at = NOW()
        `
      }
    })
    return c.text('ok')
  }

  return c.text('Clave no permitida', 400)
})

// ─── COMPATIBILIDAD: GET /api/datos ──────────────────────────────────────────

app.get('/api/datos', async (c) => {
  const clave = c.req.query('clave')

  if (clave === 'gastos') {
    const rows = await sql`SELECT * FROM gastos WHERE es_manual = false`
    return c.json(rows.map(deserializarGasto))
  }

  if (clave === 'gastos_manuales') {
    const rows = await sql`SELECT * FROM gastos WHERE es_manual = true`
    return c.json(rows.map(deserializarGasto))
  }

  return c.json(null, 400)
})

// ─── PRESUPUESTO ─────────────────────────────────────────────────────────────

app.get('/api/presupuesto/ciclos', async (c) => {
  const rows = await sql`SELECT ciclo FROM presupuesto_ciclo ORDER BY ciclo DESC`
  return c.json(rows.map(r => r.ciclo))
})

app.get('/api/presupuesto/:ciclo', async (c) => {
  const ciclo = c.req.param('ciclo')
  return c.json(await leerPresupuestoCiclo(ciclo))
})

app.put('/api/presupuesto/:ciclo', async (c) => {
  const ciclo = c.req.param('ciclo')
  const datos = await c.req.json()
  try {
    const { gastos_actualizados } = await guardarPresupuestoCicloDB(ciclo, datos)
    return c.json({ ok: true, gastos_actualizados })
  } catch (e) {
    console.error('[presupuesto PUT]', e.message)
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/presupuesto/:ciclo/copiar-anterior', async (c) => {
  const ciclo = c.req.param('ciclo')
  const [yr, mo] = ciclo.split('-').map(Number)
  let prevMo = mo - 1, prevYr = yr
  if (prevMo <= 0) { prevMo = 12; prevYr-- }
  const cicloPrevio = `${prevYr}-${String(prevMo).padStart(2, '0')}`

  const prevData = await leerPresupuestoCiclo(cicloPrevio)
  if (!prevData) return c.json({ error: 'No hay presupuesto en el ciclo anterior' }, 404)

  await guardarPresupuestoCicloDB(ciclo, prevData)
  return c.json({ ok: true })
})

// ─── RESERVA TARJETA ─────────────────────────────────────────────────────────
// Saldo reservado por tarjeta para pagar la TC (ej. Mercado Pago). Standalone,
// fuera del presupuesto — ver server/db/schema.pg.sql.

app.get('/api/reserva-tarjeta', async (c) => {
  const rows = await sql`SELECT banco, monto FROM reserva_tarjeta ORDER BY banco`
  return c.json(rows.map(r => ({ banco: r.banco, monto: toMonto(r.monto) })))
})

app.put('/api/reserva-tarjeta/:banco', async (c) => {
  const banco = decodeURIComponent(c.req.param('banco'))
  const { monto } = await c.req.json()
  if (typeof monto !== 'number' || Number.isNaN(monto)) {
    return c.json({ error: 'monto inválido' }, 400)
  }
  await sql`
    INSERT INTO reserva_tarjeta (banco, monto, updated_at)
    VALUES (${banco}, ${monto}, NOW())
    ON CONFLICT (banco) DO UPDATE SET monto = EXCLUDED.monto, updated_at = NOW()
  `
  return c.json({ ok: true, banco, monto })
})

// ─── CATÁLOGOS ───────────────────────────────────────────────────────────────

app.get('/api/catalogos/grupos', async (c) => {
  const grupos = await sql`SELECT * FROM catalogo_grupo ORDER BY orden`
  const subcats = await sql`SELECT * FROM catalogo_subcategoria ORDER BY grupo_id, orden`

  const result = grupos.map(g => ({
    ...g,
    subcategorias: subcats.filter(s => s.grupo_id === g.id).map(s => ({ id: s.id, nombre: s.nombre, orden: s.orden })),
  }))
  return c.json(result)
})

app.get('/api/catalogos/tipos', async (c) => {
  return c.json(await sql`SELECT * FROM catalogo_tipo ORDER BY orden`)
})

app.get('/api/catalogos/bancos', async (c) => {
  return c.json(await sql`SELECT * FROM catalogo_banco ORDER BY orden`)
})

app.get('/api/catalogos/contextos', async (c) => {
  return c.json(await sql`SELECT * FROM catalogo_contexto ORDER BY orden`)
})

app.post('/api/catalogos/:tipo', async (c) => {
  const tipo = c.req.param('tipo')
  const tabla = tablasCatalogo[tipo]
  if (!tabla) return c.json({ error: 'Tipo no válido' }, 400)

  const body = await c.req.json()
  const { id, nombre, orden, grupo_id } = body

  if (tipo === 'subcategorias') {
    await sql`INSERT INTO catalogo_subcategoria (id, grupo_id, nombre, orden) VALUES (${id}, ${grupo_id}, ${nombre}, ${orden || 0})`
  } else {
    await sql`INSERT INTO ${sql(tabla)} (id, nombre, orden) VALUES (${id}, ${nombre}, ${orden || 0})`
  }
  return c.json({ ok: true })
})

app.put('/api/catalogos/:tipo/:id', async (c) => {
  const tipo = c.req.param('tipo')
  const id = decodeURIComponent(c.req.param('id'))
  const tabla = tablasCatalogo[tipo]
  if (!tabla) return c.json({ error: 'Tipo no válido' }, 400)

  const { nombre, orden } = await c.req.json()
  await sql`UPDATE ${sql(tabla)} SET nombre = ${nombre}, orden = ${orden} WHERE id = ${id}`
  return c.json({ ok: true })
})

app.delete('/api/catalogos/:tipo/:id', async (c) => {
  const tipo = c.req.param('tipo')
  const id = decodeURIComponent(c.req.param('id'))
  const tabla = tablasCatalogo[tipo]
  if (!tabla) return c.json({ error: 'Tipo no válido' }, 400)

  if (tipo === 'tipos') {
    const [usado] = await sql`SELECT COUNT(*)::int as n FROM gastos WHERE tipos @> ${JSON.stringify([id])}::jsonb`
    if (usado.n > 0) return c.json({ error: `Tipo en uso en ${usado.n} gastos` }, 409)
  }

  await sql`DELETE FROM ${sql(tabla)} WHERE id = ${id}`
  return c.json({ ok: true })
})

const tablasCatalogo = {
  grupos: 'catalogo_grupo',
  subcategorias: 'catalogo_subcategoria',
  tipos: 'catalogo_tipo',
  bancos: 'catalogo_banco',
  contextos: 'catalogo_contexto',
}

// ─── MEMORIA DE COMERCIOS (F2) ────────────────────────────────────────────────
// Gestión mínima para poder corregir/olvidar un mapeo mal aprendido. Sin UI
// dedicada todavía (candidato a F4) — se consume desde /agente o a mano.

app.get('/api/comercios', async (c) => {
  return c.json(await listarComercios())
})

app.delete('/api/comercios/:comercioNormalizado', async (c) => {
  const comercioNormalizado = decodeURIComponent(c.req.param('comercioNormalizado'))
  const borrado = await olvidarComercio(comercioNormalizado)
  if (!borrado) return c.json({ error: 'Comercio no encontrado' }, 404)
  return c.json({ ok: true })
})

// ─── REGLAS DE MAPEO ─────────────────────────────────────────────────────────

app.get('/api/reglas-mapeo', async (c) => {
  return c.json(await sql`SELECT * FROM regla_mapeo ORDER BY prioridad, id`)
})

app.post('/api/reglas-mapeo/test', async (c) => {
  const { gasto } = await c.req.json()
  const resultado = await mapearGastoConRegla(gasto)
  return c.json(resultado)
})

app.post('/api/reglas-mapeo', async (c) => {
  const body = await c.req.json()
  const { prioridad, contexto, tipo, banco, motivo_regex, grupo_dest, subcat_dest, descripcion } = body
  const [row] = await sql`
    INSERT INTO regla_mapeo (prioridad, contexto, tipo, banco, motivo_regex, grupo_dest, subcat_dest, descripcion)
    VALUES (${prioridad}, ${contexto ?? null}, ${tipo ?? null}, ${banco ?? null}, ${motivo_regex ?? null}, ${grupo_dest}, ${subcat_dest ?? null}, ${descripcion ?? null})
    RETURNING id
  `
  return c.json({ ok: true, id: row.id })
})

app.put('/api/reglas-mapeo/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { prioridad, contexto, tipo, banco, motivo_regex, grupo_dest, subcat_dest, descripcion, activa } = body
  await sql`
    UPDATE regla_mapeo SET
      prioridad = ${prioridad},
      contexto = ${contexto ?? null},
      tipo = ${tipo ?? null},
      banco = ${banco ?? null},
      motivo_regex = ${motivo_regex ?? null},
      grupo_dest = ${grupo_dest},
      subcat_dest = ${subcat_dest ?? null},
      descripcion = ${descripcion ?? null},
      activa = ${activa ?? true}
    WHERE id = ${id}
  `
  return c.json({ ok: true })
})

app.delete('/api/reglas-mapeo/:id', async (c) => {
  await sql`DELETE FROM regla_mapeo WHERE id = ${c.req.param('id')}`
  return c.json({ ok: true })
})

// ─── STATS ───────────────────────────────────────────────────────────────────

app.get('/api/stats/meses', async (c) => {
  const rows = await sql`SELECT DISTINCT mes FROM gastos ORDER BY mes DESC`
  return c.json(rows.map(r => r.mes))
})

app.get('/api/stats/ciclos', async (c) => {
  const rows = await sql`SELECT DISTINCT ciclo_financiero FROM gastos ORDER BY ciclo_financiero DESC`
  return c.json(rows.map(r => r.ciclo_financiero))
})

// ─── STATIC (producción) ─────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function deserializarGasto(row) {
  const tipos = Array.isArray(row.tipos)
    ? row.tipos
    : (typeof row.tipos === 'string' ? JSON.parse(row.tipos || '[]') : [])
  const presupuesto_manual = typeof row.presupuesto_manual === 'string'
    ? JSON.parse(row.presupuesto_manual)
    : (row.presupuesto_manual ?? null)
  return {
    ...row,
    tipos,
    presupuesto_manual,
    monto: toMonto(row.monto),
    monto_real: toMonto(row.monto_real),
    usd: toMonto(row.usd),
    monto_clp_manual: toMonto(row.monto_clp_manual),
    split: toMonto(row.split),
    monto_presupuesto_manual: toMonto(row.monto_presupuesto_manual),
    es_manual: row.es_manual === true,
    pagado: row.pagado === true,
    plata_en_cuenta: row.plata_en_cuenta === true,
    en_presupuesto: row.en_presupuesto !== false,
    conciliado: row.conciliado === true,
  }
}

function serializarCampoGasto(campo, valor) {
  if (valor === undefined) return null
  if (campo === 'tipos') return Array.isArray(valor) ? valor : []
  if (campo === 'presupuesto_manual') return valor || null
  if (campo === 'pagado' || campo === 'plata_en_cuenta' || campo === 'en_presupuesto') return valor ? true : false
  return valor
}

async function leerPresupuestoCiclo(ciclo) {
  const [cicloFila] = await sql`SELECT ciclo FROM presupuesto_ciclo WHERE ciclo = ${ciclo}`
  if (!cicloFila) return null

  const ingresoRows = await sql`SELECT fuente, monto FROM presupuesto_ingreso WHERE ciclo = ${ciclo}`
  const categoriaRows = await sql`SELECT grupo, subcategoria, previsto, fgp FROM presupuesto_categoria WHERE ciclo = ${ciclo} ORDER BY grupo, subcategoria`
  const fondoRows = await sql`SELECT nombre, previsto_aportar, acumulado, objetivo, fecha_meta, vinculado, emoji FROM presupuesto_fondo WHERE ciclo = ${ciclo}`

  const ingresos = {}
  for (const r of ingresoRows) ingresos[r.fuente] = toMonto(r.monto)

  const categorias = {}
  for (const r of categoriaRows) {
    if (!categorias[r.grupo]) categorias[r.grupo] = { subcategorias: {} }
    categorias[r.grupo].subcategorias[r.subcategoria] = {
      previsto: toMonto(r.previsto),
      fgp: r.fgp === true,
    }
  }

  const fondos = {}
  for (const r of fondoRows) {
    const vinculado = typeof r.vinculado === 'string'
      ? JSON.parse(r.vinculado)
      : (r.vinculado ?? null)
    fondos[r.nombre] = {
      previsto_aportar: toMonto(r.previsto_aportar),
      acumulado: toMonto(r.acumulado),
      objetivo: toMonto(r.objetivo),
      ...(r.emoji && { emoji: r.emoji }),
      ...(r.fecha_meta && { fecha_meta: r.fecha_meta }),
      ...(vinculado && { vinculado }),
    }
  }

  return { ingresos, categorias, fondos }
}

async function sincronizarGastosVinculado(tx, vinculadoAnterior, vinculadoNuevo) {
  if (!vinculadoAnterior || !vinculadoNuevo) return 0
  if (
    vinculadoAnterior.grupo === vinculadoNuevo.grupo &&
    vinculadoAnterior.subcategoria === vinculadoNuevo.subcategoria
  ) {
    return 0
  }

  const nuevoPm = { grupo: vinculadoNuevo.grupo, subcategoria: vinculadoNuevo.subcategoria }
  const filtroAnterior = {
    grupo: vinculadoAnterior.grupo,
    subcategoria: vinculadoAnterior.subcategoria,
  }

  const updated = await tx`
    UPDATE gastos
    SET presupuesto_manual = ${nuevoPm}, updated_at = NOW()
    WHERE presupuesto_manual @> ${JSON.stringify(filtroAnterior)}::jsonb
    RETURNING id
  `
  return updated.length
}

async function guardarPresupuestoCicloDB(ciclo, datos) {
  const fondoCambios = datos.fondo_cambios
  let gastosActualizados = 0

  await sql.begin(async (tx) => {
    await tx`INSERT INTO presupuesto_ciclo (ciclo) VALUES (${ciclo}) ON CONFLICT DO NOTHING`
    await tx`UPDATE presupuesto_ciclo SET updated_at = NOW() WHERE ciclo = ${ciclo}`

    if (datos.ingresos !== undefined) {
      await tx`DELETE FROM presupuesto_ingreso WHERE ciclo = ${ciclo}`
      for (const [fuente, monto] of Object.entries(datos.ingresos)) {
        await tx`INSERT INTO presupuesto_ingreso (ciclo, fuente, monto) VALUES (${ciclo}, ${fuente}, ${monto || 0})`
      }
    }

    if (datos.categorias !== undefined) {
      await tx`DELETE FROM presupuesto_categoria WHERE ciclo = ${ciclo}`
      for (const [grupo, gData] of Object.entries(datos.categorias)) {
        for (const [subcat, sData] of Object.entries(gData.subcategorias || {})) {
          await tx`INSERT INTO presupuesto_categoria (ciclo, grupo, subcategoria, previsto, fgp) VALUES (${ciclo}, ${grupo}, ${subcat}, ${sData.previsto || 0}, ${sData.fgp ? true : false})`
        }
      }
    }

    if (datos.fondos !== undefined) {
      await tx`DELETE FROM presupuesto_fondo WHERE ciclo = ${ciclo}`
      for (const [nombre, fData] of Object.entries(datos.fondos)) {
        await tx`
          INSERT INTO presupuesto_fondo (ciclo, nombre, previsto_aportar, acumulado, objetivo, fecha_meta, vinculado, emoji)
          VALUES (
            ${ciclo}, ${nombre},
            ${fData.previsto_aportar || 0}, ${fData.acumulado || 0},
            ${fData.objetivo || null}, ${fData.fecha_meta || null},
            ${fData.vinculado || null}, ${fData.emoji || null}
          )
        `
        if (fData.vinculado?.grupo && fData.vinculado?.subcategoria) {
          await tx`
            INSERT INTO presupuesto_categoria (ciclo, grupo, subcategoria, previsto, fgp)
            VALUES (${ciclo}, ${fData.vinculado.grupo}, ${fData.vinculado.subcategoria}, 0, false)
            ON CONFLICT DO NOTHING
          `
        }
      }
    }

    if (Array.isArray(fondoCambios)) {
      for (const cambio of fondoCambios) {
        if (cambio?.vinculadoAnterior && cambio?.vinculadoNuevo) {
          gastosActualizados += await sincronizarGastosVinculado(
            tx,
            cambio.vinculadoAnterior,
            cambio.vinculadoNuevo
          )
        }
      }
    }
  })

  return { gastos_actualizados: gastosActualizados }
}

async function mapearGastoConRegla(gasto) {
  if (gasto.presupuesto_manual) {
    const pm = typeof gasto.presupuesto_manual === 'string'
      ? JSON.parse(gasto.presupuesto_manual)
      : gasto.presupuesto_manual
    return { regla: null, resultado: pm, fuente: 'override_manual' }
  }

  const reglas = await sql`SELECT * FROM regla_mapeo WHERE activa = true ORDER BY prioridad, id`
  const contexto = gasto.contexto_override || gasto.contexto || ''
  const tipos = Array.isArray(gasto.tipos) ? gasto.tipos : (typeof gasto.tipos === 'string' ? JSON.parse(gasto.tipos || '[]') : [])

  for (const r of reglas) {
    const matchContexto = !r.contexto || r.contexto === contexto
    const matchTipo = !r.tipo || tipos.includes(r.tipo)
    const matchBanco = !r.banco || r.banco === gasto.banco
    const matchMotivo = !r.motivo_regex || new RegExp(r.motivo_regex, 'i').test(gasto.motivo || '')

    if (matchContexto && matchTipo && matchBanco && matchMotivo) {
      if (r.grupo_dest === '_NONE_') return { regla: r, resultado: null, fuente: 'regla_sin_mapeo' }
      return { regla: r, resultado: { grupo: r.grupo_dest, subcategoria: r.subcat_dest }, fuente: 'regla' }
    }
  }

  return { regla: null, resultado: null, fuente: 'sin_match' }
}

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[server] ${signal}, closing DB pool...`)
  try {
    await sql.end({ timeout: 5 })
  } catch (e) {
    console.error('[server] error closing DB pool:', e.message)
  }
  process.exit(0)
}

process.on('SIGTERM', () => { shutdown('SIGTERM') })
process.on('SIGINT', () => { shutdown('SIGINT') })

export default { port: PORT, fetch: app.fetch }
