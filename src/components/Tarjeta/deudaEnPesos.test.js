import { describe, expect, test } from 'bun:test'
import { deudaEnPesos, fondoEnPesos } from './deudaEnPesos'

const bancos = ['Edwards', 'BICE']

describe('deudaEnPesos', () => {
  test('suma solo el CLP pendiente y no resta el split', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 10000, usd: 0, split: 4000 },
      { banco: 'BICE', monto: '2500', usd: null },
    ], { bancos })

    expect(deuda.clp).toBe(12500)
    expect(deuda.total).toBe(12500)
    expect(deuda.movimientosClp).toBe(2)
    expect(deuda.parcial).toBe(false)
    expect(deuda.pideTipoCambio).toBe(false)
  })

  test('un USD con monto_clp_manual entra por ese equivalente', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 0, usd: 40, monto_clp_manual: '38000' },
    ], { bancos, tipoCambio: 999 })

    expect(deuda.usdPropioClp).toBe(38000)
    expect(deuda.usdPropioUsd).toBe(40)
    expect(deuda.movimientosUsdPropio).toBe(1)
    expect(deuda.usdTasaClp).toBe(0)
    expect(deuda.total).toBe(38000)
  })

  test('un USD sin tipo de cambio queda fuera del total', () => {
    const deuda = deudaEnPesos([
      { banco: 'BICE', monto: 5000, usd: 0 },
      { banco: 'BICE', monto: null, usd: 12.5 },
    ], { bancos })

    expect(deuda.total).toBe(5000)
    expect(deuda.sinConvertir).toBe(1)
    expect(deuda.sinConvertirUsd).toBe(12.5)
    expect(deuda.parcial).toBe(true)
    expect(deuda.pideTipoCambio).toBe(true)
  })

  test('la tasa del KPI convierte cada movimiento y redondea al peso', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', usd: 1.5, monto: 0 },
      { banco: 'Edwards', usd: 1.5, monto: 0 },
    ], { bancos, tipoCambio: 10.4 })

    expect(Math.round(1.5 * 10.4)).toBe(16)
    expect(deuda.usdTasaClp).toBe(32)
    expect(deuda.usdTasaUsd).toBe(3)
    expect(deuda.movimientosUsdTasa).toBe(2)
    expect(deuda.total).toBe(32)
    expect(deuda.parcial).toBe(false)
    expect(deuda.pideTipoCambio).toBe(true)
  })

  test('una fila con monto y usd cuenta una sola vez, como CLP', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 10000, usd: 20, monto_clp_manual: 99999 },
    ], { bancos, tipoCambio: 950 })

    expect(deuda.clp).toBe(10000)
    expect(deuda.total).toBe(10000)
    expect(deuda.usdPropioClp).toBe(0)
    expect(deuda.usdTasaClp).toBe(0)
    expect(deuda.movimientosClp).toBe(1)
  })

  test('deja afuera pagados, descartados y otros bancos', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 1000, pagado: true },
      { banco: 'BICE', monto: 2000, estado: 'descartado' },
      { banco: 'Santander', monto: 3000 },
      { banco: 'Edwards', usd: 9, monto: 0, pagado: true },
      { banco: 'Edwards', monto: 4000 },
    ], { bancos: ['Edwards'] })

    expect(deuda.total).toBe(4000)
    expect(deuda.movimientosClp).toBe(1)
    expect(deuda.sinConvertir).toBe(0)
  })

  test('separa lo ya facturado según el día de cierre', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 1000, fecha: '2026-09-20' },
      { banco: 'Edwards', monto: 4000, fecha: '2026-10-10' },
      { banco: 'BICE', monto: 0, usd: 10, monto_clp_manual: 9000, fecha: '2026-09-01' },
    ], { bancos, ciclos: { Edwards: 22, BICE: 22 }, hoyISO: '2026-10-13' })

    expect(deuda.facturado).toBe(10000)
    expect(deuda.total).toBe(14000)
  })

  test('sin día de cierre nada cuenta como facturado', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 1000, fecha: '2026-09-20' },
    ], { bancos, hoyISO: '2026-10-13' })

    expect(deuda.facturado).toBe(0)
    expect(deuda.total).toBe(1000)
  })
})

describe('fondoEnPesos', () => {
  test('suma el fondo CLP y convierte el USD con la tasa del KPI', () => {
    expect(fondoEnPesos({ CLP: 190289, USD: 12.5 }, 980)).toEqual({
      total: 202539,
      clp: 190289,
      usd: 12.5,
      usdClp: 12250,
      usdSinConvertir: false,
    })
  })

  test('sin tasa el fondo en USD queda fuera', () => {
    const fondo = fondoEnPesos({ CLP: 1000, USD: 10 }, null)
    expect(fondo.total).toBe(1000)
    expect(fondo.usdSinConvertir).toBe(true)
  })
})
