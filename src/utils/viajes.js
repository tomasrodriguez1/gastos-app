// Viajes: etiqueta ortogonal a la categoría presupuestaria (gastos.viaje_id). El viaje no
// cambia de qué presupuesto sale un gasto por sí solo — al asignarlo se *sugiere* un
// presupuesto_manual (ALE si va la polola, VIAJES si no) que queda visible y editable, igual
// que cualquier otro override. Compartido con el server (server/viajes.js, gastos/crear.js).

import { esGastoUsdPuro, grupoDeGasto, montoPresupuestable } from './calculos.js'
import { getSubcategoriaPresupuesto } from './mapeo.js'

export const ESTADOS_VIAJE = ['planificado', 'en_curso', 'cerrado']

// 'Ale' es el nombre histórico del contexto (migración 009 lo renombró a 'Polola').
const CONTEXTOS_POLOLA = ['Polola', 'Ale']

const SUBCATEGORIA_ALE = {
  Viaje: 'Pasajes',
  Comida: 'Comida',
  Transporte: 'Transporte',
  Ocio: 'Fiesta',
  Regalo: 'Regalos',
}

const SUBCATEGORIA_VIAJES = {
  Viaje: 'Pasajes',
  Comida: 'Comida',
}

// Si va la Ale, es ALE (aunque vayan amigos); si no, VIAJES. Todo lo del viaje sale de ese
// grupo — comida y transporte incluidos — para no inflar las categorías del día a día.
export function sugerirAsignacionViaje({ tipos = [], contexto = '' } = {}) {
  const conPolola = CONTEXTOS_POLOLA.includes(contexto)
  const tabla = conPolola ? SUBCATEGORIA_ALE : SUBCATEGORIA_VIAJES
  const tipo = (tipos || []).find(t => tabla[t])
  return {
    grupo: conPolola ? 'ALE' : 'VIAJES',
    subcategoria: tipo ? tabla[tipo] : 'Otros',
  }
}

export function sugerenciaParaGasto(gasto) {
  return sugerirAsignacionViaje({
    tipos: gasto?.tipos || [],
    contexto: gasto?.contexto_override || gasto?.contexto || '',
  })
}

// ¿El presupuesto_manual del gasto es exactamente lo que la asignación de viaje habría
// sugerido? Se usa al quitar un gasto de un viaje para limpiar solo la sugerencia, nunca un
// override que el usuario eligió a mano.
export function esSugerenciaDeViaje(gasto) {
  const pm = gasto?.presupuesto_manual
  if (!pm?.grupo) return false
  const sugerida = sugerenciaParaGasto(gasto)
  return pm.grupo === sugerida.grupo && pm.subcategoria === sugerida.subcategoria
}

export function fechaEnViaje(fecha, viaje) {
  if (!fecha || !viaje?.fecha_desde || !viaje?.fecha_hasta) return false
  return fecha >= viaje.fecha_desde && fecha <= viaje.fecha_hasta
}

export function diasDeViaje(viaje) {
  if (!viaje?.fecha_desde || !viaje?.fecha_hasta) return 0
  const desde = new Date(`${viaje.fecha_desde}T00:00:00Z`)
  const hasta = new Date(`${viaje.fecha_hasta}T00:00:00Z`)
  return Math.max(1, Math.round((hasta - desde) / 86400000) + 1)
}

// El único viaje en curso cuyo rango cubre la fecha; null si no hay o si hay más de uno
// (ambiguo — mejor no sugerir nada que sugerir mal).
export function viajeEnCursoParaFecha(viajes, fecha) {
  const candidatos = (viajes || []).filter(v => v.estado === 'en_curso' && fechaEnViaje(fecha, v))
  return candidatos.length === 1 ? candidatos[0] : null
}

function subcategoriaDeGasto(g) {
  if (g.presupuesto_manual?.subcategoria) return g.presupuesto_manual.subcategoria
  const ctx = g.contexto_override || g.contexto || ''
  return getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')?.subcategoria || 'Otros'
}

// Costo propio del viaje: montoPresupuestable (descuenta split, respeta en_presupuesto) e
// incluye gastos financiados por un fondo — al viaje le importa cuánto costó, no de qué sobre
// salió. Los USD puros (sin CLP) se suman aparte.
export function resumirViaje(viaje, gastos) {
  const propios = (gastos || []).filter(g => g.viaje_id === viaje.id && g.estado !== 'descartado')
  const porGrupo = {}
  let total = 0
  let antes = 0
  let durante = 0
  let usd = 0

  for (const g of propios) {
    // Solo los USD que no tienen monto en pesos: el resto ya está sumado en CLP.
    if (esGastoUsdPuro(g)) {
      usd += Number(g.usd) || 0
      continue
    }
    const monto = montoPresupuestable(g)
    if (!monto) continue
    total += monto
    if (viaje.fecha_desde && g.fecha < viaje.fecha_desde) antes += monto
    else durante += monto

    const grupo = grupoDeGasto(g) || 'SIN GRUPO'
    const sub = subcategoriaDeGasto(g)
    porGrupo[grupo] ??= { total: 0, subcategorias: {} }
    porGrupo[grupo].total += monto
    porGrupo[grupo].subcategorias[sub] = (porGrupo[grupo].subcategorias[sub] || 0) + monto
  }

  const dias = diasDeViaje(viaje)
  return {
    gastos: propios,
    total,
    antes,
    durante,
    usd,
    dias,
    promedioDiario: dias ? Math.round(durante / dias) : 0,
    porGrupo,
  }
}

// Gastos sin viaje que probablemente son del viaje: los que caen en sus fechas, más pasajes
// (subcategoría Pasajes de ALE/VIAJES) comprados hasta 6 meses antes de salir.
export function sugerirGastosParaViaje(viaje, gastos) {
  if (!viaje?.fecha_desde) return []
  const limite = new Date(`${viaje.fecha_desde}T00:00:00Z`)
  limite.setUTCMonth(limite.getUTCMonth() - 6)
  const desdePasajes = limite.toISOString().slice(0, 10)

  return (gastos || [])
    .filter(g => !g.viaje_id && g.estado !== 'descartado' && g.id)
    .filter(g => {
      if (fechaEnViaje(g.fecha, viaje)) return true
      if (g.fecha < desdePasajes || g.fecha >= viaje.fecha_desde) return false
      const grupo = grupoDeGasto(g)
      return (grupo === 'ALE' || grupo === 'VIAJES') && subcategoriaDeGasto(g) === 'Pasajes'
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// Grupos que el dashboard de viajes separa; el resto se junta en "otros".
export const GRUPOS_VIAJE = ['ALE', 'VIAJES']

// Agregado de varios viajes para el dashboard de /viajes. Ordena por fecha de salida (más antiguo
// primero) para que el gráfico se lea como una línea de tiempo. Solo los viajes con al menos un
// gasto cuentan para promedios — un viaje recién creado sin gastos no baja el promedio.
export function resumirTodosLosViajes(viajes, gastos) {
  const porViaje = [...(viajes || [])]
    .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde))
    .map(viaje => {
      const resumen = resumirViaje(viaje, gastos)
      const ale = resumen.porGrupo.ALE?.total || 0
      const viajesGrupo = resumen.porGrupo.VIAJES?.total || 0
      return {
        viaje,
        resumen,
        ale,
        viajes: viajesGrupo,
        otros: resumen.total - ale - viajesGrupo,
        porDia: resumen.dias ? Math.round(resumen.total / resumen.dias) : 0,
      }
    })

  const conGastos = porViaje.filter(p => p.resumen.gastos.length > 0)
  const total = porViaje.reduce((s, p) => s + p.resumen.total, 0)
  const totalAle = porViaje.reduce((s, p) => s + p.ale, 0)
  const durante = conGastos.reduce((s, p) => s + p.resumen.durante, 0)
  const dias = conGastos.reduce((s, p) => s + p.resumen.dias, 0)
  const usd = porViaje.reduce((s, p) => s + p.resumen.usd, 0)

  // Subcategorías sumadas a través de grupos: "Comida" de ALE y de VIAJES es la misma pregunta
  // ("¿cuánto se va en comida cuando viajo?").
  const porSubcategoria = {}
  for (const p of porViaje) {
    for (const { subcategorias } of Object.values(p.resumen.porGrupo)) {
      for (const [sub, monto] of Object.entries(subcategorias)) {
        porSubcategoria[sub] = (porSubcategoria[sub] || 0) + monto
      }
    }
  }

  return {
    porViaje,
    total,
    usd,
    nViajes: porViaje.length,
    nConGastos: conGastos.length,
    promedioPorViaje: conGastos.length ? Math.round(total / conGastos.length) : 0,
    promedioDiario: dias ? Math.round(durante / dias) : 0,
    totalAle,
    pctAle: total ? totalAle / total : 0,
    porSubcategoria: Object.entries(porSubcategoria).sort((a, b) => b[1] - a[1]),
  }
}
