import { describe, expect, test } from 'bun:test'
import { esMedioYaPagado, resolverPagado } from './medioPago.js'

describe('esMedioYaPagado', () => {
  test('efectivo, transferencia y débito quedan pagados', () => {
    for (const banco of ['Efectivo', 'efectivo', 'EFECTIVO', 'Transferencia', 'transferencia bancaria', 'Débito', 'debito', 'Débito BICE', 'cash']) {
      expect(esMedioYaPagado(banco)).toBe(true)
    }
  })

  test('tarjetas y el resto siguen pendientes', () => {
    for (const banco of ['Edwards', 'BICE', 'TC Papa', 'Otro', '', null, '  ']) {
      expect(esMedioYaPagado(banco)).toBe(false)
    }
  })
})

describe('resolverPagado', () => {
  test('un medio al contado pisa un pagado en falso', () => {
    expect(resolverPagado('Transferencia', false)).toBe(true)
    expect(resolverPagado('Efectivo', true)).toBe(true)
  })

  test('en tarjeta respeta lo que vino', () => {
    expect(resolverPagado('Edwards', false)).toBe(false)
    expect(resolverPagado('BICE', true)).toBe(true)
  })
})
