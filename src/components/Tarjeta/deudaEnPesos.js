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

function cierreDelPeriodo(fechaISO, diaCierre) {
  const [anio, mes, dia] = String(fechaISO || '').split('-').map(Number)
  if (!anio || !mes || !dia || !diaCierre) return null
  const enMesActual = dia <= diaCierre
  const fecha = new Date(Date.UTC(anio, mes - 1 + (enMesActual ? 0 : 1), diaCierre))
  return fecha.toISOString().slice(0, 10)
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

export function deudaEnPesos(gastos, { bancos = [], tipoCambio = null, ciclos = {}, hoyISO = new Date().toISOString().slice(0, 10) } = {}) {
  const tc = numero(tipoCambio) > 0 ? numero(tipoCambio) : null
  const resultado = {
    total: 0,
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
  resultado.total = resultado.clp + resultado.usdPropioClp + resultado.usdTasaClp
  resultado.parcial = resultado.sinConvertir > 0
  resultado.pideTipoCambio = resultado.sinConvertir > 0 || resultado.movimientosUsdTasa > 0
  return resultado
}
