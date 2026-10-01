import { formatCLP } from '../../utils/formatters'

export function formatMontoTarjeta(valor, moneda) {
  if (moneda === 'USD') return `USD ${(valor || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return formatCLP(valor || 0)
}
