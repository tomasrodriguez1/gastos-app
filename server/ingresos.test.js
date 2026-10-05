import { describe, expect, test } from 'bun:test'
import {
  crearIngreso, editarIngreso, eliminarIngreso, listarIngresos, createIngresoRouter,
} from './ingresos'

const ingreso = (overrides = {}) => ({
  id: 1,
  fecha: '2026-08-10',
  ciclo_financiero: '2026-08',
  fuente: 'Sueldo',
  monto: 500000,
  nota: null,
  origen: 'manual',
  ...overrides,
})

function dbFalsa({ ingresos = [] } = {}) {
  const state = { ingresos: ingresos.map(i => ({ ...i })) }
  const db = async (strings, ...values) => {
    const consulta = strings.join('?')

    if (consulta.includes('SELECT * FROM ingreso WHERE id =')) {
      return state.ingresos.filter(i => i.id === values[0])
    }
    if (consulta.includes('SELECT * FROM ingreso WHERE ciclo_financiero =')) {
      const [ciclo] = values
      return state.ingresos
        .filter(i => i.ciclo_financiero === ciclo)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    }
    if (consulta.includes('SELECT * FROM ingreso ORDER BY fecha DESC, id DESC')) {
      return [...state.ingresos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    }
    if (consulta.includes('INSERT INTO ingreso (')) {
      const [fecha, cicloFinanciero, fuente, monto, nota, origen] = values
      const row = { id: state.ingresos.length + 1, fecha, ciclo_financiero: cicloFinanciero, fuente, monto, nota, origen }
      state.ingresos.push(row)
      return [row]
    }
    if (consulta.includes('UPDATE ingreso SET')) {
      const [fecha, cicloFinanciero, fuente, monto, nota, id] = values
      const row = state.ingresos.find(i => i.id === id)
      if (!row) return []
      Object.assign(row, { fecha, ciclo_financiero: cicloFinanciero, fuente, monto, nota })
      return [row]
    }
    if (consulta.includes('DELETE FROM ingreso WHERE id =')) {
      const [id] = values
      const idx = state.ingresos.findIndex(i => i.id === id)
      if (idx === -1) return []
      state.ingresos.splice(idx, 1)
      return [{ id }]
    }
    throw new Error(`Consulta no contemplada en test: ${consulta}`)
  }
  return { db, state }
}

describe('crearIngreso', () => {
  test('calcula ciclo_financiero desde la fecha (días 29-31 financian el mes siguiente)', async () => {
    const { db, state } = dbFalsa()
    const resultado = await crearIngreso({ fecha: '2026-08-29', fuente: 'Sueldo', monto: 100000 }, db)
    expect(resultado.ingreso.ciclo_financiero).toBe('2026-09')
    expect(state.ingresos).toHaveLength(1)
  })

  test('rechaza sin fuente', async () => {
    const { db } = dbFalsa()
    const resultado = await crearIngreso({ fecha: '2026-08-10', fuente: '', monto: 100000 }, db)
    expect(resultado.status).toBe(400)
  })

  test('rechaza monto <= 0', async () => {
    const { db } = dbFalsa()
    const resultado = await crearIngreso({ fecha: '2026-08-10', fuente: 'Sueldo', monto: 0 }, db)
    expect(resultado.status).toBe(400)
  })

  test('origen default manual, se puede pasar chat', async () => {
    const { db, state } = dbFalsa()
    await crearIngreso({ fecha: '2026-08-10', fuente: 'Sueldo', monto: 100000, origen: 'chat' }, db)
    expect(state.ingresos[0].origen).toBe('chat')
  })
})

describe('editarIngreso', () => {
  test('recalcula ciclo_financiero si cambia la fecha', async () => {
    const { db } = dbFalsa({ ingresos: [ingreso()] })
    const resultado = await editarIngreso(1, { fecha: '2026-08-30' }, db)
    expect(resultado.ingreso.ciclo_financiero).toBe('2026-09')
  })

  test('no encontrado devuelve 404', async () => {
    const { db } = dbFalsa({ ingresos: [] })
    const resultado = await editarIngreso(99, { monto: 1000 }, db)
    expect(resultado.status).toBe(404)
  })
})

describe('eliminarIngreso', () => {
  test('borra sin restricciones (no hay nada atado a un ingreso)', async () => {
    const { db, state } = dbFalsa({ ingresos: [ingreso()] })
    const resultado = await eliminarIngreso(1, db)
    expect(resultado.ok).toBe(true)
    expect(state.ingresos).toHaveLength(0)
  })
})

describe('listarIngresos', () => {
  test('filtra por ciclo cuando se pasa', async () => {
    const { db } = dbFalsa({
      ingresos: [ingreso(), ingreso({ id: 2, fecha: '2026-07-15', ciclo_financiero: '2026-07' })],
    })
    const todos = await listarIngresos({}, db)
    const deAgosto = await listarIngresos({ ciclo: '2026-08' }, db)
    expect(todos).toHaveLength(2)
    expect(deAgosto).toHaveLength(1)
    expect(deAgosto[0].id).toBe(1)
  })
})

describe('POST /api/ingresos', () => {
  test('crea el ingreso vía router', async () => {
    const { db, state } = dbFalsa()
    const router = createIngresoRouter({ db })
    const respuesta = await router.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: '2026-08-10', fuente: 'Sueldo', monto: 500000 }),
    })
    expect(respuesta.status).toBe(201)
    expect(state.ingresos).toHaveLength(1)
  })
})
