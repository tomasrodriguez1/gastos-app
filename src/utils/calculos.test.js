import { describe, expect, test } from 'bun:test'
import { calcularTotalMes, calcularVelocidadDiaria } from './calculos'

const gasto = (fecha, ciclo_financiero, monto) => ({
  fecha,
  ciclo_financiero,
  monto,
  monto_real: monto,
  usd: 0,
})

describe('cálculos por ciclo financiero', () => {
  const gastos = [
    gasto('2026-07-28', '2026-07', 100),
    gasto('2026-07-29', '2026-08', 200),
    gasto('2026-08-28', '2026-08', 300),
    gasto('2026-08-29', '2026-09', 400),
  ]

  test('los totales usan ciclo_financiero y no mes calendario', () => {
    expect(calcularTotalMes(gastos, '2026-08')).toBe(500)
  })

  test('la velocidad diaria ordena 29 como día 1 y 28 como cierre', () => {
    const serie = calcularVelocidadDiaria(gastos, '2026-08', 3100)
    expect(serie).toHaveLength(31)
    expect(serie[0].acumulado).toBe(200)
    expect(serie.at(-1).acumulado).toBe(500)
    expect(serie.at(-1).pace).toBe(3100)
  })
})
