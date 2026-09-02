// Consultas de solo lectura del ciclo financiero para el agente conversacional.
// Replica la semántica del dashboard (montoDelCiclo, pendientes → SIN CLASIFICAR,
// confirmados sin mapeo excluidos, USD puro fuera) sin usar mapeo.js del cliente
// (ese módulo cachea reglas via fetch('/api/reglas-mapeo')).

import sql from '../db/client.js'
import { deserializarGasto } from '../gastos/serializacion.js'
import { leerPresupuestoCiclo } from '../presupuesto/leer.js'
import { resolverCategoria } from '../tarjeta.js'
import {
  SIN_CLASIFICAR,
  montoDelCiclo,
  esGastoUsdPuro,
  semaforo,
  calcularTotalIngresos,
  calcularTotalPrevisto,
  calcularPrevistoPorGrupo,
} from '../../src/utils/calculos.js'
import {
  obtenerCicloActual,
  obtenerDiaDelCiclo,
  obtenerDuracionCiclo,
  obtenerRangoCiclo,
} from '../../src/utils/ciclos.js'

const CICLO_RE = /^\d{4}-\d{2}$/

function fechaISO(fecha) {
  if (!fecha) return ''
  if (typeof fecha === 'string') return fecha.slice(0, 10)
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return fecha.toISOString().slice(0, 10)
  }
  return String(fecha).slice(0, 10)
}

export function cicloConsulta(ciclo) {
  if (ciclo && CICLO_RE.test(ciclo)) return ciclo
  return obtenerCicloActual()
}

async function cargarReglas() {
  return sql`SELECT * FROM regla_mapeo WHERE activa = TRUE ORDER BY prioridad, id`
}

async function cargarGastosCiclo(ciclo) {
  const rows = await sql`
    SELECT * FROM gastos
    WHERE ciclo_financiero = ${ciclo}
    ORDER BY fecha DESC
  `
  return rows.map(deserializarGasto)
}

function esPendienteRevision(g) {
  return g.estado === 'pendiente' || g.estado === 'error_parseo'
}

function entraEnPresupuesto(g) {
  return !esGastoUsdPuro(g) && g.estado !== 'descartado' && g.en_presupuesto !== false
}

export function categorizarParaPresupuesto(gasto, reglas) {
  if (!entraEnPresupuesto(gasto)) return null
  const cat = resolverCategoria(gasto, reglas)
  if (cat.grupo === SIN_CLASIFICAR && !esPendienteRevision(gasto)) return null
  return cat
}

function agregarPorGrupo(gastos, reglas) {
  const realPorGrupo = {}
  for (const g of gastos) {
    const cat = categorizarParaPresupuesto(g, reglas)
    if (!cat) continue
    const monto = montoDelCiclo(g)
    if (!monto) continue
    realPorGrupo[cat.grupo] = (realPorGrupo[cat.grupo] || 0) + monto
  }
  return realPorGrupo
}

export async function resumenCiclo({ ciclo } = {}) {
  const cicloResuelto = cicloConsulta(ciclo)
  const [presupuesto, gastos, reglas] = await Promise.all([
    leerPresupuestoCiclo(cicloResuelto),
    cargarGastosCiclo(cicloResuelto),
    cargarReglas(),
  ])

  const realPorGrupo = agregarPorGrupo(gastos, reglas)
  const previstoPorGrupo = calcularPrevistoPorGrupo(presupuesto)
  const grupos = new Set([...Object.keys(previstoPorGrupo), ...Object.keys(realPorGrupo)])
  const semaforos = [...grupos]
    .sort()
    .filter(grupo => grupo !== SIN_CLASIFICAR)
    .map(grupo => {
      const real = Math.round(realPorGrupo[grupo] || 0)
      const previsto = Math.round(previstoPorGrupo[grupo] || 0)
      return { grupo, real, previsto, restante: previsto - real, estado: semaforo(real, previsto) }
    })

  const gastado = Math.round(gastos.reduce((sum, g) => {
    if (!entraEnPresupuesto(g)) return sum
    return sum + (montoDelCiclo(g) || 0)
  }, 0))
  const previsto = Math.round(calcularTotalPrevisto(presupuesto))
  const ingresos = Math.round(calcularTotalIngresos(presupuesto))
  const sinClasificar = Math.round(realPorGrupo[SIN_CLASIFICAR] || 0)
  const rango = obtenerRangoCiclo(cicloResuelto)
  const duracion = obtenerDuracionCiclo(cicloResuelto)
  const hoy = new Date()
  const cicloHoy = obtenerCicloActual(hoy)
  const dia = cicloResuelto === cicloHoy
    ? obtenerDiaDelCiclo([
      hoy.getFullYear(),
      String(hoy.getMonth() + 1).padStart(2, '0'),
      String(hoy.getDate()).padStart(2, '0'),
    ].join('-'))
    : gastos.reduce((max, g) => {
      const f = fechaISO(g.fecha)
      return f ? Math.max(max, obtenerDiaDelCiclo(f)) : max
    }, 0)

  return {
    ciclo: cicloResuelto,
    rango,
    dia,
    duracion,
    ingresos,
    previsto,
    gastado,
    restante: previsto - gastado,
    sin_clasificar: sinClasificar,
    semaforos,
    en_rojo: semaforos.filter(s => s.estado === 'rojo').map(s => s.grupo),
    hay_presupuesto: Boolean(presupuesto),
  }
}

export async function buscarGastosCiclo({ texto = '', ciclo, grupo } = {}) {
  const cicloResuelto = cicloConsulta(ciclo)
  const termino = (texto || '').trim().toLowerCase()
  const grupoFiltro = (grupo || '').trim().toLowerCase()
  const [gastos, reglas] = await Promise.all([
    cargarGastosCiclo(cicloResuelto),
    cargarReglas(),
  ])

  const filas = []
  for (const g of gastos) {
    if (termino && !(g.motivo || '').toLowerCase().includes(termino)) continue
    const cat = categorizarParaPresupuesto(g, reglas)
    const grupoResuelto = cat?.grupo || null
    if (grupoFiltro && (!grupoResuelto || !grupoResuelto.toLowerCase().includes(grupoFiltro))) continue
    const monto = entraEnPresupuesto(g) ? (montoDelCiclo(g) || 0) : 0
    filas.push({
      gastoId: g.id,
      fecha: fechaISO(g.fecha),
      motivo: g.motivo,
      monto,
      usd: g.usd,
      banco: g.banco,
      estado: g.estado,
      origen: g.origen,
      grupo: grupoResuelto,
      subcategoria: cat?.subcategoria || null,
    })
  }

  const limitados = filas.slice(0, 20)
  return {
    ciclo: cicloResuelto,
    total: filas.length,
    suma: Math.round(filas.reduce((s, f) => s + (f.monto || 0), 0)),
    gastos: limitados,
  }
}
