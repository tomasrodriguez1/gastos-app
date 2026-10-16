import { describe, expect, test } from 'bun:test'
import {
  calcularVencimientosTarjeta,
  cierreDelPeriodo,
  hoyLocalISO,
  nivelVencimiento,
  vencimientoDelCierre,
} from './vencimientosTarjeta'

const gasto = (id, banco, fecha, monto, extra = {}) => ({ id, banco, fecha, monto, usd: 0, estado: 'confirmado', ...extra })

describe('vencimientoDelCierre', () => {
  test('cierre 22 y pago 5: vence el 5 del mes siguiente', () => {
    expect(vencimientoDelCierre('2026-10-22', 22, 5)).toBe('2026-11-05')
  })

  test('cierre 1 y pago 12: vence el mismo mes', () => {
    expect(vencimientoDelCierre('2026-11-01', 1, 12)).toBe('2026-11-12')
  })

  test('cruza el fin de año', () => {
    expect(vencimientoDelCierre('2026-12-22', 22, 5)).toBe('2027-01-05')
  })

  test('sin cierre o sin pago no hay vencimiento', () => {
    expect(vencimientoDelCierre('2026-10-22', 22, null)).toBeNull()
    expect(vencimientoDelCierre('2026-10-22', undefined, 5)).toBeNull()
  })
})

describe('cierreDelPeriodo', () => {
  test('un gasto después del cierre cae en el período siguiente', () => {
    expect(cierreDelPeriodo('2026-10-22', 22)).toBe('2026-10-22')
    expect(cierreDelPeriodo('2026-10-23', 22)).toBe('2026-11-22')
    expect(cierreDelPeriodo('2026-10-23', null)).toBeNull()
  })
})

describe('nivelVencimiento', () => {
  test('lejos, cerca y vencido', () => {
    expect(nivelVencimiento(11)).toBe('lejos')
    expect(nivelVencimiento(10)).toBe('cerca')
    expect(nivelVencimiento(0)).toBe('cerca')
    expect(nivelVencimiento(-1)).toBe('vencido')
  })
})

describe('hoyLocalISO', () => {
  test('usa la fecha local, no la UTC', () => {
    expect(hoyLocalISO(new Date(2026, 9, 16, 23, 30))).toBe('2026-10-16')
  })
})

describe('calcularVencimientosTarjeta', () => {
  const ciclos = { Edwards: 22, BICE: 1 }
  const diasPago = { Edwards: 5, BICE: 12 }

  test('agrupa por tarjeta y vencimiento y acumula la deuda en orden de fecha', () => {
    const gastos = [
      gasto('a', 'Edwards', '2026-10-10', 100000), // cierra 22 oct, vence 5 nov
      gasto('b', 'Edwards', '2026-10-15', 50000),
      gasto('c', 'BICE', '2026-10-20', 30000), // cierra 1 nov, vence 12 nov
      gasto('d', 'Edwards', '2026-10-25', 20000), // cierra 22 nov, vence 5 dic
    ]
    const r = calcularVencimientosTarjeta({ gastos, ciclos, diasPago, saldoFondoClp: 0, hoyISO: '2026-10-16' })
    expect(r.vencimientos.map(v => [v.banco, v.fecha, v.total, v.acumulado])).toEqual([
      ['Edwards', '2026-11-05', 150000, 150000],
      ['BICE', '2026-11-12', 30000, 180000],
      ['Edwards', '2026-12-05', 20000, 200000],
    ])
  })

  test('el fondo es común: cubre primero lo que vence antes y el faltante es acumulado', () => {
    const gastos = [
      gasto('a', 'Edwards', '2026-10-10', 100000),
      gasto('b', 'BICE', '2026-10-20', 60000),
    ]
    const r = calcularVencimientosTarjeta({ gastos, ciclos, diasPago, saldoFondoClp: 120000, hoyISO: '2026-10-16' })
    expect(r.vencimientos.map(v => v.faltante)).toEqual([0, 40000])
    expect(r.proximo).toMatchObject({ banco: 'BICE', fecha: '2026-11-12', faltante: 40000 })
  })

  test('sin faltante no hay próximo ni aviso', () => {
    const r = calcularVencimientosTarjeta({ gastos: [gasto('a', 'Edwards', '2026-10-10', 100000)], ciclos, diasPago, saldoFondoClp: 100000, hoyISO: '2026-11-04' })
    expect(r.proximo).toBeNull()
    expect(r.aviso).toBeNull()
  })

  test('el aviso salta solo dentro de la ventana o vencido', () => {
    const gastos = [gasto('a', 'Edwards', '2026-10-10', 100000)]
    const en = hoyISO => calcularVencimientosTarjeta({ gastos, ciclos, diasPago, saldoFondoClp: 0, hoyISO })
    const lejos = en('2026-10-16') // 20 días
    expect(lejos.proximo.nivel).toBe('lejos')
    expect(lejos.aviso).toBeNull()
    expect(en('2026-10-26').aviso).toMatchObject({ nivel: 'cerca', dias: 10, faltante: 100000 })
    expect(en('2026-11-05').aviso).toMatchObject({ nivel: 'cerca', dias: 0 })
    expect(en('2026-11-06').aviso).toMatchObject({ nivel: 'vencido', dias: -1 })
  })

  test('ignora pagados, descartados y otros bancos', () => {
    const gastos = [
      gasto('a', 'Edwards', '2026-10-10', 100000, { pagado: true }),
      gasto('b', 'Edwards', '2026-10-10', 100000, { estado: 'descartado' }),
      gasto('c', 'Santander', '2026-10-10', 100000),
      gasto('d', 'Edwards', '2026-10-10', 7000),
    ]
    const r = calcularVencimientosTarjeta({ gastos, ciclos, diasPago, hoyISO: '2026-10-16' })
    expect(r.vencimientos).toHaveLength(1)
    expect(r.vencimientos[0].total).toBe(7000)
  })

  test('una tarjeta sin día de pago o sin cierre queda en sinFecha', () => {
    const gastos = [gasto('a', 'Edwards', '2026-10-10', 100000), gasto('b', 'BICE', '2026-10-10', 30000)]
    const r = calcularVencimientosTarjeta({ gastos, ciclos, diasPago: { Edwards: 5 }, hoyISO: '2026-10-16' })
    expect(r.vencimientos.map(v => v.banco)).toEqual(['Edwards'])
    expect(r.sinFecha).toEqual({ movimientos: 1, total: 30000 })

    const sinCierre = calcularVencimientosTarjeta({ gastos, ciclos: {}, diasPago, hoyISO: '2026-10-16' })
    expect(sinCierre.vencimientos).toEqual([])
    expect(sinCierre.sinFecha.movimientos).toBe(2)
    expect(sinCierre.aviso).toBeNull()
  })

  test('USD puro usa su monto en pesos manual; si no, se estima a 950 por dólar', () => {
    const gastos = [
      gasto('a', 'Edwards', '2026-10-10', 0, { usd: 20 }),
      gasto('b', 'Edwards', '2026-10-10', 0, { usd: 10, monto_clp_manual: 9000 }),
    ]
    const r = calcularVencimientosTarjeta({ gastos, ciclos, diasPago, hoyISO: '2026-10-16' })
    expect(r.vencimientos[0].total).toBe(19000 + 9000)
    expect(r.usdEstimado).toEqual({ movimientos: 1, usd: 20, tipoCambio: 950 })
    expect(r.usdSinConvertir).toBe(0)
  })

  test('el tipo de cambio es configurable y sin uno válido el USD queda sin convertir', () => {
    const gastos = [gasto('a', 'Edwards', '2026-10-10', 0, { usd: 20 })]
    expect(calcularVencimientosTarjeta({ gastos, ciclos, diasPago, tipoCambioUsd: 1000, hoyISO: '2026-10-16' }).vencimientos[0].total).toBe(20000)
    const sin = calcularVencimientosTarjeta({ gastos, ciclos, diasPago, tipoCambioUsd: null, hoyISO: '2026-10-16' })
    expect(sin.vencimientos).toEqual([])
    expect(sin.usdSinConvertir).toBe(1)
  })

  test('faltanteTotal es toda la deuda con fecha menos el fondo', () => {
    const gastos = [gasto('a', 'Edwards', '2026-10-10', 100000), gasto('b', 'BICE', '2026-10-20', 60000)]
    expect(calcularVencimientosTarjeta({ gastos, ciclos, diasPago, saldoFondoClp: 120000, hoyISO: '2026-10-16' }).faltanteTotal).toBe(40000)
    expect(calcularVencimientosTarjeta({ gastos, ciclos, diasPago, saldoFondoClp: 500000, hoyISO: '2026-10-16' }).faltanteTotal).toBe(0)
    // la deuda de una tarjeta sin día de pago también hay que cubrirla
    expect(calcularVencimientosTarjeta({ gastos, ciclos, diasPago: { Edwards: 5 }, saldoFondoClp: 120000, hoyISO: '2026-10-16' }).faltanteTotal).toBe(40000)
  })
})
