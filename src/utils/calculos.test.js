import { describe, expect, test } from 'bun:test'
import {
  calcularGastosPorGrupo,
  calcularSaldoFondo,
  calcularTotalMes,
  calcularVelocidadDiaria,
  montoDelCiclo,
  montoPresupuestable,
  SIN_CLASIFICAR,
} from './calculos'

const gasto = (fecha, ciclo_financiero, monto, extra = {}) => ({
  fecha,
  ciclo_financiero,
  monto,
  monto_real: monto,
  usd: 0,
  ...extra,
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

  test('montoPresupuestable excluye, resta split y respeta el override manual', () => {
    expect(montoPresupuestable({ monto_real: 1000, split: 300 })).toBe(700)
    expect(montoPresupuestable({ monto_real: 1000, split: 300, monto_presupuesto_manual: 250 })).toBe(250)
    expect(montoPresupuestable({ monto_real: 1000, en_presupuesto: false })).toBe(0)
    expect(montoPresupuestable({ monto_real: 1000, estado: 'descartado' })).toBe(0)
  })

  test('pendientes y errores con monto quedan sin clasificar, salvo si no cuentan en presupuesto', () => {
    const base = { fecha: '2026-08-10', ciclo_financiero: '2026-08', monto: 100, monto_real: 100, usd: 0, tipos: [] }
    const resultado = calcularGastosPorGrupo([
      { ...base, estado: 'pendiente' },
      { ...base, estado: 'error_parseo', monto: 200, monto_real: 200 },
      { ...base, estado: 'pendiente', en_presupuesto: false, monto: 500, monto_real: 500 },
    ], '2026-08')
    expect(resultado[SIN_CLASIFICAR]).toBe(300)
  })
})

describe('uso de fondos de ahorro', () => {
  test('montoDelCiclo excluye gastos financiados por un fondo', () => {
    expect(montoDelCiclo({ monto_real: 800, financiado_por: 'Viajes' })).toBe(0)
    expect(montoDelCiclo({ monto_real: 800 })).toBe(800)
  })

  test('el total del ciclo no come sueldo cuando el gasto sale del fondo', () => {
    const gastos = [
      gasto('2026-08-10', '2026-08', 100),
      gasto('2026-08-12', '2026-08', 800, { financiado_por: 'Viajes' }),
    ]
    expect(calcularTotalMes(gastos, '2026-08')).toBe(100)
  })

  test('las categorías del ciclo excluyen el uso; el análisis puede incluirlo', () => {
    const gastos = [
      gasto('2026-08-12', '2026-08', 800, {
        financiado_por: 'Viajes',
        presupuesto_manual: { grupo: 'ALE', subcategoria: 'Pasajes' },
      }),
    ]
    expect(calcularGastosPorGrupo(gastos, '2026-08').ALE).toBeUndefined()
    expect(calcularGastosPorGrupo(gastos, '2026-08', { incluirFinanciados: true }).ALE).toBe(800)
  })

  test('el saldo de un fondo manual resta los usos sin tocar el acumulado', () => {
    const fondo = { acumulado: 1_200_000, objetivo: 1_200_000 }
    const gastos = [gasto('2026-08-12', '2026-08', 800_000, { financiado_por: 'Viajes' })]
    expect(calcularSaldoFondo(fondo, 'Viajes', gastos)).toEqual({
      aportes: 1_200_000,
      usado: 800_000,
      saldo: 400_000,
    })
  })

  test('un uso no cuenta como aporte aunque caiga en la línea vinculada', () => {
    const fondo = {
      vinculado: { grupo: 'ALE', subcategoria: 'Ahorro Viajes Próximos' },
    }
    const gastos = [
      gasto('2026-07-05', '2026-07', 50_000, {
        presupuesto_manual: { grupo: 'ALE', subcategoria: 'Ahorro Viajes Próximos' },
      }),
      gasto('2026-08-12', '2026-08', 50_000, {
        financiado_por: 'Viajes',
        presupuesto_manual: { grupo: 'ALE', subcategoria: 'Ahorro Viajes Próximos' },
      }),
    ]
    expect(calcularSaldoFondo(fondo, 'Viajes', gastos)).toEqual({
      aportes: 50_000,
      usado: 50_000,
      saldo: 0,
    })
  })
})
