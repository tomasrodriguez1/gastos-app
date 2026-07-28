const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function validarFecha(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) {
    throw new Error(`Fecha inválida: ${fecha || '(vacía)'}`)
  }
  const [year, month, day] = fecha.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Fecha inválida: ${fecha}`)
  }
  return { year, month, day }
}

export function desplazarPeriodo(periodo, desplazamiento) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodo || '')
  if (!match) throw new Error(`Período inválido: ${periodo || '(vacío)'}`)
  const base = Number(match[1]) * 12 + Number(match[2]) - 1 + desplazamiento
  const year = Math.floor(base / 12)
  const month = ((base % 12) + 12) % 12 + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function obtenerCicloFinanciero(fecha) {
  const { year, month, day } = validarFecha(fecha)
  const mesCalendario = `${year}-${String(month).padStart(2, '0')}`
  return day >= 29 ? desplazarPeriodo(mesCalendario, 1) : mesCalendario
}

export function obtenerMesCalendario(fecha) {
  validarFecha(fecha)
  return fecha.slice(0, 7)
}

export function obtenerCicloActual(ahora = new Date()) {
  const fechaLocal = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-')
  return obtenerCicloFinanciero(fechaLocal)
}

export function obtenerCicloAnterior(ciclo) {
  return desplazarPeriodo(ciclo, -1)
}

export function obtenerCicloSiguiente(ciclo) {
  return desplazarPeriodo(ciclo, 1)
}

export function obtenerRangoCiclo(ciclo) {
  const inicioMes = obtenerCicloAnterior(ciclo)
  const [inicioYear, inicioMonth] = inicioMes.split('-').map(Number)
  const tieneDia29 = new Date(Date.UTC(inicioYear, inicioMonth, 0)).getUTCDate() >= 29
  return {
    desde: tieneDia29 ? `${inicioMes}-29` : `${ciclo}-01`,
    hasta: `${ciclo}-28`,
  }
}

export function obtenerDiaDelCiclo(fecha) {
  validarFecha(fecha)
  const ciclo = obtenerCicloFinanciero(fecha)
  const { desde } = obtenerRangoCiclo(ciclo)
  const inicio = new Date(`${desde}T00:00:00Z`)
  const actual = new Date(`${fecha}T00:00:00Z`)
  return Math.floor((actual - inicio) / 86400000) + 1
}

export function obtenerDuracionCiclo(ciclo) {
  const { desde, hasta } = obtenerRangoCiclo(ciclo)
  return Math.floor(
    (new Date(`${hasta}T00:00:00Z`) - new Date(`${desde}T00:00:00Z`)) / 86400000,
  ) + 1
}

export function formatCiclo(ciclo) {
  if (!ciclo) return ''
  const [year, month] = ciclo.split('-').map(Number)
  return `Ciclo ${MESES_LARGOS[month - 1]} ${year}`
}

export function formatRangoCiclo(ciclo) {
  const { desde, hasta } = obtenerRangoCiclo(ciclo)
  const [, mesDesde, diaDesde] = desde.split('-')
  const [, mesHasta, diaHasta] = hasta.split('-')
  const cortos = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(diaDesde)} ${cortos[Number(mesDesde) - 1]} – ${Number(diaHasta)} ${cortos[Number(mesHasta) - 1]}`
}
