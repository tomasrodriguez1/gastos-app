import { describe, expect, test } from 'bun:test'
import {
  cicloIngresoDeClase,
  mesClasesDeCiclo,
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

describe('ingreso de clases particulares (DEC-021)', () => {
  test('las clases del mes M son ingreso del ciclo M+1, sin importar el día', () => {
    expect(cicloIngresoDeClase('2026-10-01')).toBe('2026-11')
    expect(cicloIngresoDeClase('2026-10-28')).toBe('2026-11')
    // El 29–31 ya es del ciclo siguiente para gastos, pero la clase sigue siendo "de octubre".
    expect(cicloIngresoDeClase('2026-10-31')).toBe('2026-11')
    expect(cicloIngresoDeClase('2026-12-15')).toBe('2027-01')
    expect(() => cicloIngresoDeClase('2026-02-30')).toThrow()
  })

  test('mesClasesDeCiclo es el inverso', () => {
    expect(mesClasesDeCiclo('2026-11')).toBe('2026-10')
    expect(mesClasesDeCiclo('2027-01')).toBe('2026-12')
  })
})
