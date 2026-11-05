import { cierreDelPeriodo } from '../../utils/vencimientosTarjeta'

function numero(valor) {
  if (valor == null || valor === '') return 0
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : 0
}

function redondearUsd(valor) {
  return Math.round(valor * 100) / 100
}

// Misma regla que monedaGasto en server/tarjeta.js: USD solo si hay dólares y el monto CLP está vacío.
function esUsdPuro(gasto) {
  return numero(gasto.usd) > 0 && numero(gasto.monto) === 0
}

function estaFacturado(gasto, ciclos, hoyISO) {
  const cierre = cierreDelPeriodo(gasto.fecha, ciclos?.[gasto.banco])
  return cierre != null && cierre <= hoyISO
}

export function fondoEnPesos(saldos, tipoCambio) {
  const clp = Math.round(numero(saldos?.CLP))
  const usd = redondearUsd(numero(saldos?.USD))
  const tc = numero(tipoCambio) > 0 ? numero(tipoCambio) : null
  const usdClp = tc ? Math.round(usd * tc) : 0
  return {
    total: clp + usdClp,
    clp,
    usd,
    usdClp,
    usdSinConvertir: usd !== 0 && !tc,
  }
}

// Suma los saldos de abonos (banco → { CLP, USD }) de los bancos pedidos.
export function saldoAbonos(saldos, bancos) {
  const suma = { CLP: 0, USD: 0 }
  for (const banco of bancos || []) {
    suma.CLP += Math.max(0, numero(saldos?.[banco]?.CLP))
    suma.USD += Math.max(0, numero(saldos?.[banco]?.USD))
  }
  suma.USD = redondearUsd(suma.USD)
  return suma
}

// `abonos` = { CLP, USD }: saldo de abonos sin aplicar de esos bancos. Baja la deuda de cada moneda
// (nunca bajo cero) y el sobrante queda como saldo a favor. Los USD abonados descuentan en la misma
// proporción su equivalente en pesos, sea propio o por tasa.
export function deudaEnPesos(gastos, { bancos = [], tipoCambio = null, ciclos = {}, abonos = null, hoyISO = new Date().toISOString().slice(0, 10) } = {}) {
  const tc = numero(tipoCambio) > 0 ? numero(tipoCambio) : null
  const resultado = {
    total: 0,
    abonadoClp: 0,
    abonadoUsd: 0,
    facturado: 0,
    clp: 0,
    usdPropioClp: 0,
    usdPropioUsd: 0,
    usdTasaClp: 0,
    usdTasaUsd: 0,
    sinConvertir: 0,
    sinConvertirUsd: 0,
    movimientosClp: 0,
    movimientosUsdPropio: 0,
    movimientosUsdTasa: 0,
    usd: 0,
    movimientosUsd: 0,
    parcial: false,
    pideTipoCambio: false,
  }

  for (const gasto of gastos || []) {
    if (!bancos.includes(gasto.banco) || gasto.pagado === true || gasto.estado === 'descartado') continue

    const sumar = importe => {
      if (estaFacturado(gasto, ciclos, hoyISO)) resultado.facturado += importe
    }

    if (!esUsdPuro(gasto)) {
      const importe = Math.round(numero(gasto.monto))
      resultado.clp += importe
      resultado.movimientosClp += 1
      sumar(importe)
      continue
    }

    const usd = numero(gasto.usd)
    const propio = numero(gasto.monto_clp_manual)
    if (propio > 0) {
      const importe = Math.round(propio)
      resultado.usdPropioClp += importe
      resultado.usdPropioUsd += usd
      resultado.movimientosUsdPropio += 1
      sumar(importe)
      continue
    }

    if (tc) {
      const importe = Math.round(usd * tc)
      resultado.usdTasaClp += importe
      resultado.usdTasaUsd += usd
      resultado.movimientosUsdTasa += 1
      sumar(importe)
      continue
    }

    resultado.sinConvertir += 1
    resultado.sinConvertirUsd += usd
  }

  resultado.usdPropioUsd = redondearUsd(resultado.usdPropioUsd)
  resultado.usdTasaUsd = redondearUsd(resultado.usdTasaUsd)
  resultado.sinConvertirUsd = redondearUsd(resultado.sinConvertirUsd)
  const totalBruto = resultado.clp + resultado.usdPropioClp + resultado.usdTasaClp

  const abonoClp = Math.min(Math.max(0, Math.round(numero(abonos?.CLP))), resultado.clp)
  resultado.abonadoClp = abonoClp
  resultado.clp -= abonoClp

  const usdBruto = redondearUsd(resultado.usdPropioUsd + resultado.usdTasaUsd + resultado.sinConvertirUsd)
  const abonoUsd = Math.min(Math.max(0, redondearUsd(numero(abonos?.USD))), usdBruto)
  if (abonoUsd > 0) {
    const factor = (usdBruto - abonoUsd) / usdBruto
    resultado.abonadoUsd = abonoUsd
    resultado.usdPropioClp = Math.round(resultado.usdPropioClp * factor)
    resultado.usdTasaClp = Math.round(resultado.usdTasaClp * factor)
    resultado.usdPropioUsd = redondearUsd(resultado.usdPropioUsd * factor)
    resultado.usdTasaUsd = redondearUsd(resultado.usdTasaUsd * factor)
    resultado.sinConvertirUsd = redondearUsd(resultado.sinConvertirUsd * factor)
    // Con todo el USD abonado ya no hay nada que convertir, aunque los movimientos sigan pendientes.
    if (factor === 0) resultado.sinConvertir = 0
  }

  resultado.total = resultado.clp + resultado.usdPropioClp + resultado.usdTasaClp
  // Los abonos pagan primero lo más antiguo: bajan lo facturado antes que lo no facturado.
  resultado.facturado = Math.max(0, resultado.facturado - (totalBruto - resultado.total))
  resultado.usd = redondearUsd(resultado.usdPropioUsd + resultado.usdTasaUsd + resultado.sinConvertirUsd)
  resultado.movimientosUsd = resultado.movimientosUsdPropio + resultado.movimientosUsdTasa + resultado.sinConvertir
  resultado.parcial = resultado.sinConvertir > 0
  resultado.pideTipoCambio = resultado.sinConvertir > 0 || resultado.movimientosUsdTasa > 0
  return resultado
}
