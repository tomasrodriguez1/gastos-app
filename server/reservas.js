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

export function serializarReserva(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    emoji: row.emoji,
    vinculado: vinculadoDe(row),
    tasa_anual: toMonto(row.tasa_anual) ?? 0,
    activa: row.activa === true,
  }
}

export function validarVinculadoContraCatalogo(vinculado, catalogos) {
  const grupos = catalogos?.grupos || []
  const grupoNombre = vinculado?.grupo
  if (!grupoNombre) return { error: 'Falta vinculado.grupo' }
  const grupo = grupos.find(g => g.nombre.toLowerCase() === String(grupoNombre).toLowerCase())
  if (!grupo) {
    return { error: `El grupo "${grupoNombre}" no existe en el catálogo.` }
  }
  if (!vinculado.subcategoria) return { vinculado: { grupo: grupo.nombre } }
  const sub = (grupo.subcategorias || []).find(s =>
    s.nombre.toLowerCase() === String(vinculado.subcategoria).toLowerCase()
  )
  if (!sub) {
    return { error: `La subcategoría "${vinculado.subcategoria}" no existe en ${grupo.nombre}.` }
  }
  return { vinculado: { grupo: grupo.nombre, subcategoria: sub.nombre } }
}

export async function obtenerReserva(id, db = sql) {
  const [row] = await db`SELECT * FROM reserva WHERE id = ${Number(id)}`
  return row ? serializarReserva(row) : null
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

export async function listarReservas({ soloActivas = false } = {}, db = sql) {
  const rows = soloActivas
    ? await db`SELECT * FROM reserva WHERE activa = TRUE ORDER BY nombre`
    : await db`SELECT * FROM reserva ORDER BY activa DESC, nombre`
  return rows.map(serializarReserva)
}

export async function crearReserva({
  nombre,
  emoji,
  vinculado,
  tasa_anual,
  permitir_solape = false,
} = {}, db = sql) {
  const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : ''
  if (!nombreLimpio || !vinculado?.grupo) {
    return { error: 'Falta nombre o vinculado.grupo', status: 400 }
  }

  const [existente] = await db`SELECT * FROM reserva WHERE nombre = ${nombreLimpio}`
  if (existente) {
    if (existente.activa === false) {
      return {
        error: `Ya existe una reserva inactiva llamada "${existente.nombre}". Reactivala con editar_reserva (activa=true) en vez de crear otra.`,
        status: 409,
        reservaId: existente.id,
        sugerencia: 'reactivar',
      }
    }
    return {
      error: `Ya existe una reserva llamada "${existente.nombre}".`,
      status: 409,
      reservaId: existente.id,
    }
  }

  // Guard por defecto contra doble conteo entre reservas — no evita que dos
  // reservas cuenten la misma categoría si se crean directo por SQL.
  if (!permitir_solape) {
    const solapadas = await db`
      SELECT nombre FROM reserva
      WHERE activa = TRUE
        AND vinculado->>'grupo' = ${vinculado.grupo}
        AND (vinculado->>'subcategoria' IS NOT DISTINCT FROM ${vinculado.subcategoria ?? null})
    `
    if (solapadas.length) {
      return {
        error: `Ya existe una reserva activa vinculada a esa categoría: ${solapadas[0].nombre}`,
        status: 409,
      }
    }
  }

  try {
    const [row] = await db`
      INSERT INTO reserva (nombre, emoji, vinculado, tasa_anual)
      VALUES (${nombreLimpio}, ${emoji || '💰'}, ${vinculado}, ${tasa_anual ?? 0.03})
      RETURNING *
    `
    return { reserva: serializarReserva(row) }
  } catch (error) {
    if (error.code === '23505') {
      return { error: 'Ya existe una reserva con ese nombre', status: 409 }
    }
    throw error
  }
}

export async function editarReserva(id, cambios = {}, db = sql) {
  const reservaId = Number(id)
  const [actual] = await db`SELECT * FROM reserva WHERE id = ${reservaId}`
  if (!actual) return { error: 'No encontrada', status: 404 }

  const nombre = cambios.nombre !== undefined
    ? (typeof cambios.nombre === 'string' ? cambios.nombre.trim() : actual.nombre)
    : actual.nombre
  if (!nombre) return { error: 'El nombre no puede quedar vacío', status: 400 }

  if (nombre !== actual.nombre) {
    const [otro] = await db`SELECT id FROM reserva WHERE nombre = ${nombre} AND id != ${reservaId}`
    if (otro) return { error: `Ya existe una reserva llamada "${nombre}".`, status: 409 }
  }

  const emoji = cambios.emoji !== undefined ? cambios.emoji : actual.emoji
  const tasaAnual = cambios.tasa_anual !== undefined ? cambios.tasa_anual : actual.tasa_anual
  const activa = cambios.activa !== undefined ? cambios.activa : actual.activa

  const [row] = await db`
    UPDATE reserva SET
      nombre = ${nombre},
      emoji = ${emoji},
      tasa_anual = ${tasaAnual},
      activa = ${activa},
      updated_at = NOW()
    WHERE id = ${reservaId}
    RETURNING *
  `
  return { reserva: serializarReserva(row) }
}

export async function listarSaldosReserva(reservaId, { limite = 20 } = {}, db = sql) {
  const id = Number(reservaId)
  const reserva = await obtenerReserva(id, db)
  if (!reserva) return { error: 'Reserva no encontrada', status: 404 }

  const rows = await db`
    SELECT * FROM reserva_saldo
    WHERE reserva_id = ${id}
    ORDER BY fecha DESC
    LIMIT ${limite}
  `
  return {
    reserva,
    saldos: rows.map(s => {
      const montoEsperado = s.monto_esperado == null ? null : toMonto(s.monto_esperado)
      const diferencia = s.diferencia == null ? null : toMonto(s.diferencia)
      return {
        fecha: s.fecha,
        monto_leido: toMonto(s.monto_leido),
        monto_esperado: montoEsperado,
        diferencia,
        no_calza: excedeTolerancia(diferencia, montoEsperado),
        origen: s.origen,
      }
    }),
  }
}

export function createReservaRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/', async (c) => {
    return c.json(await listarReservas({}, db))
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const resultado = await crearReserva(body || {}, db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado.reserva, 201)
  })

  router.patch('/:id', async (c) => {
    const resultado = await editarReserva(c.req.param('id'), await c.req.json(), db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado.reserva)
  })

  router.get('/:id/saldos', async (c) => {
    const resultado = await listarSaldosReserva(c.req.param('id'), {}, db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado.saldos)
  })

  return router
}

export const reservaRouter = createReservaRouter()
