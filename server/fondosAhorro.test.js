import { describe, expect, test } from 'bun:test'
import { registrarMovimientoFondo, listarAportesFondo, listarTodosLosMovimientos, createFondoAhorroRouter } from './fondosAhorro'

function dbFalsa({ movimientos = [] } = {}) {
  const state = { movimientos: movimientos.map(m => ({ ...m })) }
  const db = async (strings, ...values) => {
    const consulta = strings.join('?')

    if (consulta.includes('SELECT * FROM fondo_ahorro_movimiento') && consulta.includes('WHERE fondo_nombre')) {
      const [nombre, limite] = values
      return state.movimientos
        .filter(m => m.fondo_nombre === nombre)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
        .slice(0, limite ?? 20)
    }
    if (consulta.includes('SELECT * FROM fondo_ahorro_movimiento') && !consulta.includes('WHERE')) {
      return [...state.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    }
    if (consulta.includes('INSERT INTO fondo_ahorro_movimiento')) {
      const [fondoNombre, fecha, tipo, monto, nota] = values
      const row = { id: state.movimientos.length + 1, fondo_nombre: fondoNombre, fecha, tipo, monto, nota }
      state.movimientos.push(row)
      return [row]
    }
    throw new Error(`Consulta no contemplada en test: ${consulta}`)
  }
  return { db, state }
}

describe('registrarMovimientoFondo', () => {
  test('inserta un aporte (default tipo)', async () => {
    const { db, state } = dbFalsa()
    const resultado = await registrarMovimientoFondo({ fondoNombre: 'Vacaciones', fecha: '2026-08-10', monto: 40000 }, db)
    expect(resultado.movimiento.tipo).toBe('aporte')
    expect(state.movimientos).toHaveLength(1)
  })

  test('inserta un ajuste negativo (corrección a la baja)', async () => {
    const { db, state } = dbFalsa()
    const resultado = await registrarMovimientoFondo({ fondoNombre: 'Vacaciones', fecha: '2026-08-10', monto: -5000, tipo: 'ajuste' }, db)
    expect(resultado.movimiento.tipo).toBe('ajuste')
    expect(state.movimientos[0].monto).toBe(-5000)
  })

  test('rechaza un aporte con monto <= 0', async () => {
    const { db } = dbFalsa()
    const resultado = await registrarMovimientoFondo({ fondoNombre: 'X', fecha: '2026-08-10', monto: 0, tipo: 'aporte' }, db)
    expect(resultado.status).toBe(400)
  })

  test('rechaza un tipo inválido', async () => {
    const { db } = dbFalsa()
    const resultado = await registrarMovimientoFondo({ fondoNombre: 'X', fecha: '2026-08-10', monto: 1000, tipo: 'pago' }, db)
    expect(resultado.status).toBe(400)
  })

  test('rechaza sin nombre o fecha inválida', async () => {
    const { db } = dbFalsa()
    expect((await registrarMovimientoFondo({ fondoNombre: '', fecha: '2026-08-10', monto: 1000 }, db)).status).toBe(400)
    expect((await registrarMovimientoFondo({ fondoNombre: 'X', fecha: 'ayer', monto: 1000 }, db)).status).toBe(400)
  })
})

describe('listarAportesFondo', () => {
  test('filtra por nombre, más reciente primero', async () => {
    const { db } = dbFalsa({
      movimientos: [
        { id: 1, fondo_nombre: 'Vacaciones', fecha: '2026-08-01', tipo: 'aporte', monto: 10000 },
        { id: 2, fondo_nombre: 'Vacaciones', fecha: '2026-08-15', tipo: 'ajuste', monto: -2000 },
        { id: 3, fondo_nombre: 'Emergencia', fecha: '2026-08-10', tipo: 'aporte', monto: 5000 },
      ],
    })
    const resultado = await listarAportesFondo('Vacaciones', {}, db)
    expect(resultado).toHaveLength(2)
    expect(resultado[0].fecha).toBe('2026-08-15')
    expect(resultado[0].tipo).toBe('ajuste')
  })
})

describe('listarTodosLosMovimientos', () => {
  test('devuelve movimientos de todos los fondos, más reciente primero', async () => {
    const { db } = dbFalsa({
      movimientos: [
        { id: 1, fondo_nombre: 'Vacaciones', fecha: '2026-08-01', tipo: 'aporte', monto: 10000 },
        { id: 2, fondo_nombre: 'Emergencia', fecha: '2026-08-15', tipo: 'aporte', monto: 5000 },
      ],
    })
    const resultado = await listarTodosLosMovimientos(db)
    expect(resultado).toHaveLength(2)
    expect(resultado[0].fondo_nombre).toBe('Emergencia')
  })
})

describe('POST /api/fondos-ahorro/:nombre/movimientos', () => {
  test('crea el movimiento vía router con tipo default aporte', async () => {
    const { db, state } = dbFalsa()
    const router = createFondoAhorroRouter({ db })
    const respuesta = await router.request('/Vacaciones/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: '2026-08-10', monto: 40000 }),
    })
    expect(respuesta.status).toBe(201)
    expect(state.movimientos[0].tipo).toBe('aporte')
  })

  test('crea un ajuste vía router', async () => {
    const { db, state } = dbFalsa()
    const router = createFondoAhorroRouter({ db })
    const respuesta = await router.request('/Vacaciones/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: '2026-08-10', monto: -3000, tipo: 'ajuste' }),
    })
    expect(respuesta.status).toBe(201)
    expect(state.movimientos[0].tipo).toBe('ajuste')
    expect(state.movimientos[0].monto).toBe(-3000)
  })
})
