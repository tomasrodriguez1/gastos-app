import { describe, expect, test } from 'bun:test'
import {
  diasDeViaje,
  esSugerenciaDeViaje,
  resumirTodosLosViajes,
  resumirViaje,
  sugerirAsignacionViaje,
  sugerirGastosParaViaje,
  viajeEnCursoParaFecha,
} from './viajes'

const PERU = { id: 'v1', nombre: 'Perú', fecha_desde: '2026-10-01', fecha_hasta: '2026-10-05', estado: 'en_curso' }

describe('sugerirAsignacionViaje', () => {
  test.each([
    [['Viaje'], 'Polola', 'ALE', 'Pasajes'],
    [['Comida'], 'Polola', 'ALE', 'Comida'],
    [['Transporte'], 'Polola', 'ALE', 'Transporte'],
    [['Ocio'], 'Polola', 'ALE', 'Fiesta'],
    [['Regalo'], 'Polola', 'ALE', 'Regalos'],
    [['Ropa'], 'Polola', 'ALE', 'Otros'],
    [['Comida'], 'Ale', 'ALE', 'Comida'],
    [['Viaje'], 'Amigos', 'VIAJES', 'Pasajes'],
    [['Comida'], 'Solo', 'VIAJES', 'Comida'],
    [['Transporte'], 'Amigos', 'VIAJES', 'Otros'],
    [[], '', 'VIAJES', 'Otros'],
  ])('%p + %p → %s / %s', (tipos, contexto, grupo, subcategoria) => {
    expect(sugerirAsignacionViaje({ tipos, contexto })).toEqual({ grupo, subcategoria })
  })
})

describe('esSugerenciaDeViaje', () => {
  test('reconoce la sugerencia usando contexto_override', () => {
    const g = { tipos: ['Comida'], contexto: 'Solo', contexto_override: 'Polola', presupuesto_manual: { grupo: 'ALE', subcategoria: 'Comida' } }
    expect(esSugerenciaDeViaje(g)).toBe(true)
  })

  test('un override elegido a mano no es sugerencia', () => {
    const g = { tipos: ['Comida'], contexto: 'Solo', presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Alojamiento' } }
    expect(esSugerenciaDeViaje(g)).toBe(false)
    expect(esSugerenciaDeViaje({ tipos: [], presupuesto_manual: null })).toBe(false)
  })
})

describe('viajeEnCursoParaFecha', () => {
  test('solo un viaje en curso que cubre la fecha', () => {
    expect(viajeEnCursoParaFecha([PERU], '2026-10-03')?.id).toBe('v1')
    expect(viajeEnCursoParaFecha([PERU], '2026-10-06')).toBeNull()
    expect(viajeEnCursoParaFecha([{ ...PERU, estado: 'planificado' }], '2026-10-03')).toBeNull()
  })

  test('ambiguo (dos en curso) → null', () => {
    expect(viajeEnCursoParaFecha([PERU, { ...PERU, id: 'v2' }], '2026-10-03')).toBeNull()
  })
})

describe('resumirViaje', () => {
  const gastos = [
    { id: 'a', viaje_id: 'v1', fecha: '2026-08-15', monto: 300000, monto_real: 300000, tipos: ['Viaje'], presupuesto_manual: { grupo: 'ALE', subcategoria: 'Pasajes' } },
    { id: 'b', viaje_id: 'v1', fecha: '2026-10-02', monto: 40000, monto_real: 40000, split: 10000, tipos: ['Comida'], presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Comida' } },
    { id: 'c', viaje_id: 'v1', fecha: '2026-10-03', monto: 0, usd: 25, tipos: ['Ocio'], presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Otros' } },
    { id: 'd', viaje_id: 'v1', fecha: '2026-10-03', monto: 9999, monto_real: 9999, estado: 'descartado', tipos: [] },
    { id: 'e', viaje_id: null, fecha: '2026-10-03', monto: 5000, monto_real: 5000, tipos: [] },
  ]

  test('suma propio (descuenta split), separa antes/durante, USD aparte', () => {
    const r = resumirViaje(PERU, gastos)
    expect(r.gastos.map(g => g.id)).toEqual(['a', 'b', 'c'])
    expect(r.total).toBe(330000)
    expect(r.antes).toBe(300000)
    expect(r.durante).toBe(30000)
    expect(r.usd).toBe(25)
    expect(r.dias).toBe(5)
    expect(r.promedioDiario).toBe(6000)
    expect(r.porGrupo.ALE.total).toBe(300000)
    expect(r.porGrupo.VIAJES.subcategorias.Comida).toBe(30000)
  })

  test('incluye gastos financiados por un fondo', () => {
    const r = resumirViaje(PERU, [{ ...gastos[1], financiado_por: 'Vacaciones' }])
    expect(r.total).toBe(30000)
  })
})

describe('sugerirGastosParaViaje', () => {
  test('gastos en fechas + pasajes hasta 6 meses antes, sin los ya asignados', () => {
    const gastos = [
      { id: '1', fecha: '2026-10-02', tipos: [], monto: 1 },
      { id: '2', fecha: '2026-06-01', tipos: [], monto: 1, presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Pasajes' } },
      { id: '3', fecha: '2026-03-01', tipos: [], monto: 1, presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Pasajes' } },
      { id: '4', fecha: '2026-09-01', tipos: [], monto: 1, presupuesto_manual: { grupo: 'COMIDA', subcategoria: 'Restaurantes' } },
      { id: '5', fecha: '2026-10-03', tipos: [], monto: 1, viaje_id: 'otro' },
    ]
    expect(sugerirGastosParaViaje(PERU, gastos).map(g => g.id)).toEqual(['2', '1'])
  })
})

test('diasDeViaje cuenta ambos extremos', () => {
  expect(diasDeViaje(PERU)).toBe(5)
  expect(diasDeViaje({ fecha_desde: '2026-10-01', fecha_hasta: '2026-10-01' })).toBe(1)
})

describe('resumirTodosLosViajes', () => {
  const CHILE = { id: 'v2', nombre: 'Sur', fecha_desde: '2026-02-01', fecha_hasta: '2026-02-02', estado: 'cerrado' }
  const VACIO = { id: 'v3', nombre: 'Japón', fecha_desde: '2027-03-01', fecha_hasta: '2027-03-10', estado: 'planificado' }
  const gastos = [
    { id: 'a', viaje_id: 'v1', fecha: '2026-10-02', monto: 100000, monto_real: 100000, tipos: [], presupuesto_manual: { grupo: 'ALE', subcategoria: 'Comida' } },
    { id: 'b', viaje_id: 'v1', fecha: '2026-10-03', monto: 50000, monto_real: 50000, tipos: [], presupuesto_manual: { grupo: 'TRANSPORTE', subcategoria: 'Tag' } },
    { id: 'c', viaje_id: 'v2', fecha: '2026-02-01', monto: 40000, monto_real: 40000, tipos: [], presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Comida' } },
  ]

  test('ordena por salida, separa ALE / VIAJES / otros y suma subcategorías entre grupos', () => {
    const r = resumirTodosLosViajes([PERU, VACIO, CHILE], gastos)
    expect(r.porViaje.map(p => p.viaje.id)).toEqual(['v2', 'v1', 'v3'])
    expect(r.porViaje[1]).toMatchObject({ ale: 100000, viajes: 0, otros: 50000, porDia: 30000 })
    expect(r.total).toBe(190000)
    expect(r.pctAle).toBeCloseTo(100000 / 190000)
    expect(r.porSubcategoria[0]).toEqual(['Comida', 140000])
  })

  test('promedios solo sobre viajes con gastos', () => {
    const r = resumirTodosLosViajes([PERU, VACIO, CHILE], gastos)
    expect(r.nViajes).toBe(3)
    expect(r.nConGastos).toBe(2)
    expect(r.promedioPorViaje).toBe(95000)
    expect(r.promedioDiario).toBe(Math.round(190000 / 7))
  })

  test('sin viajes no divide por cero', () => {
    expect(resumirTodosLosViajes([], [])).toMatchObject({ total: 0, promedioPorViaje: 0, promedioDiario: 0, pctAle: 0 })
  })
})
