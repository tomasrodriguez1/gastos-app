// Vencimientos de las tarjetas (Edwards/BICE): cada gasto impago pertenece a un período que cierra
// el `dia_cierre` y se paga el `dia_pago` siguiente. El fondo de tarjeta (fondo_tarjeta_movimiento)
// es común a ambas tarjetas, así que la cobertura se calcula acumulada por orden de vencimiento:
// lo que vence antes se paga primero con el saldo del fondo.

export const BANCOS_TARJETA = ['Edwards', 'BICE']
// Desde cuántos días antes del vencimiento se avisa un faltante.
export const DIAS_AVISO_VENCIMIENTO = 10
// Tipo de cambio con que se estima un gasto en USD que no tiene monto en pesos (`monto_clp_manual`).
export const TIPO_CAMBIO_USD_DEFAULT = 950

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function numero(valor) {
  if (valor == null || valor === '') return 0
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : 0
}

// Misma regla que monedaGasto en server/tarjeta.js: USD solo si hay dólares y el monto CLP está vacío.
function esUsdPuro(gasto) {
  return numero(gasto.usd) > 0 && numero(gasto.monto) === 0
}

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10)
}

// El "hoy" de quien usa la app (hora local), no el UTC: de noche en Chile ya es mañana en UTC.
export function hoyLocalISO(ahora = new Date()) {
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

export function diasEntre(desdeISO, hastaISO) {
  return Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86400000)
}

export function formatearFechaCorta(fechaISO) {
  const [, mes, dia] = String(fechaISO || '').split('-').map(Number)
  if (!mes || !dia) return ''
  return `${dia} ${MESES[mes - 1]}`
}

// Fecha en que cierra el período al que pertenece un gasto (null si falta fecha o día de cierre).
export function cierreDelPeriodo(fechaISO, diaCierre) {
  const [anio, mes, dia] = String(fechaISO || '').split('-').map(Number)
  if (!anio || !mes || !dia || !diaCierre) return null
  const enMesActual = dia <= diaCierre
  return aISO(new Date(Date.UTC(anio, mes - 1 + (enMesActual ? 0 : 1), diaCierre)))
}

// Primer `diaPago` posterior al cierre: el mismo mes si el pago cae después del cierre (cierre 1,
// pago 12) y el mes siguiente si no (cierre 22, pago 5). Días 1-28, sin problemas de fin de mes.
export function vencimientoDelCierre(cierreISO, diaCierre, diaPago) {
  const [anio, mes] = String(cierreISO || '').split('-').map(Number)
  if (!anio || !mes || !diaCierre || !diaPago) return null
  return aISO(new Date(Date.UTC(anio, mes - 1 + (diaPago > diaCierre ? 0 : 1), diaPago)))
}

export function nivelVencimiento(dias, diasAviso = DIAS_AVISO_VENCIMIENTO) {
  if (dias < 0) return 'vencido'
  return dias <= diasAviso ? 'cerca' : 'lejos'
}

/**
 * Cobertura de la deuda de tarjeta por vencimiento.
 *
 * gastos: gastos de cualquier banco (se filtran los de tarjeta impagos y no descartados).
 * ciclos / diasPago: banco → día de cierre / día de pago.
 * saldoFondoClp: saldo CLP del fondo de tarjeta.
 *
 * Un gasto en USD usa su `monto_clp_manual`; si no lo tiene se estima con `tipoCambioUsd` (950 por
 * defecto) y se cuenta en `usdEstimado`. Los gastos de una tarjeta sin cierre o sin día de pago
 * quedan en `sinFecha`.
 *
 * Devuelve `vencimientos` (por banco y fecha, con deuda, acumulado y faltante), `proximo` (el
 * primero con faltante), `aviso` (ese mismo, solo si está vencido o dentro de la ventana) y
 * `faltanteTotal` (toda la deuda, con o sin fecha, menos el fondo: lo que falta para dejarla cubierta).
 */
export function calcularVencimientosTarjeta({
  gastos = [],
  ciclos = {},
  diasPago = {},
  saldoFondoClp = 0,
  hoyISO = hoyLocalISO(),
  diasAviso = DIAS_AVISO_VENCIMIENTO,
  tipoCambioUsd = TIPO_CAMBIO_USD_DEFAULT,
} = {}) {
  const grupos = new Map()
  const sinFecha = { movimientos: 0, total: 0 }
  const usdEstimado = { movimientos: 0, usd: 0, tipoCambio: numero(tipoCambioUsd) > 0 ? numero(tipoCambioUsd) : null }
  let usdSinConvertir = 0

  for (const gasto of gastos || []) {
    if (!BANCOS_TARJETA.includes(gasto.banco) || gasto.pagado === true || gasto.estado === 'descartado') continue

    let importe
    if (esUsdPuro(gasto)) {
      const propio = numero(gasto.monto_clp_manual)
      if (propio > 0) {
        importe = Math.round(propio)
      } else if (usdEstimado.tipoCambio) {
        importe = Math.round(numero(gasto.usd) * usdEstimado.tipoCambio)
        usdEstimado.movimientos += 1
        usdEstimado.usd += numero(gasto.usd)
      } else {
        usdSinConvertir += 1
        continue
      }
    } else {
      importe = Math.round(numero(gasto.monto))
    }
    if (importe === 0) continue

    const diaCierre = ciclos[gasto.banco]
    const diaPagoBanco = diasPago[gasto.banco]
    const cierre = cierreDelPeriodo(gasto.fecha, diaCierre)
    const fecha = cierre ? vencimientoDelCierre(cierre, diaCierre, diaPagoBanco) : null
    if (!fecha) {
      sinFecha.movimientos += 1
      sinFecha.total += importe
      continue
    }

    const clave = `${fecha}|${gasto.banco}`
    const grupo = grupos.get(clave) || { banco: gasto.banco, fecha, cierre, total: 0, movimientos: 0 }
    grupo.total += importe
    grupo.movimientos += 1
    grupos.set(clave, grupo)
  }

  const saldo = numero(saldoFondoClp)
  let acumulado = 0
  const vencimientos = [...grupos.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.banco.localeCompare(b.banco))
    .map(grupo => {
      acumulado += grupo.total
      const dias = diasEntre(hoyISO, grupo.fecha)
      return {
        ...grupo,
        acumulado,
        faltante: Math.max(0, acumulado - saldo),
        dias,
        nivel: nivelVencimiento(dias, diasAviso),
      }
    })

  const proximo = vencimientos.find(v => v.faltante > 0) || null
  return {
    vencimientos,
    proximo,
    aviso: proximo && proximo.nivel !== 'lejos' ? proximo : null,
    sinFecha,
    usdEstimado: { ...usdEstimado, usd: Math.round(usdEstimado.usd * 100) / 100 },
    usdSinConvertir,
    faltanteTotal: Math.max(0, acumulado + sinFecha.total - saldo),
    saldoFondoClp: saldo,
  }
}
