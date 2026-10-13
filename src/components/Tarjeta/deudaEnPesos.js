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

export function deudaEnPesos(gastos, { bancos = [], tipoCambio = null } = {}) {
  const tc = numero(tipoCambio) > 0 ? numero(tipoCambio) : null
  const resultado = {
    total: 0,
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
    parcial: false,
    pideTipoCambio: false,
  }

  for (const gasto of gastos || []) {
    if (!bancos.includes(gasto.banco) || gasto.pagado === true || gasto.estado === 'descartado') continue

    if (!esUsdPuro(gasto)) {
      resultado.clp += Math.round(numero(gasto.monto))
      resultado.movimientosClp += 1
      continue
    }

    const usd = numero(gasto.usd)
    const propio = numero(gasto.monto_clp_manual)
    if (propio > 0) {
      resultado.usdPropioClp += Math.round(propio)
      resultado.usdPropioUsd += usd
      resultado.movimientosUsdPropio += 1
      continue
    }

    if (tc) {
      resultado.usdTasaClp += Math.round(usd * tc)
      resultado.usdTasaUsd += usd
      resultado.movimientosUsdTasa += 1
      continue
    }

    resultado.sinConvertir += 1
    resultado.sinConvertirUsd += usd
  }

  resultado.usdPropioUsd = redondearUsd(resultado.usdPropioUsd)
  resultado.usdTasaUsd = redondearUsd(resultado.usdTasaUsd)
  resultado.sinConvertirUsd = redondearUsd(resultado.sinConvertirUsd)
  resultado.total = resultado.clp + resultado.usdPropioClp + resultado.usdTasaClp
  resultado.parcial = resultado.sinConvertir > 0
  resultado.pideTipoCambio = resultado.sinConvertir > 0 || resultado.movimientosUsdTasa > 0
  return resultado
}
