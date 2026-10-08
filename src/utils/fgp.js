import { getSubcategoriaPresupuesto } from './mapeo'
import { esGastoUsdPuro, montoDelCiclo } from './calculos'
import { obtenerCicloSiguiente } from './ciclos'

// FGP (Fondo Gastos Previstos) como fondo con arrastre: lo que sobra de un ciclo pasa al
// siguiente, y un exceso se come el saldo acumulado. Aporte y gasto se derivan del presupuesto
// de cada ciclo (líneas fgp=true) y de los gastos; el resto viene de fgp_movimiento
// (server/fgp.js). Las líneas FGP se leen ciclo por ciclo: marcar/desmarcar una línea en un
// ciclo no reescribe el historial de los anteriores.

export const BANCOS_TARJETA = ['Edwards', 'BICE']

const clave = (grupo, sub) => `${grupo}\u0000${sub}`

export function lineasFGP(presupuestoCiclo) {
  const lineas = {}
  Object.entries(presupuestoCiclo?.categorias || {}).forEach(([grupo, gData]) => {
    Object.entries(gData?.subcategorias || {}).forEach(([sub, s]) => {
      if (s?.fgp) lineas[clave(grupo, sub)] = { grupo, sub, previsto: s.previsto || 0 }
    })
  })
  return lineas
}

// Ciclos con al menos una línea FGP, hasta el ciclo actual inclusive (los futuros aún no aportan).
export function ciclosFGP(presupuestos, cicloActual) {
  return Object.keys(presupuestos || {})
    .filter(c => c <= cicloActual && Object.keys(lineasFGP(presupuestos[c])).length > 0)
    .sort()
}

function lineaDeGasto(g) {
  const ctx = g.contexto_override || g.contexto || ''
  return g.presupuesto_manual || getSubcategoriaPresupuesto(g.tipos || [], ctx, g.banco || '')
}

function gastoCuenta(g) {
  return !esGastoUsdPuro(g) && g.estado !== 'descartado' && g.en_presupuesto !== false
}

export function sumarMovimientosFGP(movimientos) {
  const tot = { cobertura: 0, deficit: 0, ajuste: 0 }
  for (const m of movimientos || []) if (m.tipo in tot) tot[m.tipo] += m.monto || 0
  return tot
}

export function calcularFondoFGP({ gastos = [], presupuestos = {}, movimientos = [], cicloActual }) {
  const ciclos = ciclosFGP(presupuestos, cicloActual)
  const setCiclos = new Set(ciclos)
  const lineasPorCiclo = Object.fromEntries(ciclos.map(c => [c, lineasFGP(presupuestos[c])]))
  const movidos = new Set(movimientos.filter(m => m.tipo === 'traspaso_tc').map(m => m.gasto_id))

  const gastadoPorCiclo = Object.fromEntries(ciclos.map(c => [c, {}]))
  const pendientesTC = []

  for (const g of gastos) {
    if (!setCiclos.has(g.ciclo_financiero) || !gastoCuenta(g)) continue
    const r = lineaDeGasto(g)
    if (!r) continue
    const k = clave(r.grupo, r.subcategoria)
    if (!lineasPorCiclo[g.ciclo_financiero][k]) continue
    const monto = montoDelCiclo(g)
    if (!monto) continue
    gastadoPorCiclo[g.ciclo_financiero][k] = (gastadoPorCiclo[g.ciclo_financiero][k] || 0) + monto

    // Solo se traspasa a TC un cargo vigente: confirmado, impago y del ciclo actual.
    // El saldo FGP sí conserva el historial de ciclos anteriores; esta cola no.
    // Los locales no tienen fila en `gastos`, por lo que no pueden tener un traspaso registrado.
    if (
      g.ciclo_financiero === cicloActual &&
      BANCOS_TARJETA.includes(g.banco) &&
      g.estado === 'confirmado' &&
      g.pagado !== true &&
      !g.manual &&
      !movidos.has(g.id)
    ) {
      pendientesTC.push({ gasto: g, ciclo: g.ciclo_financiero, grupo: r.grupo, sub: r.subcategoria, monto: Math.round(monto) })
    }
  }

  let arrastre = 0
  const detalleCiclos = ciclos.map(ciclo => {
    const lineas = Object.entries(lineasPorCiclo[ciclo]).map(([k, l]) => {
      const gastado = gastadoPorCiclo[ciclo][k] || 0
      return { ...l, gastado, exceso: Math.max(0, gastado - l.previsto) }
    })
    const previsto = lineas.reduce((s, l) => s + l.previsto, 0)
    const gastado = lineas.reduce((s, l) => s + l.gastado, 0)
    const movsCiclo = sumarMovimientosFGP(movimientos.filter(m => m.ciclo === ciclo))
    const inicial = arrastre
    arrastre = inicial + previsto - gastado + movsCiclo.cobertura + movsCiclo.deficit + movsCiclo.ajuste
    return {
      ciclo,
      previsto,
      gastado,
      resultado: previsto - gastado,
      saldoInicial: inicial,
      saldoFinal: arrastre,
      excesos: lineas.filter(l => l.exceso > 0),
      lineas,
    }
  })

  const tot = sumarMovimientosFGP(movimientos.filter(m => m.ciclo <= cicloActual))
  const aportes = detalleCiclos.reduce((s, c) => s + c.previsto, 0)
  const gastado = detalleCiclos.reduce((s, c) => s + c.gastado, 0)
  pendientesTC.sort((a, b) => (b.gasto.fecha || '').localeCompare(a.gasto.fecha || ''))

  // Un déficit se registra en el ciclo donde ocurrió el exceso y se paga con el sueldo del ciclo
  // siguiente: sigue "vivo" como compromiso mientras ese ciclo no haya pasado.
  const compromisos = {}
  for (const m of movimientos) {
    if (m.tipo !== 'deficit') continue
    const paga = obtenerCicloSiguiente(m.ciclo)
    if (paga >= cicloActual) compromisos[paga] = (compromisos[paga] || 0) + (m.monto || 0)
  }

  return {
    desde: ciclos[0] || null,
    ciclos: detalleCiclos,
    aportes,
    gastado,
    coberturas: tot.cobertura,
    deficits: tot.deficit,
    ajustes: tot.ajuste,
    saldo: aportes - gastado + tot.cobertura + tot.deficit + tot.ajuste,
    pendientesTC,
    totalPendienteTC: pendientesTC.reduce((s, p) => s + p.monto, 0),
    compromisos,
  }
}
