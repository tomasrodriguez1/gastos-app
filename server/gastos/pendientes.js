// Listado/búsqueda de gastos pendientes de revisión (bandeja) — usado por el
// tool buscar_gastos_pendientes del agente conversacional (server/agente.js)
// para encontrar el gastoId correcto antes de editarlo. No existía ningún
// endpoint con este filtro server-side; hoy el filtro por estado pendiente
// solo pasa client-side en BandejaPage.jsx.

import sql from '../db/client.js'
import { toMonto } from '../db/numeric.js'
import { deserializarGasto } from './serializacion.js'

const ESTADOS_BANDEJA = ['pendiente', 'error_parseo']

function combinarAnd(filtros) {
  return filtros.reduce((acc, f) => sql`${acc} AND ${f}`)
}

function filtrosBandeja({ busqueda = '', banco = '', estado = '', tipos = [] } = {}) {
  const estados = estado === 'pendiente' || estado === 'error_parseo'
    ? [estado]
    : ESTADOS_BANDEJA
  const filtros = [sql`estado = ANY(${estados})`]

  const termino = (busqueda || '').trim()
  if (termino) {
    filtros.push(sql`(motivo ILIKE ${'%' + termino + '%'} OR banco ILIKE ${'%' + termino + '%'})`)
  }

  const bancoFiltro = (banco || '').trim()
  if (bancoFiltro) {
    filtros.push(sql`banco ILIKE ${'%' + bancoFiltro + '%'}`)
  }

  const tipoFiltro = (Array.isArray(tipos) ? tipos : []).filter(Boolean)
  if (tipoFiltro.length === 1) {
    filtros.push(sql`tipos @> ${sql.json(tipoFiltro)}`)
  } else if (tipoFiltro.length > 1) {
    const orTipos = tipoFiltro
      .slice(1)
      .reduce((acc, t) => sql`${acc} OR tipos @> ${sql.json([t])}`, sql`tipos @> ${sql.json([tipoFiltro[0]])}`)
    filtros.push(sql`(${orTipos})`)
  }

  return combinarAnd(filtros)
}

export async function listarPendientes({
  busqueda = '',
  banco = '',
  estado = '',
  tipos = [],
  limite = 15,
  offset = 0,
} = {}) {
  const lim = Math.min(Math.max(Number(limite) || 15, 1), 30)
  const off = Math.max(Number(offset) || 0, 0)
  const where = filtrosBandeja({ busqueda, banco, estado, tipos })
  const rows = await sql`
    SELECT * FROM gastos
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ${lim}
    OFFSET ${off}
  `
  return rows.map(deserializarGasto)
}

export async function resumirBandeja({ banco = '' } = {}) {
  const bancoFiltro = (banco || '').trim()
  const where = filtrosBandeja({ banco: bancoFiltro })
  const rows = await sql`
    SELECT banco, estado, origen, monto, monto_real
    FROM gastos
    WHERE ${where}
  `

  const porBanco = {}
  const porEstado = {}
  const porOrigen = {}
  let suma = 0

  for (const r of rows) {
    const b = r.banco || '(sin banco)'
    const e = r.estado || 'pendiente'
    const o = r.origen || 'manual'
    porBanco[b] = (porBanco[b] || 0) + 1
    porEstado[e] = (porEstado[e] || 0) + 1
    porOrigen[o] = (porOrigen[o] || 0) + 1
    suma += toMonto(r.monto_real ?? r.monto ?? 0)
  }

  const aLista = (obj) => Object.entries(obj)
    .map(([clave, n]) => ({ clave, n }))
    .sort((a, b) => b.n - a.n)

  return {
    total: rows.length,
    suma_monto: Math.round(suma),
    por_banco: aLista(porBanco),
    por_estado: aLista(porEstado),
    por_origen: aLista(porOrigen),
  }
}
