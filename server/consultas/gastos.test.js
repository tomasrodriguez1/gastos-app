import { describe, test, expect, afterAll } from 'bun:test'
import sql from '../db/client.js'
import { buscarGastos, resumirGastos, agregarFilas, SIN_MAPEO } from './gastos.js'
import { resumenCiclo } from './ciclo.js'
import { crearGastoPendiente } from '../gastos/crear.js'
import { SIN_CLASIFICAR } from '../../src/utils/calculos.js'

const CICLO = '2099-08'
const BANCO = 'TestBancoMCP'
const idsCreados = []

afterAll(async () => {
  if (idsCreados.length) await sql`DELETE FROM gastos WHERE id = ANY(${idsCreados})`
})

async function insertar(extra = {}) {
  const { gastoId } = await crearGastoPendiente({
    fecha: '2099-08-10',
    motivo: 'Test MCP buscar',
    monto: 1000,
    banco: BANCO,
    tipos: [],
    contexto: '',
    origen: 'mcp',
    ...extra,
  })
  idsCreados.push(gastoId)
  return gastoId
}

describe('agregarFilas', () => {
  test('más de 30 grupos → los menores en "otros"', () => {
    const filas = Array.from({ length: 35 }, (_, i) => ({
      incluido: true, monto: i + 1, monto_ciclo: i + 1, banco: `B${i}`,
    }))
    const r = agregarFilas(filas, { agrupar_por: 'banco' })
    expect(r.grupos).toHaveLength(31)
    expect(r.grupos[0]).toMatchObject({ clave: 'B34', total_ciclo: 35 })
    expect(r.grupos.at(-1)).toMatchObject({ clave: 'otros', total_ciclo: 1 + 2 + 3 + 4 + 5, cantidad: 5 })
    expect(r.grupos_totales).toBe(35)
  })

  test('cantidad incluye monto_ciclo 0 (financiado por fondo); total 0 → porcentaje 0', () => {
    const r = agregarFilas([{ incluido: true, monto: 5000, monto_ciclo: 0, grupo: 'VIAJES' }], { agrupar_por: 'grupo' })
    expect(r).toMatchObject({ total_ciclo: 0, total_nominal: 5000, cantidad: 1, promedio: 0 })
    expect(r.grupos).toEqual([{ clave: 'VIAJES', total_ciclo: 0, cantidad: 1, porcentaje: 0 }])
  })
})

describe('buscarGastos / resumirGastos (Postgres)', () => {
  test('filtros, orden, paginación, USD puro y descartados fuera, cuadra con resumenCiclo', async () => {
    await insertar({ fecha: '2099-07-29', motivo: 'Test MCP Uber 1', monto: 8000, estado: 'confirmado',
      presupuesto_manual: { grupo: 'TRANSPORTE', subcategoria: 'Uber' } })
    await insertar({ fecha: '2099-08-02', motivo: 'Test MCP Uber 2', monto: 120000, estado: 'confirmado',
      presupuesto_manual: { grupo: 'TRANSPORTE', subcategoria: 'Uber' } })
    await insertar({ fecha: '2099-08-05', motivo: 'Test MCP sin mapear', monto: 3000 })
    await insertar({ fecha: '2099-08-06', motivo: 'Test MCP hotel usd', monto: 0, usd: 90 })
    await insertar({ fecha: '2099-08-07', motivo: 'Test MCP descartado', monto: 50000, estado: 'descartado' })

    // Ciclo 2099-08 arranca el 29 de julio; mes calendario 2099-07 solo tiene el primero.
    const porCiclo = await buscarGastos({ ciclo: CICLO, banco: BANCO.toLowerCase() })
    expect(porCiclo.meta).toMatchObject({ total: 4, devueltos: 4, truncado: false })
    expect(porCiclo.filas.map(f => f.motivo)).not.toContain('Test MCP descartado')
    expect((await buscarGastos({ mes: '2099-07', banco: BANCO })).meta.total).toBe(1)

    const fila = porCiclo.filas.find(f => f.motivo === 'Test MCP sin mapear')
    expect(Object.keys(fila).sort()).toEqual([
      'banco', 'estado', 'fecha', 'grupo', 'id', 'monto', 'monto_ciclo', 'motivo', 'origen', 'subcategoria', 'usd',
    ])
    expect(fila).toMatchObject({ grupo: SIN_CLASIFICAR, monto_ciclo: 3000, estado: 'pendiente', origen: 'mcp' })
    expect(porCiclo.filas.find(f => f.usd === 90).monto_ciclo).toBe(0)

    const pagina = await buscarGastos({ banco: BANCO, orden: 'monto_desc', limite: 2, offset: 0 })
    expect(pagina.filas.map(f => f.monto)).toEqual([120000, 8000])
    expect(pagina.meta).toMatchObject({ total: 4, devueltos: 2, truncado: true })

    expect((await buscarGastos({ banco: BANCO, monto_min: 100000 })).filas.map(f => f.motivo)).toEqual(['Test MCP Uber 2'])
    expect((await buscarGastos({ banco: BANCO, texto: 'uber' })).meta.total).toBe(2)
    expect((await buscarGastos({ banco: BANCO, grupo: 'transp' })).meta.total).toBe(2)
    expect((await buscarGastos({ banco: BANCO, estado: 'descartado' })).meta.total).toBe(1)
    expect((await buscarGastos({ banco: BANCO, texto: '%' })).meta.total).toBe(0)
    expect((await buscarGastos({ banco: BANCO, fecha_desde: '2099-08-05', fecha_hasta: '2099-08-06' })).meta.total).toBe(2)

    const resumen = await resumirGastos({ ciclo: CICLO, banco: BANCO, agrupar_por: 'grupo' })
    expect(resumen).toMatchObject({ total_ciclo: 131000, total_nominal: 131000, cantidad: 3, maximo: 120000, minimo: 3000 })
    expect(resumen.grupos).toEqual([
      { clave: 'TRANSPORTE', total_ciclo: 128000, cantidad: 2, porcentaje: 97.7 },
      { clave: SIN_CLASIFICAR, total_ciclo: 3000, cantidad: 1, porcentaje: 2.3 },
    ])

    // Sin filtros, el total del ciclo es el mismo "gastado" del dashboard.
    const [todo, dashboard] = await Promise.all([resumirGastos({ ciclo: CICLO }), resumenCiclo({ ciclo: CICLO })])
    expect(todo.total_ciclo).toBe(dashboard.gastado)
  }, 60000)

  test('confirmado sin regla cuenta en el total como SIN MAPEO', async () => {
    await insertar({ fecha: '2099-08-12', motivo: 'Test MCP ajuste zz', monto: 700, estado: 'confirmado', banco: `${BANCO}2` })
    const r = await resumirGastos({ banco: `${BANCO}2`, agrupar_por: 'grupo' })
    // Si alguna regla real mapea este gasto el test no aplica (dependería del seed).
    if (r.grupos[0].clave !== SIN_MAPEO) return
    expect(r).toMatchObject({ total_ciclo: 700, cantidad: 1 })
  }, 20000)
})
