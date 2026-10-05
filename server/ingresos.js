// Ingresos reales (fecha, fuente, monto), registrados a mano en /fondos o por
// el agente conversacional. Separado de presupuesto_ingreso (previsión por
// ciclo, se reemplaza entero en cada PUT) por el mismo criterio que reserva
// vs presupuesto_fondo: uno es un registro histórico de hechos, el otro un
// plan que se reescribe. Ver docs/context/data_model_context.md.

import { Hono } from 'hono'
import sql from './db/client.js'
import { toMonto } from './db/numeric.js'
import { obtenerCicloFinanciero } from '../src/utils/ciclos.js'

export function serializarIngreso(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    ciclo_financiero: row.ciclo_financiero,
    fuente: row.fuente,
    monto: toMonto(row.monto),
    nota: row.nota || null,
    origen: row.origen,
  }
}

export async function listarIngresos({ ciclo } = {}, db = sql) {
  const rows = ciclo
    ? await db`SELECT * FROM ingreso WHERE ciclo_financiero = ${ciclo} ORDER BY fecha DESC, id DESC`
    : await db`SELECT * FROM ingreso ORDER BY fecha DESC, id DESC`
  return rows.map(serializarIngreso)
}

export async function crearIngreso({ fecha, fuente, monto, nota, origen = 'manual' } = {}, db = sql) {
  const fuenteLimpia = typeof fuente === 'string' ? fuente.trim() : ''
  if (!fuenteLimpia) return { error: 'Falta fuente', status: 400 }
  const montoNum = Number(monto)
  if (!Number.isFinite(montoNum) || montoNum <= 0) return { error: 'Monto inválido', status: 400 }

  let cicloFinanciero
  try {
    cicloFinanciero = obtenerCicloFinanciero(fecha)
  } catch {
    return { error: 'Fecha inválida', status: 400 }
  }

  const [row] = await db`
    INSERT INTO ingreso (fecha, ciclo_financiero, fuente, monto, nota, origen)
    VALUES (${fecha}, ${cicloFinanciero}, ${fuenteLimpia}, ${montoNum}, ${nota || null}, ${origen})
    RETURNING *
  `
  return { ingreso: serializarIngreso(row) }
}

export async function editarIngreso(id, cambios = {}, db = sql) {
  const ingresoId = Number(id)
  const [actual] = await db`SELECT * FROM ingreso WHERE id = ${ingresoId}`
  if (!actual) return { error: 'No encontrado', status: 404 }

  const fecha = cambios.fecha !== undefined ? cambios.fecha : actual.fecha
  const fuente = cambios.fuente !== undefined ? (typeof cambios.fuente === 'string' ? cambios.fuente.trim() : actual.fuente) : actual.fuente
  if (!fuente) return { error: 'La fuente no puede quedar vacía', status: 400 }
  const monto = cambios.monto !== undefined ? Number(cambios.monto) : toMonto(actual.monto)
  if (!Number.isFinite(monto) || monto <= 0) return { error: 'Monto inválido', status: 400 }
  const nota = cambios.nota !== undefined ? cambios.nota : actual.nota

  let cicloFinanciero = actual.ciclo_financiero
  if (cambios.fecha !== undefined) {
    try {
      cicloFinanciero = obtenerCicloFinanciero(fecha)
    } catch {
      return { error: 'Fecha inválida', status: 400 }
    }
  }

  const [row] = await db`
    UPDATE ingreso SET
      fecha = ${fecha},
      ciclo_financiero = ${cicloFinanciero},
      fuente = ${fuente},
      monto = ${monto},
      nota = ${nota || null},
      updated_at = NOW()
    WHERE id = ${ingresoId}
    RETURNING *
  `
  return { ingreso: serializarIngreso(row) }
}

export async function eliminarIngreso(id, db = sql) {
  const ingresoId = Number(id)
  const rows = await db`DELETE FROM ingreso WHERE id = ${ingresoId} RETURNING id`
  if (!rows.length) return { error: 'No encontrado', status: 404 }
  return { ok: true }
}

export function createIngresoRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/', async (c) => {
    const ciclo = c.req.query('ciclo') || undefined
    return c.json(await listarIngresos({ ciclo }, db))
  })

  router.post('/', async (c) => {
    const resultado = await crearIngreso(await c.req.json(), db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado.ingreso, 201)
  })

  router.patch('/:id', async (c) => {
    const resultado = await editarIngreso(c.req.param('id'), await c.req.json(), db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado.ingreso)
  })

  router.delete('/:id', async (c) => {
    const resultado = await eliminarIngreso(c.req.param('id'), db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json({ ok: true })
  })

  return router
}

export const ingresoRouter = createIngresoRouter()
