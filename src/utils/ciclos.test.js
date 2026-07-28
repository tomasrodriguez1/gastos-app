import { describe, expect, test } from 'bun:test'
import {
  obtenerCicloActual,
  obtenerCicloAnterior,
  obtenerCicloFinanciero,
  obtenerCicloSiguiente,
  obtenerDiaDelCiclo,
  obtenerDuracionCiclo,
  obtenerRangoCiclo,
} from './ciclos'

describe('ciclos financieros 29–28', () => {
  test.each([
    ['2026-07-28', '2026-07'],
    ['2026-07-29', '2026-08'],
    ['2026-07-31', '2026-08'],
    ['2026-08-01', '2026-08'],
    ['2026-08-28', '2026-08'],
    ['2026-12-29', '2027-01'],
  ])('%s pertenece a %s', (fecha, ciclo) => {
    expect(obtenerCicloFinanciero(fecha)).toBe(ciclo)
  })

  test('calcula ciclo actual en fecha local', () => {
    expect(obtenerCicloActual(new Date(2026, 6, 29, 12))).toBe('2026-08')
  })

  test('navega entre ciclos y años', () => {
    expect(obtenerCicloAnterior('2026-01')).toBe('2025-12')
    expect(obtenerCicloSiguiente('2026-12')).toBe('2027-01')
  })

  test('expone rango y día relativo del ciclo', () => {
    expect(obtenerRangoCiclo('2026-08')).toEqual({
      desde: '2026-07-29',
      hasta: '2026-08-28',
    })
    expect(obtenerDiaDelCiclo('2026-07-29')).toBe(1)
    expect(obtenerDiaDelCiclo('2026-08-28')).toBe(31)
  })

  test('resuelve febrero sin inventar el día 29', () => {
    expect(obtenerRangoCiclo('2026-03')).toEqual({
      desde: '2026-03-01',
      hasta: '2026-03-28',
    })
    expect(obtenerDiaDelCiclo('2026-03-01')).toBe(1)
    expect(obtenerDuracionCiclo('2026-03')).toBe(28)
    expect(obtenerRangoCiclo('2024-03').desde).toBe('2024-02-29')
  })
})
