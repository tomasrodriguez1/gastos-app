// Normalización de comercios para la memoria de comercio_mapeo (F2). Módulo
// puro, sin dependencias — se importa tanto desde src/ como desde server/
// (mismo patrón que src/utils/ciclos.js).
//
// Criterio deliberadamente conservador: un falso negativo (dos variantes del
// mismo comercio que no colapsan) solo cuesta una llamada de más al LLM; un
// falso positivo (dos comercios distintos que colapsan) clasifica mal un
// gasto real. Ante la duda, no colapsar.

// Prefijos de adquirente/pasarela de pago que anteponen su propio nombre al
// del comercio real.
const PREFIJOS_ADQUIRENTE = [
  'SUMUP',
  'MERPAGO',
  'MPAGO',
  'PAYU',
  'DL',
  'TRANSBANK',
]

export function normalizarComercio(motivo) {
  if (!motivo || typeof motivo !== 'string') return ''

  let texto = motivo
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar tildes/diacríticos

  for (const prefijo of PREFIJOS_ADQUIRENTE) {
    const regex = new RegExp(`^${prefijo}\\s*\\*?\\s*`)
    texto = texto.replace(regex, '')
  }

  texto = texto
    .replace(/\s+\d{2,}$/, '') // sufijo numérico suelto (sucursal, terminal)
    .replace(/[^A-Z0-9]+/g, ' ') // no-alfanumérico -> espacio
    .replace(/\s+/g, ' ')
    .trim()

  return texto
}
