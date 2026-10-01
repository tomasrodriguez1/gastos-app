import { describe, test, expect } from 'bun:test'
import { clasificarConAgente, filtrarClasificacion } from './agente.js'

const CATALOGOS = {
  tipos: ['Comida', 'Suscripcion'],
  contextos: ['Personal', 'Trabajo'],
}

describe('filtrarClasificacion', () => {
  test('descarta tipos y contexto que no están en el catálogo', () => {
    expect(filtrarClasificacion(
      { tipos: ['Comida', 'Inventado'], contexto: 'Personal' },
      CATALOGOS.tipos,
      CATALOGOS.contextos,
    )).toEqual({ tipos: ['Comida'], contexto: 'Personal' })
  })

  test('devuelve null si no queda ningún valor válido', () => {
    expect(filtrarClasificacion(
      { tipos: ['Inventado'], contexto: 'Narnia' },
      CATALOGOS.tipos,
      CATALOGOS.contextos,
    )).toBeNull()
    expect(filtrarClasificacion(null, CATALOGOS.tipos, CATALOGOS.contextos)).toBeNull()
  })
})

describe('clasificarConAgente', () => {
  test('sin motivo o sin catálogo no llama al modelo', async () => {
    let llamadas = 0
    const generar = async () => { llamadas += 1; return { tipos: ['Comida'], contexto: 'Personal' } }
    expect(await clasificarConAgente({ motivo: '', catalogos: CATALOGOS }, { generar })).toBeNull()
    expect(await clasificarConAgente({ motivo: 'Uber', catalogos: { tipos: [] } }, { generar })).toBeNull()
    expect(llamadas).toBe(0)
  })

  test('filtra la salida del modelo contra el catálogo', async () => {
    const resultado = await clasificarConAgente({
      motivo: 'Uber',
      banco: 'Edwards',
      monto: 8500,
      fecha: '2026-07-15',
      catalogos: CATALOGOS,
    }, {
      generar: async () => ({ tipos: ['Comida', 'NoExiste'], contexto: 'Personal' }),
    })
    expect(resultado).toEqual({ tipos: ['Comida'], contexto: 'Personal' })
  })

  test('si el modelo falla o no devuelve nada válido, devuelve null', async () => {
    const falla = await clasificarConAgente(
      { motivo: 'Uber', catalogos: CATALOGOS },
      { generar: async () => { throw new Error('timeout') } },
    )
    expect(falla).toBeNull()

    const vacio = await clasificarConAgente(
      { motivo: 'Uber', catalogos: CATALOGOS },
      { generar: async () => ({ tipos: [], contexto: '' }) },
    )
    expect(vacio).toBeNull()
  })

  test('sin OPENAI_API_KEY devuelve null y no llama al modelo', async () => {
    const previa = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      expect(await clasificarConAgente({ motivo: 'Uber', catalogos: CATALOGOS })).toBeNull()
    } finally {
      if (previa === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = previa
    }
  })
})
