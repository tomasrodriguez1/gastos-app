import { describe, test, expect, afterAll } from 'bun:test'
import sql from '../db/client.js'
import { resumenCiclo, buscarGastosCiclo, categorizarParaPresupuesto } from './ciclo.js'
import { crearGastoPendiente } from '../gastos/crear.js'
import { SIN_CLASIFICAR } from '../../src/utils/calculos.js'

const CICLO = '2099-06'
const idsCreados = []

afterAll(async () => {
  if (idsCreados.length) {
    await sql`DELETE FROM gastos WHERE id = ANY(${idsCreados})`
  }
  await sql`DELETE FROM presupuesto_ciclo WHERE ciclo = ${CICLO}`
})

async function insertar(extra = {}) {
  const { gastoId } = await crearGastoPendiente({
    fecha: '2099-06-10',
    motivo: 'Test Uber ciclo',
    monto: 8000,
    banco: 'Edwards',
    tipos: ['Transporte'],
    contexto: 'Personal',
    estado: 'pendiente',
    origen: 'chat',
    ...extra,
  })
  idsCreados.push(gastoId)
  return gastoId
}

describe('categorizarParaPresupuesto', () => {
  const base = { monto: 1000, monto_real: 1000, usd: 0, tipos: [], banco: '' }

  test('pendiente sin mapeo cae en SIN CLASIFICAR', () => {
    const cat = categorizarParaPresupuesto({ ...base, estado: 'pendiente', motivo: 'x' }, [])
    expect(cat.grupo).toBe(SIN_CLASIFICAR)
  })

  test('confirmado sin mapeo se excluye', () => {
    expect(categorizarParaPresupuesto({ ...base, estado: 'confirmado', motivo: 'x' }, [])).toBeNull()
  })

  test('USD puro se excluye', () => {
    expect(categorizarParaPresupuesto({
      ...base, estado: 'confirmado', monto: 0, monto_real: 0, usd: 50, motivo: 'Hotel',
    }, [])).toBeNull()
  })
})

describe('resumenCiclo / buscarGastosCiclo', () => {
  test('ciclo 29–28, semáforo rojo, pendiente sin clasificar, USD fuera, búsqueda por motivo', async () => {
    await sql`INSERT INTO presupuesto_ciclo (ciclo) VALUES (${CICLO}) ON CONFLICT DO NOTHING`
    await sql`DELETE FROM presupuesto_ingreso WHERE ciclo = ${CICLO}`
    await sql`DELETE FROM presupuesto_categoria WHERE ciclo = ${CICLO}`
    await sql`INSERT INTO presupuesto_ingreso (ciclo, fuente, monto) VALUES (${CICLO}, 'test-sueldo', 2000000)`
    await sql`INSERT INTO presupuesto_categoria (ciclo, grupo, subcategoria, previsto, fgp)
              VALUES (${CICLO}, 'COMIDA', 'Supermercado', 100000, false)`

    await insertar({
      fecha: '2099-05-29',
      motivo: 'Test Jumbo ciclo',
      monto: 200000,
      tipos: ['Comida'],
      estado: 'confirmado',
      presupuesto_manual: { grupo: 'COMIDA', subcategoria: 'Supermercado' },
    })

    await insertar({
      fecha: '2099-06-05',
      motivo: 'Test pendiente sin mapear xyz',
      monto: 5000,
      tipos: [],
      banco: '',
      estado: 'pendiente',
    })

    await insertar({
      fecha: '2099-06-08',
      motivo: 'Test hotel USD',
      monto: 0,
      usd: 80,
      tipos: ['Viaje'],
      estado: 'confirmado',
    })

    const idFuera = await insertar({
      fecha: '2099-06-29',
      motivo: 'Test fuera de ciclo',
      monto: 9999,
      estado: 'confirmado',
      presupuesto_manual: { grupo: 'COMIDA', subcategoria: 'Supermercado' },
    })

    const idUber = await insertar({
      fecha: '2099-06-12',
      motivo: 'ZZZUBER2099 Test viaje app',
      monto: 8000,
      tipos: ['Transporte'],
      estado: 'confirmado',
      presupuesto_manual: { grupo: 'TRANSPORTE', subcategoria: 'Apps' },
    })

    const resumen = await resumenCiclo({ ciclo: CICLO })
    expect(resumen.ciclo).toBe(CICLO)
    expect(resumen.rango.desde).toBe('2099-05-29')
    expect(resumen.rango.hasta).toBe('2099-06-28')
    expect(resumen.hay_presupuesto).toBe(true)
    expect(resumen.en_rojo).toContain('COMIDA')

    const comida = resumen.semaforos.find(s => s.grupo === 'COMIDA')
    expect(comida.real).toBe(200000)
    expect(comida.previsto).toBe(100000)
    expect(comida.estado).toBe('rojo')

    expect(resumen.sin_clasificar).toBe(5000)
    expect(resumen.gastado).toBe(200000 + 5000 + 8000)

    const uber = await buscarGastosCiclo({ texto: 'ZZZUBER2099', ciclo: CICLO })
    expect(uber.gastos.some(g => g.gastoId === idUber)).toBe(true)
    expect(uber.gastos.some(g => g.gastoId === idFuera)).toBe(false)
    expect(uber.suma).toBe(8000)
  }, 20000)
})
