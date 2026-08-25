import { Hono } from 'hono'
import sql from './db/client.js'
import { toMonto } from './db/numeric.js'

export const BANCOS_TARJETA = ['Edwards', 'BICE']
export const MONEDAS_TARJETA = ['CLP', 'USD']
const SIN_CLASIFICAR = 'SIN CLASIFICAR'

function tiposDe(row) {
  if (Array.isArray(row.tipos)) return row.tipos
  if (typeof row.tipos === 'string') {
    try { return JSON.parse(row.tipos || '[]') } catch { return [] }
  }
  return []
}

function presupuestoManualDe(row) {
  if (typeof row.presupuesto_manual === 'string') {
    try { return JSON.parse(row.presupuesto_manual) } catch { return null }
  }
  return row.presupuesto_manual || null
}

export function monedaGasto(row) {
  return toMonto(row.usd) > 0 && !toMonto(row.monto) ? 'USD' : 'CLP'
}

export function importeEnUnidades(row, moneda = monedaGasto(row)) {
  const monto = moneda === 'USD' ? toMonto(row.usd) : toMonto(row.monto)
  return Math.round((monto || 0) * (moneda === 'USD' ? 100 : 1))
}

function unidadesDesdeTotal(valor, moneda) {
  const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor
  if (typeof numero !== 'number' || !Number.isFinite(numero)) return null
  return Math.round(numero * (moneda === 'USD' ? 100 : 1))
}

function desdeUnidades(valor, moneda) {
  return valor / (moneda === 'USD' ? 100 : 1)
}

export function resolverCategoria(row, reglas) {
  const manual = presupuestoManualDe(row)
  if (manual?.grupo && manual?.subcategoria) return manual

  const contexto = row.contexto_override || row.contexto || ''
  const tipos = tiposDe(row)
  for (const regla of reglas) {
    if (!regla.activa) continue
    const matchContexto = !regla.contexto || regla.contexto === contexto
    const matchTipo = !regla.tipo || tipos.includes(regla.tipo)
    const matchBanco = !regla.banco || regla.banco === row.banco
    let matchMotivo = true
    if (regla.motivo_regex) {
      try { matchMotivo = new RegExp(regla.motivo_regex, 'i').test(row.motivo || '') } catch { matchMotivo = false }
    }
    if (!matchContexto || !matchTipo || !matchBanco || !matchMotivo) continue
    if (regla.grupo_dest === '_NONE_') break
    return { grupo: regla.grupo_dest, subcategoria: regla.subcat_dest }
  }
  return { grupo: SIN_CLASIFICAR, subcategoria: 'Por revisar' }
}

function nuevoAcumulador() {
  return {
    por_pagar: 0,
    fondo_actual: 0,
    falta_depositar: 0,
    por_cobrar: 0,
    conciliados: 0,
    sin_conciliar: 0,
    categorias: new Map(),
  }
}

function acumular(destino, row, reglas, moneda) {
  const importe = importeEnUnidades(row, moneda)
  const split = moneda === 'CLP' ? Math.round(toMonto(row.split) || 0) : 0
  destino.por_pagar += importe
  destino.por_cobrar += split
  if (row.plata_en_cuenta === true) destino.fondo_actual += importe
  else destino.falta_depositar += importe
  if (row.conciliado === true) destino.conciliados += 1
  else destino.sin_conciliar += 1

  const categoria = resolverCategoria(row, reglas)
  const clave = `${categoria.grupo}\u0000${categoria.subcategoria}`
  if (!destino.categorias.has(clave)) {
    destino.categorias.set(clave, { ...categoria, ...nuevoAcumulador(), categorias: undefined })
  }
  const acumulado = destino.categorias.get(clave)
  acumulado.por_pagar += importe
  acumulado.por_cobrar += split
  if (row.plata_en_cuenta === true) acumulado.fondo_actual += importe
  else acumulado.falta_depositar += importe
  if (row.conciliado === true) acumulado.conciliados += 1
  else acumulado.sin_conciliar += 1
}

function finalizar(acumulador, moneda) {
  const convertir = valor => desdeUnidades(valor, moneda)
  const categorias = [...acumulador.categorias.values()]
    .map(categoria => ({
      grupo: categoria.grupo,
      subcategoria: categoria.subcategoria,
      por_pagar: convertir(categoria.por_pagar),
      fondo_actual: convertir(categoria.fondo_actual),
      falta_depositar: convertir(categoria.falta_depositar),
      por_cobrar: convertir(categoria.por_cobrar),
      gasto_propio_neto: convertir(categoria.por_pagar - categoria.por_cobrar),
      conciliados: categoria.conciliados,
      sin_conciliar: categoria.sin_conciliar,
    }))
    .sort((a, b) => b.falta_depositar - a.falta_depositar || a.grupo.localeCompare(b.grupo))

  return {
    por_pagar: convertir(acumulador.por_pagar),
    fondo_actual: convertir(acumulador.fondo_actual),
    falta_depositar: convertir(acumulador.falta_depositar),
    por_cobrar: convertir(acumulador.por_cobrar),
    gasto_propio_neto: convertir(acumulador.por_pagar - acumulador.por_cobrar),
    conciliados: acumulador.conciliados,
    sin_conciliar: acumulador.sin_conciliar,
    categorias,
  }
}

export function crearResumenTarjeta(rows, reglas = []) {
  const totales = Object.fromEntries(MONEDAS_TARJETA.map(moneda => [moneda, nuevoAcumulador()]))
  const porBanco = Object.fromEntries(BANCOS_TARJETA.map(banco => [
    banco,
    Object.fromEntries(MONEDAS_TARJETA.map(moneda => [moneda, nuevoAcumulador()])),
  ]))

  for (const row of rows) {
    if (!BANCOS_TARJETA.includes(row.banco) || row.pagado === true || row.estado === 'descartado') continue
    const moneda = monedaGasto(row)
    acumular(totales[moneda], row, reglas, moneda)
    acumular(porBanco[row.banco][moneda], row, reglas, moneda)
  }

  return {
    totales: Object.fromEntries(MONEDAS_TARJETA.map(moneda => [moneda, finalizar(totales[moneda], moneda)])),
    bancos: BANCOS_TARJETA.map(banco => ({
      banco,
      monedas: Object.fromEntries(MONEDAS_TARJETA.map(moneda => [moneda, finalizar(porBanco[banco][moneda], moneda)])),
    })),
  }
}

function validarBase(body, requiereTotal) {
  const banco = body?.banco
  const moneda = body?.moneda
  const ids = Array.isArray(body?.gasto_ids) ? [...new Set(body.gasto_ids.filter(id => typeof id === 'string' && id))] : []
  if (!BANCOS_TARJETA.includes(banco)) return { error: 'Banco no permitido' }
  if (!MONEDAS_TARJETA.includes(moneda)) return { error: 'Moneda no permitida' }
  if (ids.length === 0) return { error: 'Seleccioná al menos un movimiento' }
  if (!requiereTotal) return { banco, moneda, ids }
  const totalCampo = body.total_estado ?? body.total_pagado
  const totalUnidades = unidadesDesdeTotal(totalCampo, moneda)
  if (totalUnidades == null) return { error: 'Total inválido' }
  return { banco, moneda, ids, totalUnidades }
}

function validarFilas(rows, base, operacion) {
  if (rows.length !== base.ids.length) return 'Uno o más movimientos no existen'
  for (const row of rows) {
    if (row.banco !== base.banco) return 'Todos los movimientos deben pertenecer al banco seleccionado'
    if (monedaGasto(row) !== base.moneda) return 'Todos los movimientos deben usar la moneda seleccionada'
    if (row.estado === 'descartado') return 'No se pueden operar movimientos descartados'
    if (row.pagado === true) return 'Uno o más movimientos ya están pagados'
    if (operacion === 'conciliar' && row.conciliado === true) return 'Uno o más movimientos ya están conciliados'
    if ((operacion === 'pagar' || operacion === 'desconciliar') && row.conciliado !== true) {
      return 'Uno o más movimientos no están conciliados'
    }
  }
  return null
}

function respuestaError(c, error, status = 400, extra = {}) {
  return c.json({ error, ...extra }, status)
}

export function createTarjetaRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/resumen', async (c) => {
    const [rows, reglas] = await Promise.all([
      db`SELECT * FROM gastos WHERE banco IN ('Edwards', 'BICE') AND pagado = FALSE AND estado != 'descartado'`,
      db`SELECT * FROM regla_mapeo WHERE activa = TRUE ORDER BY prioridad, id`,
    ])
    return c.json(crearResumenTarjeta(rows, reglas))
  })

  router.post('/conciliar', async (c) => {
    const base = validarBase(await c.req.json(), true)
    if (base.error) return respuestaError(c, base.error)
    let resultado
    try {
      resultado = await db.begin(async (tx) => {
        const rows = await tx`SELECT * FROM gastos WHERE id = ANY(${base.ids}) FOR UPDATE`
        const error = validarFilas(rows, base, 'conciliar')
        if (error) return { error, status: 409 }
        const calculado = rows.reduce((suma, row) => suma + importeEnUnidades(row, base.moneda), 0)
        if (calculado !== base.totalUnidades) {
          return {
            error: 'El total del estado no cuadra con los movimientos seleccionados',
            status: 409,
            total_calculado: desdeUnidades(calculado, base.moneda),
            diferencia: desdeUnidades(base.totalUnidades - calculado, base.moneda),
          }
        }
        await tx`UPDATE gastos SET conciliado = TRUE, updated_at = NOW() WHERE id = ANY(${base.ids})`
        return { ok: true, actualizados: rows.length, total: desdeUnidades(calculado, base.moneda) }
      })
    } catch (error) {
      console.error('[tarjeta/conciliar]', error.message)
      return respuestaError(c, 'No se pudo conciliar el estado', 500)
    }
    if (resultado.error) return respuestaError(c, resultado.error, resultado.status, resultado)
    return c.json(resultado)
  })

  router.post('/desconciliar', async (c) => {
    const base = validarBase(await c.req.json(), false)
    if (base.error) return respuestaError(c, base.error)
    let resultado
    try {
      resultado = await db.begin(async (tx) => {
        const rows = await tx`SELECT * FROM gastos WHERE id = ANY(${base.ids}) FOR UPDATE`
        const error = validarFilas(rows, base, 'desconciliar')
        if (error) return { error, status: 409 }
        await tx`UPDATE gastos SET conciliado = FALSE, updated_at = NOW() WHERE id = ANY(${base.ids})`
        return { ok: true, actualizados: rows.length }
      })
    } catch (error) {
      console.error('[tarjeta/desconciliar]', error.message)
      return respuestaError(c, 'No se pudo revertir la conciliación', 500)
    }
    if (resultado.error) return respuestaError(c, resultado.error, resultado.status)
    return c.json(resultado)
  })

  router.post('/pagar', async (c) => {
    const base = validarBase(await c.req.json(), true)
    if (base.error) return respuestaError(c, base.error)
    let resultado
    try {
      resultado = await db.begin(async (tx) => {
        const rows = await tx`SELECT * FROM gastos WHERE id = ANY(${base.ids}) FOR UPDATE`
        const error = validarFilas(rows, base, 'pagar')
        if (error) return { error, status: 409 }
        const calculado = rows.reduce((suma, row) => suma + importeEnUnidades(row, base.moneda), 0)
        if (calculado !== base.totalUnidades) {
          return {
            error: 'El total pagado no cuadra con los movimientos seleccionados',
            status: 409,
            total_calculado: desdeUnidades(calculado, base.moneda),
            diferencia: desdeUnidades(base.totalUnidades - calculado, base.moneda),
          }
        }
        await tx`UPDATE gastos SET pagado = TRUE, updated_at = NOW() WHERE id = ANY(${base.ids})`
        return { ok: true, actualizados: rows.length, total: desdeUnidades(calculado, base.moneda) }
      })
    } catch (error) {
      console.error('[tarjeta/pagar]', error.message)
      return respuestaError(c, 'No se pudo registrar el pago', 500)
    }
    if (resultado.error) return respuestaError(c, resultado.error, resultado.status, resultado)
    return c.json(resultado)
  })

  return router
}

export const tarjetaRouter = createTarjetaRouter()
