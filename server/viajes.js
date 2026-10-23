// Viajes (DEC-024): etiqueta ortogonal a la categoría presupuestaria. Un gasto pertenece a 0 o
// 1 viaje (gastos.viaje_id). Asignar un viaje *sugiere* presupuesto_manual (ALE si va la
// polola, VIAJES si no — ver sugerirAsignacionViaje en src/utils/viajes.js) solo donde no había
// uno; quitarlo limpia ese presupuesto_manual solo si sigue siendo la sugerencia, nunca un
// override elegido a mano.

import { Hono } from 'hono'
import sql from './db/client.js'
import { toMonto } from './db/numeric.js'
import { deserializarGasto } from './gastos/serializacion.js'
import {
  ESTADOS_VIAJE,
  esSugerenciaDeViaje,
  resumirViaje,
  sugerenciaParaGasto,
} from '../src/utils/viajes.js'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export function serializarViaje(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    emoji: row.emoji || null,
    fecha_desde: row.fecha_desde,
    fecha_hasta: row.fecha_hasta,
    presupuesto: toMonto(row.presupuesto),
    estado: row.estado,
    nota: row.nota || null,
  }
}

// postgres.js expone .begin(); la db falsa de los tests no, y ahí basta con ejecutar en línea.
function enTransaccion(db, fn) {
  return typeof db.begin === 'function' ? db.begin(fn) : fn(db)
}

function validarViaje(datos, { parcial = false } = {}) {
  const v = {}
  if (!parcial || datos.nombre !== undefined) {
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : ''
    if (!nombre) return { error: 'Falta nombre', status: 400 }
    v.nombre = nombre
  }
  for (const campo of ['fecha_desde', 'fecha_hasta']) {
    if (!parcial || datos[campo] !== undefined) {
      if (!FECHA_RE.test(datos[campo] || '')) return { error: `${campo} inválida`, status: 400 }
      v[campo] = datos[campo]
    }
  }
  if (datos.estado !== undefined || !parcial) {
    const estado = datos.estado ?? 'planificado'
    if (!ESTADOS_VIAJE.includes(estado)) return { error: `estado debe ser uno de: ${ESTADOS_VIAJE.join(', ')}`, status: 400 }
    v.estado = estado
  }
  if (datos.presupuesto !== undefined) {
    if (datos.presupuesto === null || datos.presupuesto === '') v.presupuesto = null
    else {
      const n = Number(datos.presupuesto)
      if (!Number.isFinite(n) || n < 0) return { error: 'Presupuesto inválido', status: 400 }
      v.presupuesto = n
    }
  } else if (!parcial) v.presupuesto = null
  if (datos.emoji !== undefined || !parcial) v.emoji = datos.emoji || null
  if (datos.nota !== undefined || !parcial) v.nota = datos.nota || null
  return { valores: v }
}

export async function listarViajes(db = sql) {
  const viajes = (await db`SELECT * FROM viaje ORDER BY fecha_desde DESC, nombre`).map(serializarViaje)
  const gastos = (await db`SELECT * FROM gastos WHERE viaje_id IS NOT NULL`).map(deserializarGasto)
  return viajes.map(v => {
    const r = resumirViaje(v, gastos)
    return { ...v, total_gastos: r.total, n_gastos: r.gastos.length }
  })
}

// Para el agente y el MCP: el usuario nombra el viaje ("Perú"), no su id. Match exacto por id o
// nombre (sin mayúsculas); si no, el único cuyo nombre contenga el texto. Ambiguo → null.
export function buscarViajePorTexto(viajes, texto) {
  const buscado = (texto || '').trim().toLowerCase()
  if (!buscado) return null
  const exacto = viajes.find(v => v.id === texto || v.nombre.toLowerCase() === buscado)
  if (exacto) return exacto
  const parciales = viajes.filter(v => v.nombre.toLowerCase().includes(buscado))
  return parciales.length === 1 ? parciales[0] : null
}

export async function obtenerViaje(id, db = sql) {
  const [row] = await db`SELECT * FROM viaje WHERE id = ${id}`
  return row ? serializarViaje(row) : null
}

export async function crearViaje(datos = {}, db = sql) {
  const { valores, error, status } = validarViaje(datos)
  if (error) return { error, status }
  if (valores.fecha_hasta < valores.fecha_desde) return { error: 'fecha_hasta debe ser >= fecha_desde', status: 400 }

  const [row] = await db`
    INSERT INTO viaje (id, nombre, emoji, fecha_desde, fecha_hasta, presupuesto, estado, nota)
    VALUES (${crypto.randomUUID()}, ${valores.nombre}, ${valores.emoji}, ${valores.fecha_desde},
      ${valores.fecha_hasta}, ${valores.presupuesto}, ${valores.estado}, ${valores.nota})
    RETURNING *
  `
  return { viaje: serializarViaje(row) }
}

export async function editarViaje(id, datos = {}, db = sql) {
  const actual = await obtenerViaje(id, db)
  if (!actual) return { error: 'Viaje no encontrado', status: 404 }
  const { valores, error, status } = validarViaje(datos, { parcial: true })
  if (error) return { error, status }
  const v = { ...actual, ...valores }
  if (v.fecha_hasta < v.fecha_desde) return { error: 'fecha_hasta debe ser >= fecha_desde', status: 400 }

  const [row] = await db`
    UPDATE viaje SET nombre = ${v.nombre}, emoji = ${v.emoji}, fecha_desde = ${v.fecha_desde},
      fecha_hasta = ${v.fecha_hasta}, presupuesto = ${v.presupuesto}, estado = ${v.estado},
      nota = ${v.nota}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return { viaje: serializarViaje(row) }
}

// Borra el viaje y libera sus gastos (viaje_id = NULL). El presupuesto_manual sugerido queda:
// el gasto sigue siendo un gasto de viaje en su categoría, solo pierde la etiqueta.
export async function eliminarViaje(id, db = sql) {
  return enTransaccion(db, async (tx) => {
    const borrados = await tx`DELETE FROM viaje WHERE id = ${id} RETURNING id`
    if (borrados.length === 0) return { error: 'Viaje no encontrado', status: 404 }
    const liberados = await tx`UPDATE gastos SET viaje_id = NULL, updated_at = NOW() WHERE viaje_id = ${id} RETURNING id`
    return { ok: true, gastos_liberados: liberados.length }
  })
}

function idsValidos(gastoIds) {
  return Array.isArray(gastoIds) ? [...new Set(gastoIds.filter(x => typeof x === 'string' && x))] : []
}

// Asigna gastos a un viaje. Donde el gasto no tenía presupuesto_manual escribe la sugerencia
// (ALE/VIAJES); un override existente nunca se pisa. Acepta id o sync_key, como PATCH /api/gastos.
export async function asignarGastosAViaje(viajeId, gastoIds, db = sql) {
  const ids = idsValidos(gastoIds)
  if (ids.length === 0) return { error: 'Faltan gasto_ids', status: 400 }
  const viaje = await obtenerViaje(viajeId, db)
  if (!viaje) return { error: 'Viaje no encontrado', status: 404 }

  return enTransaccion(db, async (tx) => {
    const rows = await tx`SELECT * FROM gastos WHERE id = ANY(${ids}) OR sync_key = ANY(${ids})`
    const actualizados = []
    for (const row of rows) {
      const gasto = deserializarGasto(row)
      const presupuesto = gasto.presupuesto_manual?.grupo ? gasto.presupuesto_manual : sugerenciaParaGasto(gasto)
      const [r] = await tx`
        UPDATE gastos SET viaje_id = ${viajeId}, presupuesto_manual = ${presupuesto}, updated_at = NOW()
        WHERE id = ${gasto.id}
        RETURNING *
      `
      actualizados.push(deserializarGasto(r))
    }
    return { gastos: actualizados }
  })
}

export async function desasignarGastos(gastoIds, db = sql) {
  const ids = idsValidos(gastoIds)
  if (ids.length === 0) return { error: 'Faltan gasto_ids', status: 400 }

  return enTransaccion(db, async (tx) => {
    const rows = await tx`SELECT * FROM gastos WHERE id = ANY(${ids}) OR sync_key = ANY(${ids})`
    const actualizados = []
    for (const row of rows) {
      const gasto = deserializarGasto(row)
      if (!gasto.viaje_id) continue
      const presupuesto = esSugerenciaDeViaje(gasto) ? null : gasto.presupuesto_manual
      const [r] = await tx`
        UPDATE gastos SET viaje_id = NULL, presupuesto_manual = ${presupuesto}, updated_at = NOW()
        WHERE id = ${gasto.id}
        RETURNING *
      `
      actualizados.push(deserializarGasto(r))
    }
    return { gastos: actualizados }
  })
}

export function createViajeRouter({ db = sql } = {}) {
  const router = new Hono()

  const responder = (c, resultado, clave, okStatus = 200) => {
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(clave ? resultado[clave] : resultado, okStatus)
  }

  router.get('/', async (c) => c.json(await listarViajes(db)))

  router.post('/', async (c) => responder(c, await crearViaje(await c.req.json(), db), 'viaje', 201))

  // Antes de /:id para que "desasignar" no se lea como id.
  router.post('/desasignar', async (c) => {
    const body = await c.req.json()
    return responder(c, await desasignarGastos(body?.gasto_ids, db), null)
  })

  router.patch('/:id', async (c) => responder(c, await editarViaje(c.req.param('id'), await c.req.json(), db), 'viaje'))

  router.delete('/:id', async (c) => responder(c, await eliminarViaje(c.req.param('id'), db), null))

  router.post('/:id/asignar', async (c) => {
    const body = await c.req.json()
    return responder(c, await asignarGastosAViaje(c.req.param('id'), body?.gasto_ids, db), null)
  })

  return router
}

export const viajeRouter = createViajeRouter()
