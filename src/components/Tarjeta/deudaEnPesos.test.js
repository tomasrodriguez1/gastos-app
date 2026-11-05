import { describe, expect, test } from 'bun:test'
import { deudaEnPesos, fondoEnPesos, saldoAbonos } from './deudaEnPesos'

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

  test('cuenta USD y movimientos por moneda, y omite pagados', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 1000, fecha: '2026-09-20' },
      { banco: 'Edwards', monto: 5000, fecha: '2026-09-20', pagado: true },
      { banco: 'Edwards', monto: 0, usd: 10.5, monto_clp_manual: 9000, fecha: '2026-09-01' },
      { banco: 'BICE', monto: 0, usd: 2.25, fecha: '2026-09-01' },
    ], { bancos, hoyISO: '2026-10-13' })

    expect(deuda.clp).toBe(1000)
    expect(deuda.movimientosClp).toBe(1)
    expect(deuda.usd).toBe(12.75)
    expect(deuda.movimientosUsd).toBe(2)
  })

  test('sin día de cierre nada cuenta como facturado', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 1000, fecha: '2026-09-20' },
    ], { bancos, hoyISO: '2026-10-13' })

    expect(deuda.facturado).toBe(0)
    expect(deuda.total).toBe(1000)
  })
})

describe('abonos en la deuda', () => {
  const gastosUsd = [
    { banco: 'Edwards', monto: 0, usd: 200, monto_clp_manual: 190000, fecha: '2026-09-01' },
    { banco: 'Edwards', monto: 0, usd: 50, monto_clp_manual: 47500, fecha: '2026-10-20' },
  ]

  test('un abono en USD baja la deuda en dólares y su equivalente en pesos', () => {
    const deuda = deudaEnPesos(gastosUsd, { bancos, abonos: { CLP: 0, USD: 170 } })

    expect(deuda.usd).toBe(80)
    expect(deuda.abonadoUsd).toBe(170)
    expect(deuda.total).toBe(76000) // 80 de 250 USD a 950
    expect(deuda.movimientosUsd).toBe(2)
  })

  test('un abono en CLP baja solo la deuda en pesos', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 10000 },
      { banco: 'Edwards', monto: 0, usd: 10, monto_clp_manual: 9500 },
    ], { bancos, abonos: { CLP: 4000, USD: 0 } })

    expect(deuda.clp).toBe(6000)
    expect(deuda.abonadoClp).toBe(4000)
    expect(deuda.usd).toBe(10)
    expect(deuda.total).toBe(15500)
  })

  test('un abono mayor a la deuda la deja en cero y no inventa deuda negativa', () => {
    const deuda = deudaEnPesos(gastosUsd, { bancos, abonos: { CLP: 5000, USD: 999 } })

    expect(deuda.usd).toBe(0)
    expect(deuda.abonadoUsd).toBe(250)
    expect(deuda.abonadoClp).toBe(0)
    expect(deuda.total).toBe(0)
  })

  test('el abono en USD cubre también lo que no tiene tipo de cambio', () => {
    const deuda = deudaEnPesos([{ banco: 'BICE', monto: 0, usd: 30 }], { bancos, abonos: { CLP: 0, USD: 30 } })

    expect(deuda.usd).toBe(0)
    expect(deuda.sinConvertir).toBe(0)
    expect(deuda.parcial).toBe(false)
  })

  test('los abonos bajan primero lo facturado', () => {
    const deuda = deudaEnPesos([
      { banco: 'Edwards', monto: 10000, fecha: '2026-09-20' },
      { banco: 'Edwards', monto: 4000, fecha: '2026-10-10' },
    ], { bancos, ciclos: { Edwards: 22 }, hoyISO: '2026-10-13', abonos: { CLP: 3000, USD: 0 } })

    expect(deuda.facturado).toBe(7000)
    expect(deuda.total).toBe(11000)
  })

  test('sin abonos nada cambia', () => {
    const deuda = deudaEnPesos(gastosUsd, { bancos })
    expect(deuda.usd).toBe(250)
    expect(deuda.abonadoUsd).toBe(0)
    expect(deuda.total).toBe(237500)
  })

  test('saldoAbonos suma los bancos pedidos e ignora saldos negativos', () => {
    const saldos = { Edwards: { CLP: 1000, USD: 170 }, BICE: { CLP: -50, USD: 30.5 } }
    expect(saldoAbonos(saldos, ['Edwards', 'BICE'])).toEqual({ CLP: 1000, USD: 200.5 })
    expect(saldoAbonos(saldos, ['BICE'])).toEqual({ CLP: 0, USD: 30.5 })
    expect(saldoAbonos(undefined, ['Edwards'])).toEqual({ CLP: 0, USD: 0 })
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
