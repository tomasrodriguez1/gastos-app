import { describe, expect, test } from 'bun:test'
import {
  asignarGastosAViaje,
  buscarViajePorTexto,
  crearViaje,
  desasignarGastos,
  editarViaje,
  eliminarViaje,
  listarViajes,
  obtenerResumenViaje,
} from './viajes'

// db falsa: tagged template que despacha por texto de consulta, como en fondosAhorro.test.js.
function dbFalsa({ viajes = [], gastos = [] } = {}) {
  const state = { viajes: viajes.map(v => ({ ...v })), gastos: gastos.map(g => ({ ...g })) }
  const db = async (strings, ...values) => {
    const consulta = strings.join('?')

    if (consulta.includes('SELECT * FROM viaje ORDER BY')) return [...state.viajes]
    if (consulta.includes('SELECT * FROM viaje WHERE id')) return state.viajes.filter(v => v.id === values[0])
    if (consulta.includes('INSERT INTO viaje')) {
      const [id, nombre, emoji, fecha_desde, fecha_hasta, presupuesto, estado, nota] = values
      const row = { id, nombre, emoji, fecha_desde, fecha_hasta, presupuesto, estado, nota }
      state.viajes.push(row)
      return [row]
    }
    if (consulta.includes('UPDATE viaje SET')) {
      const [nombre, emoji, fecha_desde, fecha_hasta, presupuesto, estado, nota, id] = values
      const row = state.viajes.find(v => v.id === id)
      Object.assign(row, { nombre, emoji, fecha_desde, fecha_hasta, presupuesto, estado, nota })
      return [row]
    }
    if (consulta.includes('DELETE FROM viaje')) {
      const antes = state.viajes.length
      state.viajes = state.viajes.filter(v => v.id !== values[0])
      return antes === state.viajes.length ? [] : [{ id: values[0] }]
    }
    if (consulta.includes('SELECT * FROM gastos WHERE viaje_id IS NOT NULL')) return state.gastos.filter(g => g.viaje_id)
    if (consulta.includes('SELECT * FROM gastos WHERE viaje_id =')) return state.gastos.filter(g => g.viaje_id === values[0])
    if (consulta.includes('SELECT * FROM gastos WHERE id = ANY')) {
      const [ids] = values
      return state.gastos.filter(g => ids.includes(g.id) || ids.includes(g.sync_key))
    }
    if (consulta.includes('UPDATE gastos SET viaje_id = NULL, updated_at = NOW() WHERE viaje_id')) {
      const liberados = state.gastos.filter(g => g.viaje_id === values[0])
      for (const g of liberados) g.viaje_id = null
      return liberados.map(g => ({ id: g.id }))
    }
    if (consulta.includes('UPDATE gastos SET viaje_id')) {
      const [viajeId, presupuesto, id] = consulta.includes('viaje_id = NULL') ? [null, ...values] : values
      const g = state.gastos.find(x => x.id === id)
      Object.assign(g, { viaje_id: viajeId, presupuesto_manual: presupuesto })
      return [g]
    }
    throw new Error(`Consulta no contemplada en test: ${consulta}`)
  }
  return { db, state }
}

const PERU = { id: 'v1', nombre: 'Perú 2026', fecha_desde: '2026-10-01', fecha_hasta: '2026-10-05', estado: 'en_curso' }

describe('crearViaje / editarViaje', () => {
  test('crea con defaults (planificado, sin presupuesto)', async () => {
    const { db, state } = dbFalsa()
    const r = await crearViaje({ nombre: '  Japón ', fecha_desde: '2027-03-01', fecha_hasta: '2027-03-15' }, db)
    expect(r.viaje).toMatchObject({ nombre: 'Japón', estado: 'planificado', presupuesto: null })
    expect(state.viajes).toHaveLength(1)
  })

  test('valida nombre, fechas, estado y orden de fechas', async () => {
    const { db } = dbFalsa()
    const ok = { nombre: 'X', fecha_desde: '2026-10-01', fecha_hasta: '2026-10-05' }
    expect((await crearViaje({ ...ok, nombre: '' }, db)).status).toBe(400)
    expect((await crearViaje({ ...ok, fecha_desde: 'mañana' }, db)).status).toBe(400)
    expect((await crearViaje({ ...ok, estado: 'soñado' }, db)).status).toBe(400)
    expect((await crearViaje({ ...ok, fecha_hasta: '2026-09-01' }, db)).status).toBe(400)
    expect((await crearViaje({ ...ok, presupuesto: -1 }, db)).status).toBe(400)
  })

  test('edición parcial conserva lo no enviado', async () => {
    const { db } = dbFalsa({ viajes: [PERU] })
    const r = await editarViaje('v1', { estado: 'cerrado', presupuesto: 900000 }, db)
    expect(r.viaje).toMatchObject({ nombre: 'Perú 2026', estado: 'cerrado', presupuesto: 900000, fecha_desde: '2026-10-01' })
    expect((await editarViaje('nope', { estado: 'cerrado' }, db)).status).toBe(404)
  })
})

describe('asignar / desasignar', () => {
  const gastos = () => [
    { id: 'g1', tipos: ['Comida'], contexto: 'Polola', presupuesto_manual: null },
    { id: 'g2', tipos: ['Comida'], contexto: 'Amigos', presupuesto_manual: null },
    { id: 'g3', tipos: ['Comida'], contexto: 'Solo', presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Alojamiento' } },
  ]

  test('sugiere ALE/VIAJES solo donde no había presupuesto_manual', async () => {
    const { db, state } = dbFalsa({ viajes: [PERU], gastos: gastos() })
    const r = await asignarGastosAViaje('v1', ['g1', 'g2', 'g3'], db)
    expect(r.gastos).toHaveLength(3)
    const [g1, g2, g3] = state.gastos
    expect(g1).toMatchObject({ viaje_id: 'v1', presupuesto_manual: { grupo: 'ALE', subcategoria: 'Comida' } })
    expect(g2).toMatchObject({ viaje_id: 'v1', presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Comida' } })
    expect(g3.presupuesto_manual).toEqual({ grupo: 'VIAJES', subcategoria: 'Alojamiento' })
  })

  test('desasignar limpia solo la sugerencia, no el override manual', async () => {
    const { db, state } = dbFalsa({ viajes: [PERU], gastos: gastos() })
    await asignarGastosAViaje('v1', ['g1', 'g3'], db)
    await desasignarGastos(['g1', 'g3'], db)
    const [g1, , g3] = state.gastos
    expect(g1).toMatchObject({ viaje_id: null, presupuesto_manual: null })
    expect(g3).toMatchObject({ viaje_id: null, presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Alojamiento' } })
  })

  test('errores: sin ids o viaje inexistente', async () => {
    const { db } = dbFalsa({ viajes: [PERU], gastos: gastos() })
    expect((await asignarGastosAViaje('v1', [], db)).status).toBe(400)
    expect((await asignarGastosAViaje('nope', ['g1'], db)).status).toBe(404)
    expect((await desasignarGastos(null, db)).status).toBe(400)
  })
})

describe('eliminarViaje / listarViajes', () => {
  test('borrar libera los gastos del viaje', async () => {
    const { db, state } = dbFalsa({ viajes: [PERU], gastos: [{ id: 'g1', viaje_id: 'v1', tipos: [] }] })
    const r = await eliminarViaje('v1', db)
    expect(r).toEqual({ ok: true, gastos_liberados: 1 })
    expect(state.gastos[0].viaje_id).toBeNull()
    expect((await eliminarViaje('v1', db)).status).toBe(404)
  })

  test('listar incluye total y cantidad de gastos', async () => {
    const { db } = dbFalsa({
      viajes: [PERU],
      gastos: [
        { id: 'g1', viaje_id: 'v1', fecha: '2026-10-02', monto: 20000, monto_real: 20000, tipos: [] },
        { id: 'g2', viaje_id: 'v1', fecha: '2026-10-03', monto: '15000', monto_real: '15000', tipos: [] },
      ],
    })
    const [v] = await listarViajes(db)
    expect(v).toMatchObject({ nombre: 'Perú 2026', total_gastos: 35000, n_gastos: 2, dias: 5, por_dia: 7000, pct_ale: 0 })
  })

  test('obtenerResumenViaje: KPIs, grupos, pendientes y mayores gastos', async () => {
    const { db } = dbFalsa({
      viajes: [{ ...PERU, presupuesto: '100000' }],
      gastos: [
        { id: 'g1', viaje_id: 'v1', fecha: '2026-09-01', monto: 60000, monto_real: 60000, tipos: [], estado: 'confirmado', presupuesto_manual: { grupo: 'ALE', subcategoria: 'Pasajes' } },
        { id: 'g2', viaje_id: 'v1', fecha: '2026-10-02', monto: 20000, monto_real: 20000, tipos: [], estado: 'pendiente', presupuesto_manual: { grupo: 'VIAJES', subcategoria: 'Comida' } },
        { id: 'g3', viaje_id: 'otro', fecha: '2026-10-02', monto: 999, monto_real: 999, tipos: [] },
      ],
    })
    const r = await obtenerResumenViaje('v1', db)
    expect(r).toMatchObject({
      total: 80000, restante: 20000, gasto_antes: 60000, gasto_durante: 20000,
      por_dia_durante: 4000, cantidad: 2, pendientes_revision: 1,
    })
    expect(r.por_grupo[0]).toMatchObject({ grupo: 'ALE', total: 60000, porcentaje: 75 })
    expect(r.mayores_gastos.map(g => g.id)).toEqual(['g1', 'g2'])
    expect(await obtenerResumenViaje('nope', db)).toBeNull()
  })
})

test('buscarViajePorTexto: exacto, parcial único, ambiguo', () => {
  const viajes = [PERU, { id: 'v2', nombre: 'Perú 2027' }, { id: 'v3', nombre: 'Japón' }]
  expect(buscarViajePorTexto(viajes, 'perú 2026')?.id).toBe('v1')
  expect(buscarViajePorTexto(viajes, 'v3')?.id).toBe('v3')
  expect(buscarViajePorTexto(viajes, 'jap')?.id).toBe('v3')
  expect(buscarViajePorTexto(viajes, 'perú')).toBeNull()
  expect(buscarViajePorTexto(viajes, '')).toBeNull()
})
