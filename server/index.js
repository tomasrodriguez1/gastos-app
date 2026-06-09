import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import sql from './db/client.js'
import { initSchema } from './db/init.js'
import { toMonto } from './db/numeric.js'
import { detectarDuplicadosMes } from './duplicados.js'

const app = new Hono()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:6001'

if (process.env.RUN_SCHEMA_INIT === 'true' || process.env.NODE_ENV !== 'production') {
  await initSchema()
}

app.use('*', cors({ origin: CORS_ORIGIN }))

// ─── GASTOS ──────────────────────────────────────────────────────────────────

app.get('/api/gastos/sync-keys', async (c) => {
  const rows = await sql`SELECT sync_key FROM gastos WHERE sync_key IS NOT NULL`
  return c.json({ sync_keys: rows.map(r => r.sync_key) })
})

app.get('/api/gastos', async (c) => {
  const mes = c.req.query('mes')
  const rows = mes
    ? await sql`SELECT * FROM gastos WHERE mes = ${mes} ORDER BY fecha DESC`
    : await sql`SELECT * FROM gastos ORDER BY fecha DESC`
  return c.json(rows.map(deserializarGasto))
})

app.patch('/api/gastos/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const changes = await c.req.json()

  const allowed = [
    'fecha', 'mes', 'motivo', 'banco', 'tipos', 'contexto', 'monto', 'monto_real',
    'usd', 'monto_clp_manual', 'split', 'pagado',
    'presupuesto_manual', 'contexto_override', 'monto_presupuesto_manual',
  ]

  const fields = Object.keys(changes).filter(k => allowed.includes(k))
  if (fields.length === 0) return c.json({ error: 'No hay campos válidos' }, 400)

  const updates = {}
  for (const f of fields) updates[f] = serializarCampoGasto(f, changes[f])

  const rows = await sql`
    UPDATE gastos
    SET ${sql(updates)}, updated_at = NOW()
    WHERE id = ${id} OR sync_key = ${id}
    RETURNING *
  `

  if (rows.length === 0) return c.json({ error: 'Gasto no encontrado' }, 404)
  return c.json({ ok: true, gasto: deserializarGasto(rows[0]) })
})

app.get('/api/gastos/duplicados', async (c) => {
  const mes = c.req.query('mes')
  if (!mes) return c.json({ error: 'Falta parámetro mes' }, 400)
  const { grupos, resumen } = await detectarDuplicadosMes(sql, mes, deserializarGasto)
  return c.json({ mes, resumen, grupos })
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
        const syncKey = `${g.fecha}|${g.motivo.trim().toLowerCase()}`
        await tx`
          INSERT INTO gastos (id, sync_key, fecha, mes, motivo, banco, tipos, contexto,
            monto, monto_real, usd, monto_clp_manual, split, presupuesto_manual,
            contexto_override, monto_presupuesto_manual, pagado, es_manual, updated_at)
          VALUES (
            ${crypto.randomUUID()}, ${syncKey},
            ${g.fecha}, ${g.mes || g.fecha.substring(0, 7)}, ${g.motivo},
            ${g.banco || ''}, ${g.tipos || []}, ${g.contexto || ''},
            ${g.monto || 0}, ${g.monto_real || 0}, ${g.usd || 0},
            ${g.monto_clp_manual ?? null}, ${g.split || 0},
            ${g.presupuesto_manual ?? null},
            ${g.contexto_override ?? null}, ${g.monto_presupuesto_manual ?? null},
            ${g.pagado ? true : false}, false, NOW()
          )
          ON CONFLICT(sync_key) DO UPDATE SET
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
        const id = g.id || crypto.randomUUID()
        await tx`
          INSERT INTO gastos (id, sync_key, fecha, mes, motivo, banco, tipos, contexto,
            monto, monto_real, usd, monto_clp_manual, split, presupuesto_manual,
            contexto_override, monto_presupuesto_manual, pagado, es_manual, updated_at)
          VALUES (
            ${id}, NULL,
            ${g.fecha}, ${g.mes || g.fecha.substring(0, 7)}, ${g.motivo || ''},
            ${g.banco || ''}, ${g.tipos || []}, ${g.contexto || ''},
            ${g.monto || 0}, ${g.monto_real || 0}, ${g.usd || 0},
            ${g.monto_clp_manual ?? null}, ${g.split || 0},
            ${g.presupuesto_manual ?? null},
            ${g.contexto_override ?? null}, ${g.monto_presupuesto_manual ?? null},
            ${g.pagado ? true : false}, true, NOW()
          )
          ON CONFLICT(id) DO UPDATE SET
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

app.get('/api/presupuesto/meses', async (c) => {
  const rows = await sql`SELECT mes FROM presupuesto_mes ORDER BY mes DESC`
  return c.json(rows.map(r => r.mes))
})

app.get('/api/presupuesto/:mes', async (c) => {
  const mes = c.req.param('mes')
  return c.json(await leerPresupuestoMes(mes))
})

app.put('/api/presupuesto/:mes', async (c) => {
  const mes = c.req.param('mes')
  const datos = await c.req.json()
  try {
    const { gastos_actualizados } = await guardarPresupuestoMesDB(mes, datos)
    return c.json({ ok: true, gastos_actualizados })
  } catch (e) {
    console.error('[presupuesto PUT]', e.message)
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/presupuesto/:mes/copiar-anterior', async (c) => {
  const mes = c.req.param('mes')
  const [yr, mo] = mes.split('-').map(Number)
  let prevMo = mo - 1, prevYr = yr
  if (prevMo <= 0) { prevMo = 12; prevYr-- }
  const mesPrev = `${prevYr}-${String(prevMo).padStart(2, '0')}`

  const prevData = await leerPresupuestoMes(mesPrev)
  if (!prevData) return c.json({ error: 'No hay presupuesto en el mes anterior' }, 404)

  await guardarPresupuestoMesDB(mes, prevData)
  return c.json({ ok: true })
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
  }
}

function serializarCampoGasto(campo, valor) {
  if (valor === undefined) return null
  if (campo === 'tipos') return Array.isArray(valor) ? valor : []
  if (campo === 'presupuesto_manual') return valor || null
  if (campo === 'pagado') return valor ? true : false
  return valor
}

async function leerPresupuestoMes(mes) {
  const [mesFila] = await sql`SELECT mes FROM presupuesto_mes WHERE mes = ${mes}`
  if (!mesFila) return null

  const ingresoRows = await sql`SELECT fuente, monto FROM presupuesto_ingreso WHERE mes = ${mes}`
  const categoriaRows = await sql`SELECT grupo, subcategoria, previsto, fgp FROM presupuesto_categoria WHERE mes = ${mes} ORDER BY grupo, subcategoria`
  const fondoRows = await sql`SELECT nombre, previsto_aportar, acumulado, objetivo, fecha_meta, vinculado, emoji FROM presupuesto_fondo WHERE mes = ${mes}`

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
    fondos[r.nombre] = {
      previsto_aportar: toMonto(r.previsto_aportar),
      acumulado: toMonto(r.acumulado),
      objetivo: toMonto(r.objetivo),
      ...(r.emoji && { emoji: r.emoji }),
      ...(r.fecha_meta && { fecha_meta: r.fecha_meta }),
      ...(r.vinculado && { vinculado: r.vinculado }),  // ya es objeto JS (JSONB)
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

async function guardarPresupuestoMesDB(mes, datos) {
  const fondoCambios = datos.fondo_cambios
  let gastosActualizados = 0

  await sql.begin(async (tx) => {
    await tx`INSERT INTO presupuesto_mes (mes) VALUES (${mes}) ON CONFLICT DO NOTHING`
    await tx`UPDATE presupuesto_mes SET updated_at = NOW() WHERE mes = ${mes}`

    if (datos.ingresos !== undefined) {
      await tx`DELETE FROM presupuesto_ingreso WHERE mes = ${mes}`
      for (const [fuente, monto] of Object.entries(datos.ingresos)) {
        await tx`INSERT INTO presupuesto_ingreso (mes, fuente, monto) VALUES (${mes}, ${fuente}, ${monto || 0})`
      }
    }

    if (datos.categorias !== undefined) {
      await tx`DELETE FROM presupuesto_categoria WHERE mes = ${mes}`
      for (const [grupo, gData] of Object.entries(datos.categorias)) {
        for (const [subcat, sData] of Object.entries(gData.subcategorias || {})) {
          await tx`INSERT INTO presupuesto_categoria (mes, grupo, subcategoria, previsto, fgp) VALUES (${mes}, ${grupo}, ${subcat}, ${sData.previsto || 0}, ${sData.fgp ? true : false})`
        }
      }
    }

    if (datos.fondos !== undefined) {
      await tx`DELETE FROM presupuesto_fondo WHERE mes = ${mes}`
      for (const [nombre, fData] of Object.entries(datos.fondos)) {
        await tx`
          INSERT INTO presupuesto_fondo (mes, nombre, previsto_aportar, acumulado, objetivo, fecha_meta, vinculado, emoji)
          VALUES (
            ${mes}, ${nombre},
            ${fData.previsto_aportar || 0}, ${fData.acumulado || 0},
            ${fData.objetivo || null}, ${fData.fecha_meta || null},
            ${fData.vinculado || null}, ${fData.emoji || null}
          )
        `
        if (fData.vinculado?.grupo && fData.vinculado?.subcategoria) {
          await tx`
            INSERT INTO presupuesto_categoria (mes, grupo, subcategoria, previsto, fgp)
            VALUES (${mes}, ${fData.vinculado.grupo}, ${fData.vinculado.subcategoria}, 0, false)
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
