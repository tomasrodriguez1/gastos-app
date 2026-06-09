import { getCategoriaPresupuesto, getSubcategoriaPresupuesto } from './mapeo'

export function montoReal(g) {
  if (g.monto_presupuesto_manual != null) return g.monto_presupuesto_manual
  if (g.usd > 0 && !g.monto && g.monto_clp_manual) return g.monto_clp_manual
  return g.monto_real ?? g.monto
}

export function esGastoUsdPuro(g) {
  return g.usd > 0 && !g.monto && !g.monto_clp_manual
}

export function calcularGastosPorGrupo(gastos, mes) {
  return gastos
    .filter(g => g.mes === mes)
    .filter(g => !esGastoUsdPuro(g))
    .reduce((acc, g) => {
      const ctx = g.contexto_override || g.contexto || ''
      const grupo = g.presupuesto_manual?.grupo || getCategoriaPresupuesto(g.tipos || [], ctx)
      if (!grupo) return acc
      acc[grupo] = (acc[grupo] || 0) + montoReal(g)
      return acc
    }, {})
}

export function calcularTotalMes(gastos, mes) {
  return gastos
    .filter(g => g.mes === mes)
    .filter(g => !esGastoUsdPuro(g))
    .reduce((sum, g) => sum + montoReal(g), 0)
}

// Returns all gastos that map to a specific grupo + subcategoria in the given mes
export function getGastosPorSubcategoria(gastos, mes, grupo, subcategoria) {
  return gastos
    .filter(g => g.mes === mes)
    .filter(g => !esGastoUsdPuro(g))
    .filter(g => {
      const ctx = g.contexto_override || g.contexto || ''
      const r = g.presupuesto_manual || getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
      return r && r.grupo === grupo && r.subcategoria === subcategoria
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// Returns { GRUPO: { subcategoria: amount } }
export function calcularGastosPorSubcategoria(gastos, mes) {
  const result = {}
  gastos
    .filter(g => g.mes === mes)
    .filter(g => !esGastoUsdPuro(g))
    .forEach(g => {
      const ctx = g.contexto_override || g.contexto || ''
      const r = g.presupuesto_manual || getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
      if (!r) return
      const { grupo, subcategoria } = r
      if (!result[grupo]) result[grupo] = {}
      result[grupo][subcategoria] = (result[grupo][subcategoria] || 0) + montoReal(g)
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

export function calcularUltimosMeses(gastos, mesActual, cantidad = 6) {
  const [yr, mo] = mesActual.split('-').map(Number)
  const meses = []
  for (let i = cantidad - 1; i >= 0; i--) {
    let m = mo - i
    let y = yr
    while (m <= 0) { m += 12; y-- }
    const mesStr = `${y}-${String(m).padStart(2, '0')}`
    const total = gastos
      .filter(g => g.mes === mesStr && !esGastoUsdPuro(g))
      .reduce((s, g) => s + montoReal(g), 0)
    meses.push({ mes: mesStr, total })
  }
  return meses
}

export function calcularTendenciaPorGrupo(gastos, mesActual, cantidad = 6) {
  const [yr, mo] = mesActual.split('-').map(Number)
  const grupos = new Set()
  const meses = []
  for (let i = cantidad - 1; i >= 0; i--) {
    let m = mo - i, y = yr
    while (m <= 0) { m += 12; y-- }
    const mesStr = `${y}-${String(m).padStart(2, '0')}`
    const porGrupo = calcularGastosPorGrupo(gastos, mesStr)
    Object.keys(porGrupo).forEach(g => grupos.add(g))
    meses.push({ mes: mesStr, ...porGrupo })
  }
  return { meses, grupos: [...grupos].sort() }
}

export function calcularVelocidadDiaria(gastos, mes, presupuestoTotal) {
  const [yr, mo] = mes.split('-').map(Number)
  const diasEnMes = new Date(yr, mo, 0).getDate()
  const porFecha = {}
  gastos
    .filter(g => g.mes === mes && !esGastoUsdPuro(g))
    .forEach(g => {
      const d = parseInt(g.fecha.split('-')[2])
      porFecha[d] = (porFecha[d] || 0) + montoReal(g)
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
    .reduce((acc, g) => {
      const ctx = g.contexto_override || g.contexto || ''
      const grupo = g.presupuesto_manual?.grupo || getCategoriaPresupuesto(g.tipos || [], ctx)
      if (!grupo) return acc
      acc[grupo] = (acc[grupo] || 0) + montoReal(g)
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

// Sum of gastos assigned to a specific grupo/subcategoria, optionally from vinculado.desde onwards.
export function calcularAcumuladoFondo(gastos, vinculado) {
  if (!vinculado) return 0
  return gastos
    .filter(g => !esGastoUsdPuro(g))
    .filter(g => !vinculado.desde || g.mes >= vinculado.desde)
    .reduce((sum, g) => {
      const ctx = g.contexto_override || g.contexto || ''
      const r = g.presupuesto_manual || getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
      if (!r) return sum
      if (r.grupo === vinculado.grupo && r.subcategoria === vinculado.subcategoria) {
        return sum + montoReal(g)
      }
      return sum
    }, 0)
}
