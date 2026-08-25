import { getCategoriaPresupuesto, getSubcategoriaPresupuesto } from './mapeo'
import { obtenerDiaDelCiclo, obtenerDuracionCiclo } from './ciclos'

// Gastos pendientes de revisión (ver estado 'pendiente') sin categoría resuelta caen acá en
// vez de desaparecer de los totales por grupo — la plata ya salió de la cuenta, solo falta
// clasificarla. Gastos confirmados sin grupo (p.ej. tipos como Ajuste/Turno/Otro, ver
// mapeo.js) siguen excluidos a propósito — no se tocan.
export const SIN_CLASIFICAR = 'SIN CLASIFICAR'

export function montoReal(g) {
  if (g.monto_presupuesto_manual != null) return g.monto_presupuesto_manual
  if (g.usd > 0 && !g.monto && g.monto_clp_manual) return g.monto_clp_manual
  return g.monto_real ?? g.monto
}

// Importe que impacta el presupuesto. La deuda de tarjeta usa `monto` y no
// este helper: split y en_presupuesto solo modifican el gasto propio.
export function montoPresupuestable(g) {
  if (g.estado === 'descartado' || g.en_presupuesto === false) return 0
  if (g.monto_presupuesto_manual != null) return g.monto_presupuesto_manual
  return Math.max(0, (montoReal(g) || 0) - (g.split || 0))
}

export function esFinanciadoPorFondo(g) {
  return Boolean(g?.financiado_por)
}

// Importe que come el sobre del ciclo (sueldo vs gasto). Los usos de un fondo
// de ahorro ya se apartaron en ciclos anteriores: cuentan en categorías, no acá.
export function montoDelCiclo(g) {
  if (esFinanciadoPorFondo(g)) return 0
  return montoPresupuestable(g)
}

function montoAgregado(g, incluirFinanciados) {
  return incluirFinanciados ? montoPresupuestable(g) : montoDelCiclo(g)
}

export function esGastoUsdPuro(g) {
  return g.usd > 0 && !g.monto && !g.monto_clp_manual
}

export function calcularGastosPorGrupo(gastos, ciclo, opciones = {}) {
  const incluirFinanciados = opciones.incluirFinanciados === true
  return gastos
    .filter(g => g.ciclo_financiero === ciclo)
    .filter(g => !esGastoUsdPuro(g))
    .filter(g => g.estado !== 'descartado' && g.en_presupuesto !== false)
    .reduce((acc, g) => {
      const ctx = g.contexto_override || g.contexto || ''
      const grupo = g.presupuesto_manual?.grupo
        || getCategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
        || (g.estado === 'pendiente' || g.estado === 'error_parseo' ? SIN_CLASIFICAR : null)
      if (!grupo) return acc
      const monto = montoAgregado(g, incluirFinanciados)
      if (!monto) return acc
      acc[grupo] = (acc[grupo] || 0) + monto
      return acc
    }, {})
}

export function calcularTotalMes(gastos, ciclo) {
  return gastos
    .filter(g => g.ciclo_financiero === ciclo)
    .filter(g => !esGastoUsdPuro(g))
    .reduce((sum, g) => sum + montoDelCiclo(g), 0)
}

// Returns all gastos that map to a specific grupo + subcategoria in the given mes
export function getGastosPorSubcategoria(gastos, ciclo, grupo, subcategoria) {
  return gastos
    .filter(g => g.ciclo_financiero === ciclo)
    .filter(g => !esGastoUsdPuro(g))
    .filter(g => g.estado !== 'descartado' && g.en_presupuesto !== false)
    .filter(g => {
      const ctx = g.contexto_override || g.contexto || ''
      const r = g.presupuesto_manual
        || getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
        || (g.estado === 'pendiente' || g.estado === 'error_parseo' ? { grupo: SIN_CLASIFICAR, subcategoria: 'Por revisar' } : null)
      return r && r.grupo === grupo && r.subcategoria === subcategoria
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// Returns { GRUPO: { subcategoria: amount } }
export function calcularGastosPorSubcategoria(gastos, ciclo) {
  const result = {}
  gastos
    .filter(g => g.ciclo_financiero === ciclo)
    .filter(g => !esGastoUsdPuro(g))
    .filter(g => g.estado !== 'descartado' && g.en_presupuesto !== false)
    .forEach(g => {
      const ctx = g.contexto_override || g.contexto || ''
      const r = g.presupuesto_manual
        || getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
        || (g.estado === 'pendiente' || g.estado === 'error_parseo' ? { grupo: SIN_CLASIFICAR, subcategoria: 'Por revisar' } : null)
      if (!r) return
      const { grupo, subcategoria } = r
      const monto = montoDelCiclo(g)
      if (!monto) return
      if (!result[grupo]) result[grupo] = {}
      result[grupo][subcategoria] = (result[grupo][subcategoria] || 0) + monto
    })
  return result
}

export function calcularPrevistoPorGrupo(presupuestoMes) {
  const result = {}
  Object.entries(presupuestoMes?.categorias || {}).forEach(([grupo, gData]) => {
    const total = Object.values(gData.subcategorias || {}).reduce((s, sub) => s + (sub.previsto || 0), 0)
    result[grupo] = total
  })
  return result
}

export function semaforo(real, previsto) {
  if (previsto === 0) return real > 0 ? 'naranja' : 'gris'
  const ratio = real / previsto
  if (ratio <= 0.9) return 'verde'
  if (ratio <= 1.1) return 'amarillo'
  return 'rojo'
}

export function colorSemaforo(estado) {
  switch (estado) {
    case 'verde':    return '#22c55e'
    case 'amarillo': return '#eab308'
    case 'rojo':     return '#ef4444'
    case 'naranja':  return '#f97316'
    default:         return '#64748b'
  }
}

export function calcularTotalIngresos(presupuestoMes) {
  if (!presupuestoMes?.ingresos) return 0
  return Object.values(presupuestoMes.ingresos).reduce((s, v) => s + (v || 0), 0)
}

export function calcularTotalPrevisto(presupuestoMes) {
  if (!presupuestoMes?.categorias) return 0
  let total = 0
  for (const gData of Object.values(presupuestoMes.categorias)) {
    for (const sub of Object.values(gData.subcategorias || {})) {
      total += sub.previsto || 0
    }
  }
  return total
}

export function calcularUltimosMeses(gastos, cicloActual, cantidad = 6) {
  const [yr, mo] = cicloActual.split('-').map(Number)
  const meses = []
  for (let i = cantidad - 1; i >= 0; i--) {
    let m = mo - i
    let y = yr
    while (m <= 0) { m += 12; y-- }
    const mesStr = `${y}-${String(m).padStart(2, '0')}`
    const total = gastos
      .filter(g => g.ciclo_financiero === mesStr && !esGastoUsdPuro(g))
      .reduce((s, g) => s + montoPresupuestable(g), 0)
    meses.push({ mes: mesStr, total })
  }
  return meses
}

export function calcularTendenciaPorGrupo(gastos, cicloActual, cantidad = 6) {
  const [yr, mo] = cicloActual.split('-').map(Number)
  const grupos = new Set()
  const meses = []
  for (let i = cantidad - 1; i >= 0; i--) {
    let m = mo - i, y = yr
    while (m <= 0) { m += 12; y-- }
    const mesStr = `${y}-${String(m).padStart(2, '0')}`
    const porGrupo = calcularGastosPorGrupo(gastos, mesStr, { incluirFinanciados: true })
    Object.keys(porGrupo).forEach(g => grupos.add(g))
    meses.push({ mes: mesStr, ...porGrupo })
  }
  return { meses, grupos: [...grupos].sort() }
}

export function calcularVelocidadDiaria(gastos, ciclo, presupuestoTotal) {
  const diasEnMes = obtenerDuracionCiclo(ciclo)
  const porFecha = {}
  gastos
    .filter(g => g.ciclo_financiero === ciclo && !esGastoUsdPuro(g))
    .forEach(g => {
      const d = obtenerDiaDelCiclo(g.fecha)
      porFecha[d] = (porFecha[d] || 0) + montoDelCiclo(g)
    })
  let acumulado = 0
  return Array.from({ length: diasEnMes }, (_, i) => {
    const dia = i + 1
    acumulado += porFecha[dia] || 0
    return {
      dia,
      label: String(dia),
      acumulado,
      pace: presupuestoTotal > 0 ? Math.round(presupuestoTotal * dia / diasEnMes) : 0,
    }
  })
}

export function calcularGastosPorGrupoDesdeArray(gastosArray) {
  return gastosArray
    .filter(g => !esGastoUsdPuro(g))
    .filter(g => g.estado !== 'descartado' && g.en_presupuesto !== false)
    .reduce((acc, g) => {
      const ctx = g.contexto_override || g.contexto || ''
      const grupo = g.presupuesto_manual?.grupo
        || getCategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
        || (g.estado === 'pendiente' || g.estado === 'error_parseo' ? SIN_CLASIFICAR : null)
      if (!grupo) return acc
      const monto = montoDelCiclo(g)
      if (!monto) return acc
      acc[grupo] = (acc[grupo] || 0) + monto
      return acc
    }, {})
}

export function calcularProyeccionConservadora(gastosArray, presupuestoMes) {
  const realPorGrupo = calcularGastosPorGrupoDesdeArray(gastosArray)
  const previstoPorGrupo = calcularPrevistoPorGrupo(presupuestoMes)
  const grupos = new Set([...Object.keys(realPorGrupo), ...Object.keys(previstoPorGrupo)])
  let total = 0
  for (const grupo of grupos) {
    total += Math.max(realPorGrupo[grupo] || 0, previstoPorGrupo[grupo] || 0)
  }
  return total
}

export function obtenerMesAnterior(mes) {
  const [yr, mo] = mes.split('-').map(Number)
  return mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, '0')}`
}

function promedioArr(valores) {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0
}

// Compara un mes contra el anterior y contra el promedio de los `ventana` meses previos (solo meses con datos).
export function calcularComparadorMensual(gastos, mes, ventana = 6) {
  const mesAnterior = obtenerMesAnterior(mes)
  const actualPorGrupo = calcularGastosPorGrupo(gastos, mes, { incluirFinanciados: true })
  const anteriorPorGrupo = calcularGastosPorGrupo(gastos, mesAnterior, { incluirFinanciados: true })

  const mesesVentana = []
  let m = mes
  for (let i = 0; i < ventana; i++) {
    m = obtenerMesAnterior(m)
    mesesVentana.push(m)
  }
  const mesesConDatos = mesesVentana.filter(mv => gastos.some(g =>
    g.ciclo_financiero === mv && !esGastoUsdPuro(g) && montoPresupuestable(g) !== 0
  ))
  const sumaPorGrupo = {}
  mesesConDatos.forEach(mv => {
    Object.entries(calcularGastosPorGrupo(gastos, mv, { incluirFinanciados: true })).forEach(([grupo, v]) => {
      sumaPorGrupo[grupo] = (sumaPorGrupo[grupo] || 0) + v
    })
  })
  const n = mesesConDatos.length

  const grupos = new Set([
    ...Object.keys(actualPorGrupo),
    ...Object.keys(anteriorPorGrupo),
    ...Object.keys(sumaPorGrupo),
  ])
  const filas = [...grupos]
    .map(grupo => {
      const actual = actualPorGrupo[grupo] || 0
      const anterior = anteriorPorGrupo[grupo] || 0
      const promedio = n > 0 ? (sumaPorGrupo[grupo] || 0) / n : 0
      return {
        grupo,
        actual,
        anterior,
        promedio,
        deltaMes: actual - anterior,
        deltaPromedio: actual - promedio,
      }
    })
    .sort((a, b) => Math.abs(b.deltaPromedio) - Math.abs(a.deltaPromedio))

  return { filas, mesAnterior, mesesPromedio: n }
}

// Dirección de cada categoría: promedio de la mitad reciente de la serie vs la mitad anterior.
export function calcularTendenciasCategorias(gastos, mesHasta, cantidad = 6) {
  const { meses, grupos } = calcularTendenciaPorGrupo(gastos, mesHasta, cantidad)
  const mitad = Math.floor(meses.length / 2)
  return grupos
    .map(grupo => {
      const valores = meses.map(row => row[grupo] || 0)
      const promAnterior = promedioArr(valores.slice(0, mitad))
      const promReciente = promedioArr(valores.slice(mitad))
      const promedio = promedioArr(valores)
      const delta = promReciente - promAnterior
      const pct = promAnterior > 0 ? (delta / promAnterior) * 100 : (promReciente > 0 ? 100 : 0)
      let direccion = 'estable'
      if (pct >= 15 && delta >= 10000) direccion = 'alza'
      else if (pct <= -15 && delta <= -10000) direccion = 'baja'
      return { grupo, valores, promedio, promReciente, promAnterior, delta, pct, direccion }
    })
    .sort((a, b) => b.promedio - a.promedio)
}

// Sum of gastos assigned to a specific grupo/subcategoria, optionally from vinculado.desde onwards.
// Los usos de un fondo (financiado_por) nunca son aportes, aunque caigan en la misma línea.
export function calcularAcumuladoFondo(gastos, vinculado) {
  if (!vinculado) return 0
  return gastos
    .filter(g => !esGastoUsdPuro(g))
    .filter(g => !esFinanciadoPorFondo(g))
    .filter(g => !vinculado.desde || g.ciclo_financiero >= vinculado.desde)
    .reduce((sum, g) => {
      const ctx = g.contexto_override || g.contexto || ''
      const r = g.presupuesto_manual || getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
      if (!r) return sum
      if (r.grupo === vinculado.grupo && r.subcategoria === vinculado.subcategoria) {
        return sum + montoPresupuestable(g)
      }
      return sum
    }, 0)
}

export function montoUsoFondo(g) {
  if (g.estado === 'descartado' || esGastoUsdPuro(g)) return 0
  if (g.monto_presupuesto_manual != null) return g.monto_presupuesto_manual
  return Math.max(0, (montoReal(g) || 0) - (g.split || 0))
}

export function listarUsosFondo(gastos, nombreFondo) {
  return gastos
    .filter(g => g.financiado_por === nombreFondo)
    .filter(g => !esGastoUsdPuro(g) && g.estado !== 'descartado')
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
}

export function calcularUsadoFondo(gastos, nombreFondo) {
  return listarUsosFondo(gastos, nombreFondo).reduce((sum, g) => sum + montoUsoFondo(g), 0)
}

export function calcularSaldoFondo(fondo, nombre, gastos) {
  const aportes = fondo?.vinculado
    ? calcularAcumuladoFondo(gastos, fondo.vinculado)
    : (fondo?.acumulado || 0)
  const usado = calcularUsadoFondo(gastos, nombre)
  return { aportes, usado, saldo: aportes - usado }
}
