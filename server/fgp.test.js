import { describe, expect, test } from 'bun:test'
import { registrarMovimientoFGP, registrarTraspasos, eliminarMovimientoFGP } from './fgp'

const gastoRow = (id, monto, extra = {}) => ({
  id, monto: String(monto), monto_real: String(monto), usd: '0', split: '0', banco: 'BICE',
  estado: 'confirmado', ciclo_financiero: '2026-10', tipos: [], presupuesto_manual: null, ...extra,
})

function dbFalsa({ gastos = [], fgp = [] } = {}) {
  const state = { gastos, fgp: fgp.map(m => ({ ...m })), tarjeta: [], ahorro: [] }
  const db = async (strings, ...values) => {
    const q = strings.join('?')
    if (q.includes('SELECT * FROM gastos WHERE id = ANY')) return state.gastos.filter(g => values[0].includes(g.id))
    if (q.includes('SELECT gasto_id FROM fgp_movimiento')) {
      return state.fgp.filter(m => m.tipo === 'traspaso_tc' && values[0].includes(m.gasto_id))
    }
    if (q.includes('INSERT INTO fondo_tarjeta_movimiento')) {
      const [fecha, monto, nota] = values
      const row = { id: state.tarjeta.length + 1, fecha, tipo: 'aporte', moneda: 'CLP', monto, nota }
      state.tarjeta.push(row)
      return [row]
    }
    if (q.includes('INSERT INTO fondo_ahorro_movimiento')) {
      const [fondo_nombre, fecha, monto, nota] = values
      const row = { id: state.ahorro.length + 1, fondo_nombre, fecha, tipo: 'ajuste', monto, nota }
      state.ahorro.push(row)
      return [row]
    }
    if (q.includes("VALUES ('traspaso_tc'")) {
      const [ciclo, fecha, monto, gasto_id, tarjeta_movimiento_id, nota] = values
      const row = { id: state.fgp.length + 1, tipo: 'traspaso_tc', ciclo, fecha, monto, gasto_id, tarjeta_movimiento_id, nota }
      state.fgp.push(row)
      return [row]
    }
    if (q.includes('INSERT INTO fgp_movimiento')) {
      const [tipo, ciclo, fecha, monto, fondo_ahorro_movimiento_id, origen, nota] = values
      const row = { id: state.fgp.length + 1, tipo, ciclo, fecha, monto, fondo_ahorro_movimiento_id, origen, nota }
      state.fgp.push(row)
      return [row]
    }
    if (q.includes('SELECT * FROM fgp_movimiento WHERE id')) return state.fgp.filter(m => m.id === values[0])
    if (q.includes('DELETE FROM fondo_tarjeta_movimiento')) {
      state.tarjeta = state.tarjeta.filter(t => t.id !== values[0])
      state.fgp = state.fgp.filter(m => m.tarjeta_movimiento_id !== values[0]) // ON DELETE CASCADE
      return []
    }
    if (q.includes('DELETE FROM fondo_ahorro_movimiento')) {
      state.ahorro = state.ahorro.filter(a => a.id !== values[0])
      state.fgp = state.fgp.filter(m => m.fondo_ahorro_movimiento_id !== values[0])
      return []
    }
    if (q.includes('DELETE FROM fgp_movimiento WHERE id')) {
      state.fgp = state.fgp.filter(m => m.id !== values[0])
      return []
    }
    throw new Error(`Consulta no contemplada en test: ${q}`)
  }
  db.begin = fn => fn(db)
  return { db, state }
}

describe('registrarTraspasos', () => {
  test('mover: un aporte CLP por el lote y una fila por gasto; omite históricos, pagados, los ya movidos y los de débito', async () => {
    const { db, state } = dbFalsa({
      gastos: [
        gastoRow('a', 10000),
        gastoRow('b', 5000, { split: '1000' }),
        gastoRow('c', 3000),
        gastoRow('d', 2000, { banco: 'Santander' }),
        gastoRow('e', 4000, { ciclo_financiero: '2026-09' }),
        gastoRow('f', 6000, { pagado: true }),
      ],
      fgp: [{ id: 99, tipo: 'traspaso_tc', gasto_id: 'c' }],
    })
    const r = await registrarTraspasos({
      gastoIds: ['a', 'b', 'c', 'd', 'e', 'f', 'zz'],
      modo: 'mover',
      fecha: '2026-10-06',
      cicloActual: '2026-10',
    }, db)
    expect(r.registrados).toBe(2)
    expect(r.total).toBe(14000) // el split no se mueve: es plata que devuelve un tercero
    expect(state.tarjeta).toHaveLength(1)
    expect(state.tarjeta[0].monto).toBe(14000)
    expect(r.omitidos.map(o => o.motivo).sort()).toEqual(['no encontrado', 'no es de tarjeta', 'no es del ciclo actual', 'ya está pagado', 'ya movido'])
    expect(state.fgp.filter(m => m.tarjeta_movimiento_id === 1)).toHaveLength(2)
  })

  test('marcar: no toca el fondo de tarjeta', async () => {
    const { db, state } = dbFalsa({ gastos: [gastoRow('a', 10000)] })
    const r = await registrarTraspasos({ gastoIds: ['a'], modo: 'marcar', fecha: '2026-10-06', cicloActual: '2026-10' }, db)
    expect(r.registrados).toBe(1)
    expect(state.tarjeta).toHaveLength(0)
    expect(state.fgp[0].tarjeta_movimiento_id).toBeNull()
  })

  test('valida modo e ids', async () => {
    const { db } = dbFalsa()
    expect((await registrarTraspasos({ gastoIds: ['a'], modo: 'otro' }, db)).status).toBe(400)
    expect((await registrarTraspasos({ gastoIds: [], modo: 'mover' }, db)).status).toBe(400)
  })
})

describe('registrarMovimientoFGP', () => {
  test('cobertura desde un fondo de ahorro registra la salida en ese fondo', async () => {
    const { db, state } = dbFalsa()
    const r = await registrarMovimientoFGP({ tipo: 'cobertura', ciclo: '2026-10', fecha: '2026-10-06', monto: 20000, fondoNombre: 'Vacaciones' }, db)
    expect(r.movimiento.origen).toBe('Fondo Vacaciones')
    expect(state.ahorro[0].monto).toBe(-20000)
    expect(r.movimiento.fondo_ahorro_movimiento_id).toBe(1)
  })

  test('déficit positivo sin fondo; rechaza negativos, tipos inválidos y déficit desde fondo', async () => {
    const { db } = dbFalsa()
    expect((await registrarMovimientoFGP({ tipo: 'deficit', ciclo: '2026-10', monto: 5000 }, db)).movimiento.tipo).toBe('deficit')
    expect((await registrarMovimientoFGP({ tipo: 'deficit', ciclo: '2026-10', monto: -5000 }, db)).status).toBe(400)
    expect((await registrarMovimientoFGP({ tipo: 'traspaso_tc', ciclo: '2026-10', monto: 5000 }, db)).status).toBe(400)
    expect((await registrarMovimientoFGP({ tipo: 'deficit', ciclo: '2026-10', monto: 5000, fondoNombre: 'X' }, db)).status).toBe(400)
    expect((await registrarMovimientoFGP({ tipo: 'ajuste', ciclo: '2026-10', monto: -3000 }, db)).movimiento.monto).toBe(-3000)
  })
})

describe('eliminarMovimientoFGP', () => {
  test('deshacer un traspaso borra el aporte de tarjeta y devuelve todo el lote a pendiente', async () => {
    const { db, state } = dbFalsa({ gastos: [gastoRow('a', 10000), gastoRow('b', 5000)] })
    await registrarTraspasos({ gastoIds: ['a', 'b'], modo: 'mover', fecha: '2026-10-06', cicloActual: '2026-10' }, db)
    const r = await eliminarMovimientoFGP(state.fgp[0].id, db)
    expect(r.ok).toBe(true)
    expect(state.tarjeta).toHaveLength(0)
    expect(state.fgp).toHaveLength(0)
  })

  test('deshacer una cobertura borra la salida del fondo de ahorro', async () => {
    const { db, state } = dbFalsa()
    const { movimiento } = await registrarMovimientoFGP({ tipo: 'cobertura', ciclo: '2026-10', fecha: '2026-10-06', monto: 20000, fondoNombre: 'Vacaciones' }, db)
    await eliminarMovimientoFGP(movimiento.id, db)
    expect(state.ahorro).toHaveLength(0)
    expect(state.fgp).toHaveLength(0)
  })
})
