import { describe, expect, test } from 'bun:test'
import { calcularSaldoEsperado, registrarSaldo, createReservaRouter, excedeTolerancia } from './reservas'

const reserva = (overrides = {}) => ({
  id: 1,
  nombre: 'Mantención auto',
  emoji: '🚗',
  vinculado: { grupo: 'AUTO', subcategoria: 'Mantención' },
  tasa_anual: 0,
  activa: true,
  ...overrides,
})

const gasto = (overrides = {}) => ({
  id: crypto.randomUUID(),
  fecha: '2026-08-10',
  monto: 0,
  usd: 0,
  split: 0,
  estado: 'confirmado',
  tipos: [],
  contexto: '',
  banco: '',
  motivo: '',
  presupuesto_manual: null,
  ...overrides,
})

function dbFalsa({ reservas = [], saldos = [], gastos = [] } = {}) {
  const state = {
    reservas: reservas.map(r => ({ ...r })),
    saldos: saldos.map(s => ({ ...s })),
    gastos: gastos.map(g => ({ ...g })),
  }
  const db = async (strings, ...values) => {
    const consulta = strings.join('?')

    if (consulta.includes('SELECT nombre FROM reserva') && consulta.includes("vinculado->>'grupo'")) {
      const [grupo, subcategoria] = values
      return state.reservas.filter(r =>
        r.activa &&
        r.vinculado.grupo === grupo &&
        (r.vinculado.subcategoria ?? null) === (subcategoria ?? null)
      )
    }
    if (consulta.includes('SELECT * FROM reserva WHERE id =')) {
      return state.reservas.filter(r => r.id === values[0])
    }
    if (consulta.includes('SELECT * FROM reserva ORDER BY activa')) {
      return [...state.reservas].sort((a, b) => Number(b.activa) - Number(a.activa) || a.nombre.localeCompare(b.nombre))
    }
    if (consulta.includes('INSERT INTO reserva (')) {
      const [nombre, emoji, vinculado, tasa_anual] = values
      const row = { id: state.reservas.length + 1, nombre, emoji, vinculado, tasa_anual, activa: true }
      state.reservas.push(row)
      return [row]
    }
    if (consulta.includes('FROM reserva_saldo') && consulta.includes('ORDER BY fecha DESC LIMIT 1')) {
      const [reservaId, fechaNueva] = values
      return state.saldos
        .filter(s => s.reserva_id === reservaId && s.fecha < fechaNueva)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 1)
    }
    if (consulta.includes('FROM regla_mapeo')) return []
    if (consulta.includes('FROM gastos') && consulta.includes("estado = 'confirmado'")) {
      const [fechaAnterior, fechaNueva] = values
      return state.gastos.filter(g => g.estado === 'confirmado' && g.fecha > fechaAnterior && g.fecha <= fechaNueva)
    }
    if (consulta.includes('INSERT INTO reserva_saldo')) {
      const [reservaId, fecha, monto, esperado, diferencia] = values
      const existente = state.saldos.find(s => s.reserva_id === reservaId && s.fecha === fecha)
      if (existente) {
        Object.assign(existente, { monto_leido: monto, monto_esperado: esperado, diferencia })
      } else {
        state.saldos.push({
          id: state.saldos.length + 1, reserva_id: reservaId, fecha,
          monto_leido: monto, monto_esperado: esperado, diferencia, origen: 'foto_agente',
        })
      }
      return []
    }
    throw new Error(`Consulta no contemplada en test: ${consulta}`)
  }
  db.begin = callback => callback(db)
  return { db, state }
}

describe('calcularSaldoEsperado', () => {
  test('primera lectura de una reserva no tiene línea base', async () => {
    const { db } = dbFalsa({ reservas: [reserva()] })
    const resultado = await calcularSaldoEsperado(1, '2026-08-20', db)
    expect(resultado.monto).toBeNull()
  })

  test('resta retiros confirmados y usa monto bruto, no montoPresupuestable (ignora split)', async () => {
    const { db } = dbFalsa({
      reservas: [reserva()],
      saldos: [{ reserva_id: 1, fecha: '2026-08-01', monto_leido: 100000 }],
      gastos: [
        gasto({ fecha: '2026-08-10', monto: 20000, split: 5000, presupuesto_manual: { grupo: 'AUTO', subcategoria: 'Mantención' } }),
        gasto({ fecha: '2026-08-11', monto: 999, estado: 'pendiente', presupuesto_manual: { grupo: 'AUTO', subcategoria: 'Mantención' } }),
        gasto({ fecha: '2026-08-12', monto: 5000, presupuesto_manual: { grupo: 'OTRO', subcategoria: 'X' } }),
      ],
    })
    const resultado = await calcularSaldoEsperado(1, '2026-08-20', db)
    expect(resultado.monto).toBe(80000) // 100000 - 20000, split no se resta, pendiente/otra-categoria no cuentan
  })

  test('subcategoria ausente en vinculado matchea todo el grupo', async () => {
    const { db } = dbFalsa({
      reservas: [reserva({ vinculado: { grupo: 'ALE' } })],
      saldos: [{ reserva_id: 1, fecha: '2026-08-01', monto_leido: 50000 }],
      gastos: [
        gasto({ fecha: '2026-08-05', monto: 10000, presupuesto_manual: { grupo: 'ALE', subcategoria: 'Comida' } }),
        gasto({ fecha: '2026-08-06', monto: 5000, presupuesto_manual: { grupo: 'ALE', subcategoria: 'Transporte' } }),
      ],
    })
    const resultado = await calcularSaldoEsperado(1, '2026-08-20', db)
    expect(resultado.monto).toBe(35000)
  })

  test('gastos en USD puro se excluyen del retiro y se reportan aparte', async () => {
    const { db } = dbFalsa({
      reservas: [reserva()],
      saldos: [{ reserva_id: 1, fecha: '2026-08-01', monto_leido: 100000 }],
      gastos: [
        gasto({ fecha: '2026-08-10', monto: 0, usd: 50, presupuesto_manual: { grupo: 'AUTO', subcategoria: 'Mantención' } }),
      ],
    })
    const resultado = await calcularSaldoEsperado(1, '2026-08-20', db)
    expect(resultado.monto).toBe(100000)
    expect(resultado.usdExcluido).toBe(50)
  })

  test('aplica crecimiento estimado prorrateado por tasa_anual', async () => {
    const { db } = dbFalsa({
      reservas: [reserva({ tasa_anual: 0.03 })],
      saldos: [{ reserva_id: 1, fecha: '2026-01-01', monto_leido: 100000 }],
    })
    const resultado = await calcularSaldoEsperado(1, '2027-01-01', db) // ~365 días, ~3%
    expect(resultado.monto).toBeGreaterThan(102900)
    expect(resultado.monto).toBeLessThan(103100)
  })
})

describe('registrarSaldo', () => {
  test('un segundo registro el mismo día corrige (upsert) en vez de duplicar', async () => {
    const { db, state } = dbFalsa({ reservas: [reserva()] })
    await registrarSaldo({ reservaId: 1, monto: 45000, fecha: '2026-08-20' }, db)
    await registrarSaldo({ reservaId: 1, monto: 50000, fecha: '2026-08-20' }, db)
    expect(state.saldos.length).toBe(1)
    expect(state.saldos[0].monto_leido).toBe(50000)
  })

  test('reserva inexistente devuelve error', async () => {
    const { db } = dbFalsa({ reservas: [] })
    const resultado = await registrarSaldo({ reservaId: 99, monto: 1000, fecha: '2026-08-20' }, db)
    expect(resultado.error).toBeDefined()
  })
})

describe('excedeTolerancia', () => {
  test('usa el mayor entre $1.000 y 2% del esperado', () => {
    expect(excedeTolerancia(900, 100000)).toBe(false) // < max(1000, 2000)
    expect(excedeTolerancia(2001, 100000)).toBe(true) // > max(1000, 2000)
    expect(excedeTolerancia(1500, 10000)).toBe(true) // max(1000, 200) = 1000, 1500 > 1000
    expect(excedeTolerancia(null, 100000)).toBe(false)
  })
})

describe('POST /api/reservas', () => {
  test('rechaza con 409 si ya existe una reserva activa en la misma categoría', async () => {
    const { db } = dbFalsa({ reservas: [reserva()] })
    const router = createReservaRouter({ db })
    const respuesta = await router.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Patente', vinculado: { grupo: 'AUTO', subcategoria: 'Mantención' } }),
    })
    expect(respuesta.status).toBe(409)
  })

  test('crea la reserva cuando no hay solape', async () => {
    const { db, state } = dbFalsa({ reservas: [reserva()] })
    const router = createReservaRouter({ db })
    const respuesta = await router.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Vacaciones', vinculado: { grupo: 'VIAJES' } }),
    })
    expect(respuesta.status).toBe(201)
    expect(state.reservas.some(r => r.nombre === 'Vacaciones')).toBe(true)
  })
})
