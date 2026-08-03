import { describe, expect, test } from 'bun:test'
import { normalizarComercio } from './comercio'

describe('normalizarComercio', () => {
  test('mayúsculas, tildes y espacios', () => {
    expect(normalizarComercio('  Café Altura  ')).toBe('CAFE ALTURA')
  })

  test('quita prefijo de adquirente con asterisco', () => {
    expect(normalizarComercio('SUMUP *CAFE ALTURA')).toBe('CAFE ALTURA')
  })

  test('colapsa variante con adquirente y sufijo numérico a la misma clave', () => {
    expect(normalizarComercio('SUMUP *CAFE ALTURA 4471')).toBe('CAFE ALTURA')
    expect(normalizarComercio('CAFE ALTURA')).toBe('CAFE ALTURA')
  })

  test('quita otros prefijos de adquirente conocidos', () => {
    expect(normalizarComercio('MERPAGO*ALMACEN DON JOSE')).toBe('ALMACEN DON JOSE')
    expect(normalizarComercio('MPAGO*KIOSKO CENTRAL')).toBe('KIOSKO CENTRAL')
    expect(normalizarComercio('PAYU *TIENDA ONLINE')).toBe('TIENDA ONLINE')
    expect(normalizarComercio('TRANSBANK COMERCIO XYZ')).toBe('COMERCIO XYZ')
  })

  test('no colapsa comercios distintos', () => {
    expect(normalizarComercio('UBER *TRIP')).not.toBe(normalizarComercio('UBER EATS'))
  })

  test('caracteres no alfanuméricos colapsan a espacio', () => {
    expect(normalizarComercio('McDonald´s - Providencia')).toBe('MCDONALD S PROVIDENCIA')
  })

  test('vacío o inválido devuelve string vacío', () => {
    expect(normalizarComercio('')).toBe('')
    expect(normalizarComercio(null)).toBe('')
    expect(normalizarComercio(undefined)).toBe('')
  })

  test('sufijo numérico corto de código de sucursal se quita', () => {
    expect(normalizarComercio('Farmacia Cruz Verde 123')).toBe('FARMACIA CRUZ VERDE')
  })
})
