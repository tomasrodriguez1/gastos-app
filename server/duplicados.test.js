import { describe, test, expect, afterAll } from 'bun:test'
import sql from './db/client.js'
import { buscarSimilares } from './duplicados.js'
import { crearGastoPendiente } from './gastos/crear.js'
import { ejecutarCrearGasto } from './agente.js'

const idsCreados = []

afterAll(async () => {
  if (idsCreados.length) {
    await sql`DELETE FROM gastos WHERE id = ANY(${idsCreados})`
  }
})

async function insertar({ fecha, motivo, monto, banco, estado = 'confirmado', origen = 'mail', usd = 0 }) {
  const { gastoId } = await crearGastoPendiente({
    fecha,
    motivo,
    monto,
    usd,
    banco,
    tipos: [],
    contexto: '',
    estado,
    origen,
  })
  idsCreados.push(gastoId)
  return gastoId
}

const catalogosVacios = { tipos: ['Comida'], contextos: ['Personal'] }

describe('buscarSimilares', () => {
  test('alta: misma fecha + motivo + monto aunque el banco difiera', async () => {
    const id = await insertar({
      fecha: '2099-03-10',
      motivo: 'Unimarc',
      monto: 15000,
      banco: 'Edwards',
    })

    const matches = await buscarSimilares({
      fecha: '2099-03-10',
      motivo: 'UNIMARC',
      monto: 15000,
      banco: 'BICE',
    })

    expect(matches.some(m => m.gastoId === id && m.confianza === 'alta')).toBe(true)
  })

  test('media: mismo monto, fechas ±2 días, motivos distintos', async () => {
    const id = await insertar({
      fecha: '2099-03-11',
      motivo: 'UNIMARC S.A.',
      monto: 15000,
      banco: 'Edwards',
    })

    const matches = await buscarSimilares({
      fecha: '2099-03-10',
      motivo: 'almuerzo unimarc',
      monto: 15000,
      banco: 'BICE',
    })

    expect(matches.some(m => m.gastoId === id && m.confianza === 'media')).toBe(true)
  })

  test('no match si el monto y el motivo no se parecen', async () => {
    await insertar({
      fecha: '2099-03-12',
      motivo: 'Netflix',
      monto: 9990,
      banco: 'Edwards',
    })

    const matches = await buscarSimilares({
      fecha: '2099-03-12',
      motivo: 'Copec',
      monto: 45000,
      banco: 'BICE',
    })

    expect(matches).toEqual([])
  })

  test('ignora gastos descartados', async () => {
    await insertar({
      fecha: '2099-03-13',
      motivo: 'Starbucks',
      monto: 4500,
      banco: 'Edwards',
      estado: 'descartado',
    })

    const matches = await buscarSimilares({
      fecha: '2099-03-13',
      motivo: 'Starbucks',
      monto: 4500,
      banco: 'BICE',
    })

    expect(matches).toEqual([])
  })
})

describe('ejecutarCrearGasto — bloqueo por duplicado', () => {
  test('no inserta si hay similares y ignorar_duplicado es false', async () => {
    const existente = await insertar({
      fecha: '2099-04-01',
      motivo: 'Jumbo',
      monto: 22000,
      banco: 'Edwards',
      estado: 'pendiente',
    })

    const resultado = await ejecutarCrearGasto(catalogosVacios, {
      fecha: '2099-04-01',
      motivo: 'Jumbo',
      monto: 22000,
      banco: 'BICE',
      tipos: ['Comida'],
      contexto: 'Personal',
    })

    expect(resultado.bloqueado).toBe(true)
    expect(resultado.candidatos.some(c => c.gastoId === existente)).toBe(true)
    expect(resultado.gastoId).toBeUndefined()

    const extras = await sql`
      SELECT id FROM gastos
      WHERE fecha = '2099-04-01' AND motivo = 'Jumbo' AND banco = 'BICE'
    `
    expect(extras.length).toBe(0)
  })

  test('inserta si ignorar_duplicado es true', async () => {
    await insertar({
      fecha: '2099-04-02',
      motivo: 'Lider',
      monto: 8000,
      banco: 'Edwards',
    })

    const resultado = await ejecutarCrearGasto(catalogosVacios, {
      fecha: '2099-04-02',
      motivo: 'Lider',
      monto: 8000,
      banco: 'BICE',
      tipos: ['Comida'],
      contexto: 'Personal',
      ignorar_duplicado: true,
    })

    expect(resultado.bloqueado).toBeUndefined()
    expect(resultado.gastoId).toBeTruthy()
    expect(resultado.estado).toBe('pendiente')
    idsCreados.push(resultado.gastoId)
  })
})
