import { describe, test, expect, afterAll } from 'bun:test'
import sql from './db/client.js'
import { buscarComercio, aprenderComercio, olvidarComercio } from './comercios.js'
import { normalizarComercio } from '../src/utils/comercio.js'

const clavesCreadas = []

afterAll(async () => {
  if (clavesCreadas.length) {
    await sql`DELETE FROM comercio_mapeo WHERE comercio_normalizado = ANY(${clavesCreadas})`
  }
})

describe('buscarComercio', () => {
  test('motivo vacío o sin match -> null, sin tocar la DB', async () => {
    expect(await buscarComercio('')).toBeNull()
    expect(await buscarComercio(null)).toBeNull()
    expect(await buscarComercio('COMERCIO INEXISTENTE XYZ 99999')).toBeNull()
  })
})

describe('aprenderComercio', () => {
  test('primera confirmación -> inserta con veces_confirmado = 1', async () => {
    const clave = normalizarComercio('Café Altura')
    clavesCreadas.push(clave)

    await aprenderComercio({
      motivo: 'Café Altura',
      tipos: ['Comida'],
      contexto: 'Personal',
      banco: 'Edwards',
      presupuesto_manual: null,
    })

    const memoria = await buscarComercio('Café Altura')
    expect(memoria).not.toBeNull()
    expect(memoria.tipos).toEqual(['Comida'])
    expect(memoria.contexto).toBe('Personal')
    expect(memoria.veces_confirmado).toBe(1)
  })

  test('variante con prefijo de adquirente colapsa a la misma clave', async () => {
    const memoria = await buscarComercio('SUMUP *Café Altura 4471')
    expect(memoria).not.toBeNull()
    expect(memoria.tipos).toEqual(['Comida'])
  })

  test('segunda confirmación con corrección -> pisa campos, acumula contador', async () => {
    await aprenderComercio({
      motivo: 'Café Altura',
      tipos: ['Comida', 'Salida'],
      contexto: 'Polola',
      banco: 'Edwards',
      presupuesto_manual: { grupo: 'ALE', subcategoria: 'Comida' },
    })

    const memoria = await buscarComercio('Café Altura')
    expect(memoria.tipos).toEqual(['Comida', 'Salida'])
    expect(memoria.contexto).toBe('Polola')
    expect(memoria.presupuesto_manual).toEqual({ grupo: 'ALE', subcategoria: 'Comida' })
    expect(memoria.veces_confirmado).toBe(2)
  })

  test('respeta contexto_override sobre contexto', async () => {
    const clave = normalizarComercio('Override Comercio')
    clavesCreadas.push(clave)

    await aprenderComercio({
      motivo: 'Override Comercio',
      tipos: ['Otro'],
      contexto: 'Personal',
      contexto_override: 'Trabajo',
      banco: '',
      presupuesto_manual: null,
    })

    const memoria = await buscarComercio('Override Comercio')
    expect(memoria.contexto).toBe('Trabajo')
  })

  test('sin tipos ni contexto -> no-op, no inserta fila', async () => {
    const memoria = await aprenderComercio({ motivo: 'Comercio Sin Clasificar', tipos: [], contexto: '' })
    expect(memoria).toBeUndefined()
    expect(await buscarComercio('Comercio Sin Clasificar')).toBeNull()
  })

  test('motivo vacío -> no-op', async () => {
    await aprenderComercio({ motivo: '', tipos: ['Comida'], contexto: 'Personal' })
    // no debería lanzar ni insertar nada bajo clave vacía
    expect(await buscarComercio('')).toBeNull()
  })
})

describe('olvidarComercio', () => {
  test('borra un comercio existente y devuelve true', async () => {
    const clave = 'OLVIDAR COMERCIO'
    await aprenderComercio({ motivo: 'Olvidar Comercio', tipos: ['Otro'], contexto: 'Personal' })
    expect(await buscarComercio('Olvidar Comercio')).not.toBeNull()

    const borrado = await olvidarComercio(clave)
    expect(borrado).toBe(true)
    expect(await buscarComercio('Olvidar Comercio')).toBeNull()
  })

  test('comercio inexistente -> false', async () => {
    expect(await olvidarComercio('NO EXISTE ESTA CLAVE')).toBe(false)
  })
})
