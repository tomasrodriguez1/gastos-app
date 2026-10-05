// Log de movimientos de un fondo de ahorro del presupuesto (presupuesto_fondo) sin vincular:
// aporte (+) o ajuste (±). Para un fondo manual, el saldo se deriva de SUM(monto) acá — ver
// calcularSaldoFondoManual en src/utils/calculos.js — reemplazando el campo suelto
// presupuesto_fondo.acumulado, que queda vestigial. Nunca hay tipo 'pago' en esta tabla: un
// pago/uso de cualquier fondo de ahorro (vinculado o manual) sigue siendo un gasto con
// financiado_por = nombre, para no duplicar la contabilidad del gasto (misma regla que ya rige
// fondo_tarjeta_movimiento/reserva_tarjeta). Para un fondo vinculado, el "aporte" tampoco vive
// acá — son los gastos de su categoría, ver listarAportesFondoVinculado en src/utils/calculos.js.

import { Hono } from 'hono'
import sql from './db/client.js'
import { toMonto } from './db/numeric.js'

const TIPOS_VALIDOS = ['aporte', 'ajuste']

export function serializarMovimientoFondo(row) {
  return {
    id: row.id,
    fondo_nombre: row.fondo_nombre,
    fecha: row.fecha,
    tipo: row.tipo,
    monto: toMonto(row.monto),
    nota: row.nota || null,
  }
}

// Todos los movimientos, de todos los fondos manuales — para que el Dashboard/`/fondos` pueda
// calcular el saldo de cada fondo (SUM por nombre) con un solo fetch en vez de uno por tarjeta.
export async function listarTodosLosMovimientos(db = sql) {
  const rows = await db`SELECT * FROM fondo_ahorro_movimiento ORDER BY fecha DESC, id DESC`
  return rows.map(serializarMovimientoFondo)
}

export async function listarAportesFondo(fondoNombre, { limite = 20 } = {}, db = sql) {
  const rows = await db`
    SELECT * FROM fondo_ahorro_movimiento
    WHERE fondo_nombre = ${fondoNombre}
    ORDER BY fecha DESC, id DESC
    LIMIT ${limite}
  `
  return rows.map(serializarMovimientoFondo)
}

export async function registrarMovimientoFondo({ fondoNombre, fecha, monto, tipo = 'aporte', nota } = {}, db = sql) {
  const nombre = typeof fondoNombre === 'string' ? fondoNombre.trim() : ''
  if (!nombre) return { error: 'Falta fondoNombre', status: 400 }
  if (!TIPOS_VALIDOS.includes(tipo)) return { error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`, status: 400 }
  const montoNum = Number(monto)
  if (!Number.isFinite(montoNum) || montoNum === 0) return { error: 'Monto inválido', status: 400 }
  if (tipo === 'aporte' && montoNum <= 0) return { error: 'Un aporte debe ser un monto positivo', status: 400 }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return { error: 'Fecha inválida', status: 400 }

  const [row] = await db`
    INSERT INTO fondo_ahorro_movimiento (fondo_nombre, fecha, tipo, monto, nota)
    VALUES (${nombre}, ${fecha}, ${tipo}, ${montoNum}, ${nota || null})
    RETURNING *
  `
  return { movimiento: serializarMovimientoFondo(row) }
}

export function createFondoAhorroRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/movimientos', async (c) => {
    return c.json(await listarTodosLosMovimientos(db))
  })

  router.get('/:nombre/movimientos', async (c) => {
    return c.json(await listarAportesFondo(decodeURIComponent(c.req.param('nombre')), {}, db))
  })

  router.post('/:nombre/movimientos', async (c) => {
    const body = await c.req.json()
    const resultado = await registrarMovimientoFondo({
      fondoNombre: decodeURIComponent(c.req.param('nombre')),
      fecha: body?.fecha,
      monto: body?.monto,
      tipo: body?.tipo,
      nota: body?.nota,
    }, db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado.movimiento, 201)
  })

  return router
}

export const fondoAhorroRouter = createFondoAhorroRouter()
