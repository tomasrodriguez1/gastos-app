import { describe, expect, test } from 'bun:test'
import { resolverViajeParaGasto } from './crear.js'

const PERU = { id: 'v1', fecha_desde: '2026-10-01', fecha_hasta: '2026-10-05', estado: 'en_curso' }

function dbFalsa(viajes) {
  return async (strings, ...values) => {
    const consulta = strings.join('?')
    if (consulta.includes('WHERE id =')) return viajes.filter(v => v.id === values[0])
    if (consulta.includes("estado = 'en_curso'")) return viajes.filter(v => v.estado === 'en_curso')
    throw new Error(`Consulta no contemplada: ${consulta}`)
  }
}

describe('resolverViajeParaGasto', () => {
  test('undefined → autodetecta el viaje en curso que cubre la fecha', async () => {
    expect(await resolverViajeParaGasto(undefined, '2026-10-03', dbFalsa([PERU]))).toBe('v1')
    expect(await resolverViajeParaGasto(undefined, '2026-10-09', dbFalsa([PERU]))).toBeNull()
  })

  test('null → sin viaje aunque haya uno en curso', async () => {
    expect(await resolverViajeParaGasto(null, '2026-10-03', dbFalsa([PERU]))).toBeNull()
  })

  test('id explícito → ese viaje si existe, aunque la fecha quede fuera del rango', async () => {
    expect(await resolverViajeParaGasto('v1', '2026-08-01', dbFalsa([PERU]))).toBe('v1')
    expect(await resolverViajeParaGasto('nope', '2026-10-03', dbFalsa([PERU]))).toBeNull()
  })

  test('si la consulta falla, no rompe la creación del gasto', async () => {
    const rota = async () => { throw new Error('relation "viaje" does not exist') }
    expect(await resolverViajeParaGasto(undefined, '2026-10-03', rota)).toBeNull()
  })
})
