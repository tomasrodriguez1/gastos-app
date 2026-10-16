import { describe, expect, test } from 'bun:test'
import { sugerirReparto, totalesReparto } from './repartoIngreso'

describe('sugerirReparto', () => {
  const fondos = [{ nombre: 'Vacaciones', previsto: 50000 }, { nombre: 'Auto', previsto: 30000 }]

  test('primero cubre la tarjeta, después cada fondo con su previsto, y deja el resto libre', () => {
    const r = sugerirReparto({ monto: 500000, faltanteTC: 200000, fondos })
    expect(r.lineas.map(l => [l.destino, l.nombre, l.sugerido])).toEqual([
      ['tarjeta', undefined, 200000],
      ['fondo', 'Vacaciones', 50000],
      ['fondo', 'Auto', 30000],
    ])
    expect(r.libre).toBe(220000)
  })

  test('si el ingreso no alcanza, prioriza la tarjeta y los fondos reciben lo que quede', () => {
    const r = sugerirReparto({ monto: 220000, faltanteTC: 200000, fondos })
    expect(r.lineas.map(l => l.sugerido)).toEqual([200000, 20000, 0])
    expect(r.libre).toBe(0)
  })

  test('la tarjeta se lleva todo si la deuda supera el ingreso', () => {
    const r = sugerirReparto({ monto: 100000, faltanteTC: 400000, fondos })
    expect(r.lineas.map(l => l.sugerido)).toEqual([100000, 0, 0])
    expect(r.lineas[0].faltante).toBe(400000)
    expect(r.libre).toBe(0)
  })

  test('sin deuda ni fondos todo queda libre; la línea de tarjeta siempre existe', () => {
    const r = sugerirReparto({ monto: 80000 })
    expect(r.lineas).toEqual([{ destino: 'tarjeta', sugerido: 0, faltante: 0 }])
    expect(r.libre).toBe(80000)
  })

  test('ignora montos inválidos o negativos', () => {
    const r = sugerirReparto({ monto: 'x', faltanteTC: -5, fondos: [{ nombre: 'A', previsto: null }] })
    expect(r.lineas.map(l => l.sugerido)).toEqual([0, 0])
    expect(r.libre).toBe(0)
  })
})

describe('totalesReparto', () => {
  test('suma lo editado y avisa si se pasa del ingreso', () => {
    expect(totalesReparto(100000, ['60000', '30000', ''])).toEqual({ repartido: 90000, libre: 10000, excede: false })
    expect(totalesReparto(100000, ['80000', '30000'])).toEqual({ repartido: 110000, libre: -10000, excede: true })
  })
})
