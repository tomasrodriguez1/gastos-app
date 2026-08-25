// Reservas de ahorro externas (F6, ej. Mercado Pago). El saldo esperado se
// calcula desde los gastos ya existentes en la categoría vinculada — nunca se
// escribe a `gastos` ni a `presupuesto_*` desde acá, solo se lee. Ver
// docs/context/data_model_context.md.

import { Hono } from 'hono'
import sql from './db/client.js'
import { toMonto } from './db/numeric.js'
import { resolverCategoria } from './tarjeta.js'
import { esGastoUsdPuro } from '../src/utils/calculos.js'

function vinculadoDe(row) {
  return typeof row.vinculado === 'string' ? JSON.parse(row.vinculado) : row.vinculado
}

function diasEntre(fechaA, fechaB) {
  const ms = new Date(`${fechaB}T00:00:00Z`) - new Date(`${fechaA}T00:00:00Z`)
  return ms / 86400000
}

// Interés simple prorrateado por día sobre el saldo anterior. Aproximación
// deliberada: con tasa_anual ~3% el error de no prorratear por sub-intervalo
// entre retiros es de unos pocos pesos, muy por debajo de la tolerancia de
// "no calza" — no vale la complejidad de un cálculo por sub-intervalo.
export function excedeTolerancia(diferencia, esperado) {
  if (esperado == null || diferencia == null) return false
  return Math.abs(diferencia) > Math.max(1000, Math.abs(esperado) * 0.02)
}

/**
 * Calcula el saldo esperado de una reserva a una fecha dada, a partir del
 * snapshot anterior más los retiros implícitos (gastos confirmados en la
 * categoría vinculada) y el crecimiento estimado por tasa_anual.
 * Devuelve null si la reserva no existe; { monto: null, ... } si es la
 * primera lectura (sin línea base para calcular diferencia).
 */
export async function calcularSaldoEsperado(reservaId, fechaNueva, db = sql) {
  const [reserva] = await db`SELECT * FROM reserva WHERE id = ${reservaId}`
  if (!reserva) return null

  const [anterior] = await db`
    SELECT fecha, monto_leido FROM reserva_saldo
    WHERE reserva_id = ${reservaId} AND fecha < ${fechaNueva}
    ORDER BY fecha DESC LIMIT 1
  `
  if (!anterior) return { monto: null, retiros: 0, usdExcluido: 0 }

  const vinculado = vinculadoDe(reserva)
  const reglas = await db`SELECT * FROM regla_mapeo WHERE activa = TRUE ORDER BY prioridad, id`
  const rows = await db`
    SELECT * FROM gastos
    WHERE estado = 'confirmado' AND fecha > ${anterior.fecha} AND fecha <= ${fechaNueva}
  `

  let retiros = 0
  let usdExcluido = 0
  for (const row of rows) {
    if (esGastoUsdPuro(row)) { usdExcluido += toMonto(row.usd) || 0; continue }
    const categoria = resolverCategoria(row, reglas)
    if (categoria.grupo !== vinculado.grupo) continue
    if (vinculado.subcategoria && categoria.subcategoria !== vinculado.subcategoria) continue
    retiros += toMonto(row.monto) || 0
  }

  const montoAnterior = toMonto(anterior.monto_leido) || 0
  const dias = diasEntre(anterior.fecha, fechaNueva)
  const tasa = reserva.tasa_anual != null ? toMonto(reserva.tasa_anual) : 0
  const crecimiento = montoAnterior * tasa * (dias / 365)

  return { monto: montoAnterior - retiros + crecimiento, retiros, usdExcluido, fechaAnterior: anterior.fecha }
}

/**
 * Registra (o corrige, vía upsert por fecha) el saldo leído de una reserva.
 * Devuelve { error } si la reserva no existe.
 */
export async function registrarSaldo({ reservaId, monto, fecha }, db = sql) {
  const esperado = await calcularSaldoEsperado(reservaId, fecha, db)
  if (esperado === null) return { error: 'Reserva no encontrada' }
  const diferencia = esperado.monto == null ? null : monto - esperado.monto

  await db`
    INSERT INTO reserva_saldo (reserva_id, fecha, monto_leido, monto_esperado, diferencia, origen)
    VALUES (${reservaId}, ${fecha}, ${monto}, ${esperado.monto}, ${diferencia}, 'foto_agente')
    ON CONFLICT (reserva_id, fecha) DO UPDATE SET
      monto_leido = EXCLUDED.monto_leido,
      monto_esperado = EXCLUDED.monto_esperado,
      diferencia = EXCLUDED.diferencia,
      updated_at = NOW()
  `
  return {
    montoEsperado: esperado.monto,
    diferencia,
    usdExcluido: esperado.usdExcluido,
    noCalza: excedeTolerancia(diferencia, esperado.monto),
  }
}

export async function cargarReservasActivas(db = sql) {
  const rows = await db`SELECT id, nombre, emoji, vinculado FROM reserva WHERE activa = TRUE ORDER BY nombre`
  return rows.map(r => ({
    id: r.id,
    nombre: r.nombre,
    emoji: r.emoji,
    vinculado: vinculadoDe(r),
  }))
}

export function createReservaRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/', async (c) => {
    const rows = await db`SELECT * FROM reserva ORDER BY activa DESC, nombre`
    return c.json(rows)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const { nombre, emoji, vinculado, tasa_anual } = body || {}
    if (!nombre || !vinculado?.grupo) return c.json({ error: 'Falta nombre o vinculado.grupo' }, 400)

    // Guard por defecto contra doble conteo entre reservas — no evita que dos
    // reservas cuenten la misma categoría si se crean directo por SQL.
    if (!body.permitir_solape) {
      const solapadas = await db`
        SELECT nombre FROM reserva
        WHERE activa = TRUE
          AND vinculado->>'grupo' = ${vinculado.grupo}
          AND (vinculado->>'subcategoria' IS NOT DISTINCT FROM ${vinculado.subcategoria ?? null})
      `
      if (solapadas.length) {
        return c.json({ error: `Ya existe una reserva activa vinculada a esa categoría: ${solapadas[0].nombre}` }, 409)
      }
    }

    const [row] = await db`
      INSERT INTO reserva (nombre, emoji, vinculado, tasa_anual)
      VALUES (${nombre}, ${emoji || '💰'}, ${vinculado}, ${tasa_anual ?? 0.03})
      RETURNING *
    `
    return c.json(row, 201)
  })

  router.patch('/:id', async (c) => {
    const { nombre, emoji, tasa_anual, activa } = await c.req.json()
    const [row] = await db`
      UPDATE reserva SET
        nombre = COALESCE(${nombre}, nombre),
        emoji = COALESCE(${emoji}, emoji),
        tasa_anual = COALESCE(${tasa_anual}, tasa_anual),
        activa = COALESCE(${activa}, activa),
        updated_at = NOW()
      WHERE id = ${c.req.param('id')}
      RETURNING *
    `
    if (!row) return c.json({ error: 'No encontrada' }, 404)
    return c.json(row)
  })

  router.get('/:id/saldos', async (c) => {
    const rows = await db`SELECT * FROM reserva_saldo WHERE reserva_id = ${c.req.param('id')} ORDER BY fecha DESC`
    return c.json(rows)
  })

  return router
}

export const reservaRouter = createReservaRouter()
