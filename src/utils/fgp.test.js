import { describe, expect, test } from 'bun:test'
import { calcularFondoFGP, ciclosFGP } from './fgp'

const presupuesto = (lineas) => ({
  categorias: Object.fromEntries(Object.entries(lineas).map(([grupo, subs]) => [grupo, { subcategorias: subs }])),
})

const gasto = (id, ciclo, sub, monto, extra = {}) => ({
  id,
  fecha: `${ciclo}-10`,
  ciclo_financiero: ciclo,
  monto,
  monto_real: monto,
  usd: 0,
  banco: 'BICE',
  estado: 'confirmado',
  presupuesto_manual: { grupo: 'ENTRETENCION', subcategoria: sub },
  ...extra,
})

const presupuestos = {
  '2026-09': presupuesto({ ENTRETENCION: { Carrete: { previsto: 50000, fgp: true }, Regalos: { previsto: 20000, fgp: true }, Cine: { previsto: 9000, fgp: false } } }),
  '2026-10': presupuesto({ ENTRETENCION: { Carrete: { previsto: 70000, fgp: true }, Regalos: { previsto: 20000, fgp: true } } }),
  '2026-11': presupuesto({ ENTRETENCION: { Carrete: { previsto: 70000, fgp: true } } }),
}

describe('calcularFondoFGP', () => {
  test('arrastra el saldo entre ciclos y no cuenta ciclos futuros', () => {
    const gastos = [
      gasto('a', '2026-09', 'Carrete', 30000),
      gasto('b', '2026-10', 'Regalos', 26000),
      gasto('c', '2026-10', 'Cine', 5000), // línea no FGP
    ]
    const r = calcularFondoFGP({ gastos, presupuestos, movimientos: [], cicloActual: '2026-10' })
    expect(ciclosFGP(presupuestos, '2026-10')).toEqual(['2026-09', '2026-10'])
    expect(r.aportes).toBe(160000)
    expect(r.gastado).toBe(56000)
    expect(r.saldo).toBe(104000)
    expect(r.ciclos[0].saldoFinal).toBe(40000)
    expect(r.ciclos[1].saldoInicial).toBe(40000)
    expect(r.ciclos[1].excesos).toEqual([expect.objectContaining({ sub: 'Regalos', exceso: 6000 })])
  })

  test('pendientes a TC: solo tarjeta, confirmados, del servidor y no movidos', () => {
    const gastos = [
      gasto('a', '2026-10', 'Carrete', 10000),
      gasto('b', '2026-10', 'Carrete', 20000, { banco: 'Santander' }),
      gasto('c', '2026-10', 'Carrete', 30000, { estado: 'pendiente' }),
      gasto('d', '2026-10', 'Carrete', 40000, { manual: true }),
      gasto('e', '2026-10', 'Carrete', 5000, { banco: 'Edwards' }),
      gasto('f', '2026-10', 'Carrete', 7000, { financiado_por: 'Vacaciones' }),
    ]
    const movimientos = [{ tipo: 'traspaso_tc', gasto_id: 'e', ciclo: '2026-10', monto: 5000 }]
    const r = calcularFondoFGP({ gastos, presupuestos, movimientos, cicloActual: '2026-10' })
    expect(r.pendientesTC.map(p => p.gasto.id)).toEqual(['a'])
    expect(r.totalPendienteTC).toBe(10000)
    // los traspasos no cambian el saldo; el gasto financiado por un fondo no come el FGP
    expect(r.gastado).toBe(105000)
  })

  test('coberturas, déficits y ajustes suman al saldo; el déficit queda como compromiso del sueldo siguiente', () => {
    const gastos = [gasto('a', '2026-10', 'Regalos', 200000)]
    const movimientos = [
      { tipo: 'cobertura', ciclo: '2026-10', monto: 10000 },
      { tipo: 'deficit', ciclo: '2026-10', monto: 30000 },
      { tipo: 'ajuste', ciclo: '2026-09', monto: -5000 },
      { tipo: 'deficit', ciclo: '2026-08', monto: 999 }, // ya se pagó con el sueldo de 2026-09
    ]
    const r = calcularFondoFGP({ gastos, presupuestos, movimientos, cicloActual: '2026-10' })
    expect(r.saldo).toBe(160000 - 200000 + 10000 + 30000 + 999 - 5000)
    expect(r.compromisos).toEqual({ '2026-11': 30000 })
  })

  test('sin líneas FGP no hay fondo', () => {
    const r = calcularFondoFGP({ gastos: [], presupuestos: {}, movimientos: [], cicloActual: '2026-10' })
    expect(r.desde).toBeNull()
    expect(r.saldo).toBe(0)
  })
})
