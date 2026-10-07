// FGP (Fondo Gastos Previstos) como fondo con arrastre entre ciclos. El saldo se calcula en el
// cliente (calcularFondoFGP en src/utils/fgp.js): previsto de las líneas fgp=true de cada ciclo −
// gastos de esas líneas + coberturas + déficits + ajustes. Acá solo se escribe lo no derivable
// (tabla fgp_movimiento, ver server/db/migrate-fgp.js).
//
// Traspaso a tarjeta: los gastos FGP pagados con tarjeta tienen que pasar al fondo común de
// tarjeta. "mover" crea un único aporte CLP en fondo_tarjeta_movimiento por el total del lote y
// una fila traspaso_tc por gasto ligada a ese aporte; "marcar" solo deja la fila (historial que
// ya se había movido a mano), sin tocar el fondo de tarjeta.

import { Hono } from 'hono'
import sql from './db/client.js'
import { toMonto } from './db/numeric.js'
import { deserializarGasto } from './gastos/serializacion.js'
import { montoDelCiclo } from '../src/utils/calculos.js'
import { BANCOS_TARJETA } from './tarjeta.js'

const TIPOS_MANUALES = ['cobertura', 'deficit', 'ajuste']
const MODOS_TRASPASO = ['mover', 'marcar']

const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '')
const cicloValido = c => /^\d{4}-\d{2}$/.test(c || '')
const hoyISO = () => new Date().toISOString().slice(0, 10)
const textoCorto = (t, max = 200) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, max) : null)

export function serializarMovimientoFGP(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    ciclo: row.ciclo,
    fecha: row.fecha,
    monto: toMonto(row.monto),
    gasto_id: row.gasto_id || null,
    tarjeta_movimiento_id: row.tarjeta_movimiento_id ?? null,
    fondo_ahorro_movimiento_id: row.fondo_ahorro_movimiento_id ?? null,
    origen: row.origen || null,
    nota: row.nota || null,
  }
}

export async function listarMovimientosFGP(db = sql) {
  const rows = await db`SELECT * FROM fgp_movimiento ORDER BY fecha DESC, id DESC`
  return rows.map(serializarMovimientoFGP)
}

// cobertura / deficit / ajuste. Una cobertura desde un fondo de ahorro manual (fondoNombre)
// registra además la salida en fondo_ahorro_movimiento (ajuste negativo) en la misma transacción.
export async function registrarMovimientoFGP({ tipo, ciclo, fecha = hoyISO(), monto, origen, fondoNombre, nota } = {}, db = sql) {
  if (!TIPOS_MANUALES.includes(tipo)) return { error: `tipo debe ser uno de: ${TIPOS_MANUALES.join(', ')}`, status: 400 }
  if (!cicloValido(ciclo)) return { error: 'Ciclo inválido (YYYY-MM)', status: 400 }
  if (!fechaValida(fecha)) return { error: 'Fecha inválida (YYYY-MM-DD)', status: 400 }
  const montoNum = Number(monto)
  if (!Number.isFinite(montoNum) || montoNum === 0) return { error: 'Monto inválido', status: 400 }
  if (tipo !== 'ajuste' && montoNum < 0) return { error: 'Una cobertura o déficit debe ser positivo', status: 400 }
  const fondo = textoCorto(fondoNombre, 120)
  if (fondo && tipo !== 'cobertura') return { error: 'Solo una cobertura puede salir de un fondo de ahorro', status: 400 }

  const notaLimpia = textoCorto(nota)
  const origenLimpio = fondo ? `Fondo ${fondo}` : textoCorto(origen, 120)

  const row = await db.begin(async (tx) => {
    let fondoMovId = null
    if (fondo) {
      const [mov] = await tx`
        INSERT INTO fondo_ahorro_movimiento (fondo_nombre, fecha, tipo, monto, nota)
        VALUES (${fondo}, ${fecha}, 'ajuste', ${-montoNum}, ${'Cobertura FGP'})
        RETURNING id
      `
      fondoMovId = mov.id
    }
    const [insertado] = await tx`
      INSERT INTO fgp_movimiento (tipo, ciclo, fecha, monto, fondo_ahorro_movimiento_id, origen, nota)
      VALUES (${tipo}, ${ciclo}, ${fecha}, ${montoNum}, ${fondoMovId}, ${origenLimpio}, ${notaLimpia})
      RETURNING *
    `
    return insertado
  })
  return { movimiento: serializarMovimientoFGP(row) }
}

export async function registrarTraspasos({ gastoIds, modo = 'mover', fecha = hoyISO() } = {}, db = sql) {
  if (!MODOS_TRASPASO.includes(modo)) return { error: `modo debe ser uno de: ${MODOS_TRASPASO.join(', ')}`, status: 400 }
  if (!fechaValida(fecha)) return { error: 'Fecha inválida (YYYY-MM-DD)', status: 400 }
  const ids = [...new Set((Array.isArray(gastoIds) ? gastoIds : []).filter(id => typeof id === 'string' && id))]
  if (ids.length === 0) return { error: 'Faltan gastoIds', status: 400 }

  return db.begin(async (tx) => {
    const rows = await tx`SELECT * FROM gastos WHERE id = ANY(${ids})`
    const yaMovidos = new Set((await tx`
      SELECT gasto_id FROM fgp_movimiento WHERE tipo = 'traspaso_tc' AND gasto_id = ANY(${ids})
    `).map(r => r.gasto_id))

    const omitidos = []
    const porRegistrar = []
    const encontrados = new Set(rows.map(r => r.id))
    for (const id of ids) if (!encontrados.has(id)) omitidos.push({ id, motivo: 'no encontrado' })
    for (const row of rows) {
      const gasto = deserializarGasto(row)
      const monto = montoDelCiclo(gasto)
      if (yaMovidos.has(gasto.id)) omitidos.push({ id: gasto.id, motivo: 'ya movido' })
      else if (modo === 'mover' && !BANCOS_TARJETA.includes(gasto.banco)) omitidos.push({ id: gasto.id, motivo: 'no es de tarjeta' })
      else if (!(monto > 0)) omitidos.push({ id: gasto.id, motivo: 'monto 0' })
      else porRegistrar.push({ gasto, monto: Math.round(monto) })
    }
    if (porRegistrar.length === 0) return { registrados: 0, total: 0, omitidos }

    const total = porRegistrar.reduce((s, p) => s + p.monto, 0)
    let tarjetaMovId = null
    if (modo === 'mover') {
      const nota = `FGP → TC (${porRegistrar.length} gasto${porRegistrar.length === 1 ? '' : 's'})`
      const [mov] = await tx`
        INSERT INTO fondo_tarjeta_movimiento (fecha, tipo, moneda, monto, nota)
        VALUES (${fecha}, 'aporte', 'CLP', ${total}, ${nota})
        RETURNING id
      `
      tarjetaMovId = mov.id
    }
    const notaFila = modo === 'mover' ? null : 'Marcado como movido'
    for (const { gasto, monto } of porRegistrar) {
      await tx`
        INSERT INTO fgp_movimiento (tipo, ciclo, fecha, monto, gasto_id, tarjeta_movimiento_id, nota)
        VALUES ('traspaso_tc', ${gasto.ciclo_financiero}, ${fecha}, ${monto}, ${gasto.id}, ${tarjetaMovId}, ${notaFila})
      `
    }
    return { registrados: porRegistrar.length, total, tarjeta_movimiento_id: tarjetaMovId, omitidos }
  })
}

// Deshacer. Un traspaso real se deshace borrando su aporte de tarjeta (el CASCADE devuelve a
// pendiente todos los gastos de ese lote); una cobertura desde fondo, borrando su salida del fondo.
export async function eliminarMovimientoFGP(id, db = sql) {
  if (!Number.isInteger(id) || id <= 0) return { error: 'Id inválido', status: 400 }
  const [row] = await db`SELECT * FROM fgp_movimiento WHERE id = ${id}`
  if (!row) return { error: 'Movimiento no encontrado', status: 404 }
  if (row.tarjeta_movimiento_id) {
    await db`DELETE FROM fondo_tarjeta_movimiento WHERE id = ${row.tarjeta_movimiento_id} AND tipo = 'aporte'`
  } else if (row.fondo_ahorro_movimiento_id) {
    await db`DELETE FROM fondo_ahorro_movimiento WHERE id = ${row.fondo_ahorro_movimiento_id}`
  }
  await db`DELETE FROM fgp_movimiento WHERE id = ${id}`
  return { ok: true }
}

export function createFGPRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/movimientos', async (c) => c.json(await listarMovimientosFGP(db)))

  router.post('/movimientos', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const resultado = await registrarMovimientoFGP({
      tipo: body?.tipo,
      ciclo: body?.ciclo,
      fecha: body?.fecha ?? hoyISO(),
      monto: body?.monto,
      origen: body?.origen,
      fondoNombre: body?.fondo_nombre,
      nota: body?.nota,
    }, db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado.movimiento, 201)
  })

  router.post('/traspasos', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const resultado = await registrarTraspasos({
      gastoIds: body?.gasto_ids,
      modo: body?.modo,
      fecha: body?.fecha ?? hoyISO(),
    }, db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado)
  })

  router.delete('/movimientos/:id', async (c) => {
    const resultado = await eliminarMovimientoFGP(Number(c.req.param('id')), db)
    if (resultado.error) return c.json({ error: resultado.error }, resultado.status)
    return c.json(resultado)
  })

  return router
}

export const fgpRouter = createFGPRouter()
