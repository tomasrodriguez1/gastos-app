// Parsea el snippet de notificación de "Compra con Tarjeta de Crédito" del Banco Edwards.
// Formato confirmado con un mail real:
//   "...compra por US$23,80 con Tarjeta de Crédito ****5256 en OPENAI el 06/07/2026 12:40..."
//   "...compra por $12.990 con Tarjeta de Crédito ****5256 en MERCADO TALMA el 26/07/2026 13:40..."
const PATRON_COMPRA = /compra por (US\$|\$)([\d.,]+) con Tarjeta de Crédito \*{4}(\d{4}) en (.+?) el (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/

// "12.990" (CLP, punto = miles, sin decimales) -> 12990
function parseMontoClp(raw) {
  const limpio = raw.replace(/\./g, '').replace(',', '.')
  const valor = Number(limpio)
  return Number.isFinite(valor) ? Math.round(valor) : null
}

// "23,80" (USD, coma = decimal) -> 23.8
function parseMontoUsd(raw) {
  const limpio = raw.replace(/\./g, '').replace(',', '.')
  const valor = Number(limpio)
  return Number.isFinite(valor) ? valor : null
}

export function parseEdwardsCompra(snippet) {
  if (!snippet) return null
  const match = PATRON_COMPRA.exec(snippet)
  if (!match) return null

  const [, moneda, montoRaw, , comercio, dd, mm, yyyy] = match
  const motivo = comercio.trim()
  if (!motivo) return null

  const fecha = `${yyyy}-${mm}-${dd}`

  if (moneda === 'US$') {
    const usd = parseMontoUsd(montoRaw)
    if (usd == null) return null
    return { fecha, motivo, monto: 0, usd }
  }

  const monto = parseMontoClp(montoRaw)
  if (monto == null) return null
  return { fecha, motivo, monto, usd: 0 }
}
