export function formatCLP(amount) {
  if (amount === null || amount === undefined) return '$0'
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('es-CL', { maximumFractionDigits: 0 })
  return amount < 0 ? `-$${formatted}` : `$${formatted}`
}

export function privacyFormat(monto, isPrivate) {
  return isPrivate ? '••••••' : formatCLP(monto)
}

export function formatMes(mesStr) {
  if (!mesStr) return ''
  const [yr, mo] = mesStr.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${meses[parseInt(mo) - 1]} ${yr}`
}

export function formatMesLargo(mesStr) {
  if (!mesStr) return ''
  const [yr, mo] = mesStr.split('-')
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${meses[parseInt(mo) - 1]} ${yr}`
}

export function formatFecha(fechaStr) {
  if (!fechaStr) return ''
  const [, mo, da] = fechaStr.split('-')
  return `${da}/${mo}`
}

export function getMesActual() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}
