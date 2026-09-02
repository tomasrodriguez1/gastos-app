import { describe, test, expect, afterAll } from 'bun:test'
import sql from '../db/client.js'
import { listarPendientes, resumirBandeja } from './pendientes.js'
import { crearGastoPendiente } from './crear.js'

const idsCreados = []
const PREFIJO = `test-bandeja-${crypto.randomUUID().slice(0, 8)}`

afterAll(async () => {
  if (idsCreados.length) {
    await sql`DELETE FROM gastos WHERE id = ANY(${idsCreados})`
  }
})

async function insertar(extra = {}) {
  const { gastoId } = await crearGastoPendiente({
    fecha: '2099-05-05',
    motivo: `${PREFIJO}-Unimarc`,
    monto: 10000,
    banco: 'Edwards',
    tipos: ['Comida'],
    contexto: 'Personal',
    estado: 'pendiente',
    origen: 'mail',
    ...extra,
  })
  idsCreados.push(gastoId)
  return gastoId
}

describe('listarPendientes', () => {
  test('filtra por banco, estado, tipos y pagina con offset', async () => {
    await insertar({ motivo: `${PREFIJO}-A`, banco: 'Edwards', tipos: ['Comida'] })
    await insertar({
      motivo: `${PREFIJO}-B`,
      banco: 'BICE',
      tipos: ['Transporte'],
      estado: 'error_parseo',
      origen: 'chat',
    })
    await insertar({ motivo: `${PREFIJO}-C`, banco: 'Edwards', tipos: ['Comida'] })

    const edwards = await listarPendientes({ banco: 'Edwards', busqueda: PREFIJO, limite: 30 })
    expect(edwards.every(g => /edwards/i.test(g.banco))).toBe(true)
    expect(edwards.length).toBeGreaterThanOrEqual(2)

    const errores = await listarPendientes({ estado: 'error_parseo', busqueda: PREFIJO })
    expect(errores.length).toBe(1)
    expect(errores[0].motivo).toContain('-B')

    const comida = await listarPendientes({ tipos: ['Comida'], busqueda: PREFIJO, limite: 30 })
    expect(comida.every(g => g.tipos.includes('Comida'))).toBe(true)

    const pagina1 = await listarPendientes({ busqueda: PREFIJO, limite: 1, offset: 0 })
    const pagina2 = await listarPendientes({ busqueda: PREFIJO, limite: 1, offset: 1 })
    expect(pagina1).toHaveLength(1)
    expect(pagina2).toHaveLength(1)
    expect(pagina1[0].id).not.toBe(pagina2[0].id)
  })
})

describe('resumirBandeja', () => {
  test('agrega conteos y suma sin listar filas sueltas', async () => {
    await insertar({ motivo: `${PREFIJO}-suma`, banco: 'Edwards', monto: 3000 })
    const resumen = await resumirBandeja({ banco: 'Edwards' })
    expect(resumen.total).toBeGreaterThanOrEqual(1)
    expect(resumen.suma_monto).toBeGreaterThan(0)
    expect(resumen.por_banco.some(b => /edwards/i.test(b.clave))).toBe(true)
    expect(resumen.por_estado.some(e => e.clave === 'pendiente')).toBe(true)
  })
})
