/** Convierte NUMERIC de PG (string) a number en el borde de la API. */
export function toMonto(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
