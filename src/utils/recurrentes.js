import { montoReal, esGastoUsdPuro } from './calculos'
import { getCategoriaPresupuesto } from './mapeo'
import { obtenerCicloActual, obtenerDiaDelCiclo } from './ciclos'

// Misma normalización que server/duplicados.js
function normalizarMotivo(motivo) {
  if (!motivo) return ''
  return motivo
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function mediana(valores) {
  if (!valores.length) return 0
  const s = [...valores].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// mesB - mesA en meses (strings YYYY-MM)
function diffMeses(mesA, mesB) {
  const [ay, am] = mesA.split('-').map(Number)
  const [by, bm] = mesB.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

const MESES_MINIMOS = 3            // meses distintos con el mismo cargo para considerarlo recurrente
const MAX_CARGOS_POR_MES = 2       // más que esto es gasto frecuente (ej. supermercado), no suscripción
const PRESENCIA_MINIMA = 0.6       // fracción de meses cubiertos entre el primer y último cobro
const DESVIO_MONTO_MAX = 0.25      // desvío relativo mediano permitido (salvo tipo Suscripcion)
const MESES_INACTIVO = 2           // sin cobros hace más de esto ⇒ se considera cancelado y se omite
const MARGEN_DIAS_ESPERA = 5       // días después del día típico antes de marcar "no llegó"

// Detecta cargos que se repiten mes a mes (suscripciones, cuentas fijas).
// Devuelve { recurrentes: [...], totalMensual } ordenado por monto descendente.
export function detectarRecurrentes(gastos, mesActual = obtenerCicloActual()) {
  const porMotivo = new Map()
  for (const g of gastos) {
    if (!g.motivo || !g.ciclo_financiero || !g.fecha || esGastoUsdPuro(g)) continue
    const clave = normalizarMotivo(g.motivo)
    if (clave.length < 3) continue
    if (!porMotivo.has(clave)) porMotivo.set(clave, [])
    porMotivo.get(clave).push(g)
  }

  const recurrentes = []

  for (const [clave, items] of porMotivo.entries()) {
    const porMes = {}
    for (const g of items) {
      if (!porMes[g.ciclo_financiero]) porMes[g.ciclo_financiero] = []
      porMes[g.ciclo_financiero].push(g)
    }
    const mesesPresentes = Object.keys(porMes).sort()
    if (mesesPresentes.length < MESES_MINIMOS) continue
    if (Math.max(...Object.values(porMes).map(a => a.length)) > MAX_CARGOS_POR_MES) continue

    const primero = mesesPresentes[0]
    const ultimoMes = mesesPresentes[mesesPresentes.length - 1]
    const span = diffMeses(primero, ultimoMes) + 1
    if (mesesPresentes.length / span < PRESENCIA_MINIMA) continue
    if (diffMeses(ultimoMes, mesActual) > MESES_INACTIVO) continue

    const cargos = [...items].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const montos = cargos.map(montoReal).filter(v => v > 0)
    if (montos.length < MESES_MINIMOS) continue
    const montoMediana = mediana(montos)
    if (montoMediana <= 0) continue

    const esSuscripcionTipo = items.some(g => (g.tipos || []).includes('Suscripcion'))
    const desvioRel = mediana(montos.map(v => Math.abs(v - montoMediana) / montoMediana))
    if (!esSuscripcionTipo && desvioRel > DESVIO_MONTO_MAX) continue

    const ultimoCargo = cargos[cargos.length - 1]
    const montoUltimo = montoReal(ultimoCargo)
    const previos = cargos.slice(0, -1).map(montoReal).filter(v => v > 0)
    const promedioPrevio = previos.length ? previos.reduce((a, b) => a + b, 0) / previos.length : montoUltimo
    const variacionPct = promedioPrevio > 0 ? ((montoUltimo - promedioPrevio) / promedioPrevio) * 100 : 0

    const diaTipico = Math.round(mediana(cargos.map(g => obtenerDiaDelCiclo(g.fecha))))
    const cobradoEsteMes = Boolean(porMes[mesActual])
    const hoy = new Date()
    const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const diaHoy = obtenerDiaDelCiclo(fechaHoy)
    let estado = 'cobrado'
    if (!cobradoEsteMes) estado = diaHoy <= diaTipico + MARGEN_DIAS_ESPERA ? 'esperado' : 'atrasado'

    const conteoNombres = {}
    for (const g of items) {
      const nombre = g.motivo.trim()
      conteoNombres[nombre] = (conteoNombres[nombre] || 0) + 1
    }
    const nombre = Object.entries(conteoNombres).sort((a, b) => b[1] - a[1])[0][0]

    const ctx = ultimoCargo.contexto_override || ultimoCargo.contexto || ''
    const grupo = ultimoCargo.presupuesto_manual?.grupo
      || getCategoriaPresupuesto(ultimoCargo.tipos || [], ctx)
      || null

    recurrentes.push({
      clave,
      nombre,
      grupo,
      mesesPresentes,
      montoMediana,
      montoUltimo,
      promedioPrevio,
      variacionPct,
      subio: variacionPct >= 5 && montoUltimo - promedioPrevio >= 500,
      bajo: variacionPct <= -5 && promedioPrevio - montoUltimo >= 500,
      diaTipico,
      ultimaFecha: ultimoCargo.fecha,
      cobradoEsteMes,
      estado,
      esSuscripcionTipo,
    })
  }

  recurrentes.sort((a, b) => b.montoMediana - a.montoMediana)
  const totalMensual = recurrentes.reduce((s, r) => s + r.montoMediana, 0)
  return { recurrentes, totalMensual }
}
