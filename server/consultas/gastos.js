// Búsqueda y agregación de gastos por fechas/ciclo/mes/banco — read service del
// servidor MCP (server/mcp/). buscarGastosCiclo (ciclo.js) solo filtra por un
// ciclo y corta en 20; esto agrega rangos de fecha, montos, orden y paginación.
//
// Misma semántica que ciclo.js (y que el dashboard): la categoría se resuelve
// en lectura con categorizarParaPresupuesto → resolverCategoria, y el impacto
// en el sobre del ciclo es montoDelCiclo. Se incluye en los totales lo mismo
// que entra al "gastado" de resumenCiclo: sin descartados, sin
// en_presupuesto=false y sin USD puro (no hay tipo de cambio server-side).

import sql from '../db/client.js'
import { deserializarGasto } from '../gastos/serializacion.js'
import {
  cargarReglas,
  categorizarParaPresupuesto,
  entraEnPresupuesto,
  fechaISO,
} from './ciclo.js'
import { montoDelCiclo } from '../../src/utils/calculos.js'

// Confirmados sin regla (Ajuste/Turno/Otro): cuentan en el gastado igual que
// en el dashboard, pero no tienen grupo presupuestario.
export const SIN_MAPEO = 'SIN MAPEO'
export const MAX_GRUPOS = 30

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, '\\$&')
}

function clausulaOrden(orden) {
  switch (orden) {
    case 'fecha_asc': return sql`fecha ASC, created_at ASC`
    case 'monto_desc': return sql`monto DESC NULLS LAST, fecha DESC`
    case 'creado_desc': return sql`created_at DESC`
    default: return sql`fecha DESC, created_at DESC`
  }
}

// Sin payload_raw, sync_key ni fuente_id: nada de eso sale por el MCP.
async function cargarGastos(filtros = {}, orden = 'fecha_desc') {
  const {
    fecha_desde, fecha_hasta, ciclo, mes, banco, texto, monto_min, monto_max, estado,
  } = filtros
  const vacio = sql``
  const rows = await sql`
    SELECT id, fecha, mes, ciclo_financiero, motivo, banco, tipos, contexto, contexto_override,
           monto, monto_real, usd, monto_clp_manual, split, monto_presupuesto_manual,
           presupuesto_manual, en_presupuesto, financiado_por, estado, origen, created_at
    FROM gastos
    WHERE TRUE
      ${fecha_desde ? sql`AND fecha >= ${fecha_desde}` : vacio}
      ${fecha_hasta ? sql`AND fecha <= ${fecha_hasta}` : vacio}
      ${ciclo ? sql`AND ciclo_financiero = ${ciclo}` : vacio}
      ${mes ? sql`AND mes = ${mes}` : vacio}
      ${banco ? sql`AND LOWER(banco) = LOWER(${banco})` : vacio}
      ${texto ? sql`AND motivo ILIKE ${'%' + escaparLike(texto) + '%'}` : vacio}
      ${monto_min != null ? sql`AND monto >= ${monto_min}` : vacio}
      ${monto_max != null ? sql`AND monto <= ${monto_max}` : vacio}
      ${estado
        ? sql`AND estado = ${estado}`
        : sql`AND (estado IS NULL OR estado <> 'descartado')`}
    ORDER BY ${clausulaOrden(orden)}
  `
  return rows.map(deserializarGasto)
}

// Fila de salida: categoría resuelta + importe del sobre. `incluido` = entra al
// gastado del dashboard; si no, monto_ciclo es 0.
export function prepararFila(gasto, reglas) {
  const cat = categorizarParaPresupuesto(gasto, reglas)
  const incluido = entraEnPresupuesto(gasto)
  return {
    id: gasto.id,
    fecha: fechaISO(gasto.fecha),
    mes: gasto.mes,
    ciclo_financiero: gasto.ciclo_financiero,
    motivo: gasto.motivo,
    monto: gasto.monto || 0,
    usd: gasto.usd || 0,
    monto_ciclo: incluido ? (montoDelCiclo(gasto) || 0) : 0,
    banco: gasto.banco || '',
    estado: gasto.estado,
    origen: gasto.origen,
    grupo: cat?.grupo || null,
    subcategoria: cat?.subcategoria || null,
    incluido,
  }
}

function filtrarPorGrupo(filas, grupo) {
  const termino = (grupo || '').trim().toLowerCase()
  if (!termino) return filas
  return filas.filter(f => f.grupo && f.grupo.toLowerCase().includes(termino))
}

async function cargarFilas(filtros, orden) {
  const [gastos, reglas] = await Promise.all([cargarGastos(filtros, orden), cargarReglas()])
  return filtrarPorGrupo(gastos.map(g => prepararFila(g, reglas)), filtros.grupo)
}

export async function buscarGastos({ limite = 20, offset = 0, orden = 'fecha_desc', ...filtros } = {}) {
  const filas = await cargarFilas(filtros, orden)
  const pagina = filas.slice(offset, offset + limite).map(({
    id, fecha, motivo, monto, usd, monto_ciclo, banco, estado, origen, grupo, subcategoria,
  }) => ({ id, fecha, motivo, monto, usd, monto_ciclo, banco, estado, origen, grupo, subcategoria }))
  return {
    filas: pagina,
    meta: {
      total: filas.length,
      devueltos: pagina.length,
      offset,
      limite,
      truncado: offset + pagina.length < filas.length,
    },
  }
}

function claveDe(fila, agruparPor) {
  switch (agruparPor) {
    case 'grupo': return fila.grupo || SIN_MAPEO
    case 'subcategoria': return fila.grupo ? `${fila.grupo} / ${fila.subcategoria}` : SIN_MAPEO
    case 'banco': return fila.banco || '(sin banco)'
    case 'dia': return fila.fecha
    case 'mes': return fila.mes
    case 'ciclo': return fila.ciclo_financiero
    default: return null
  }
}

function porcentaje(parte, total) {
  return total ? Math.round((parte / total) * 1000) / 10 : 0
}

// Agregación pura sobre filas ya preparadas. Solo cuentan las `incluido`;
// cantidad incluye las que pasaron la inclusión aunque su monto_ciclo sea 0
// (p.ej. financiado_por un fondo de ahorro).
export function agregarFilas(filas, { agrupar_por = 'ninguno', maxGrupos = MAX_GRUPOS } = {}) {
  const incluidas = filas.filter(f => f.incluido)
  const totalCiclo = Math.round(incluidas.reduce((s, f) => s + f.monto_ciclo, 0))
  const totalNominal = Math.round(incluidas.reduce((s, f) => s + (f.monto || 0), 0))
  const montos = incluidas.map(f => f.monto_ciclo)
  const resultado = {
    total_ciclo: totalCiclo,
    total_nominal: totalNominal,
    cantidad: incluidas.length,
    promedio: incluidas.length ? Math.round(totalCiclo / incluidas.length) : 0,
    minimo: montos.length ? Math.round(Math.min(...montos)) : 0,
    maximo: montos.length ? Math.round(Math.max(...montos)) : 0,
  }
  if (!agrupar_por || agrupar_por === 'ninguno') return resultado

  const grupos = new Map()
  for (const f of incluidas) {
    const clave = claveDe(f, agrupar_por)
    const actual = grupos.get(clave) || { clave, total_ciclo: 0, cantidad: 0 }
    actual.total_ciclo += f.monto_ciclo
    actual.cantidad += 1
    grupos.set(clave, actual)
  }
  const ordenadas = [...grupos.values()]
    .map(g => ({ ...g, total_ciclo: Math.round(g.total_ciclo) }))
    .sort((a, b) => b.total_ciclo - a.total_ciclo || b.cantidad - a.cantidad || String(a.clave).localeCompare(String(b.clave)))

  let visibles = ordenadas
  if (maxGrupos && ordenadas.length > maxGrupos) {
    visibles = ordenadas.slice(0, maxGrupos)
    const resto = ordenadas.slice(maxGrupos)
    visibles.push({
      clave: 'otros',
      total_ciclo: resto.reduce((s, g) => s + g.total_ciclo, 0),
      cantidad: resto.reduce((s, g) => s + g.cantidad, 0),
    })
  }
  resultado.grupos = visibles.map(g => ({ ...g, porcentaje: porcentaje(g.total_ciclo, totalCiclo) }))
  resultado.grupos_totales = ordenadas.length
  return resultado
}

export async function resumirGastos({ agrupar_por = 'ninguno', maxGrupos = MAX_GRUPOS, ...filtros } = {}) {
  const filas = await cargarFilas(filtros, 'fecha_desc')
  return agregarFilas(filas, { agrupar_por, maxGrupos })
}
