import { describe, test, expect, afterEach } from 'bun:test'

// GROQ_API_KEY se lee una sola vez al importar el módulo — setearla antes del import.
process.env.GROQ_API_KEY = 'test-key'
const { clasificarGasto, extraerCampos } = await import('./groq.js')

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

function mockRespuestaGroq(contenido) {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(contenido) } }] }),
  })
}

describe('clasificarGasto', () => {
  test('descarta tipos y contexto inventados que no están en el catálogo dado', async () => {
    mockRespuestaGroq({ tipos: ['TipoFalso', 'Comida'], contexto: 'ContextoFalso' })

    const resultado = await clasificarGasto({
      motivo: 'Test',
      banco: 'Edwards',
      tiposDisponibles: ['Comida', 'Ocio'],
      contextosDisponibles: ['Personal'],
    })

    expect(resultado.tipos).toEqual(['Comida'])
    expect(resultado.contexto).toBe('')
  })

  test('devuelve null si Groq responde con error HTTP', async () => {
    global.fetch = async () => ({ ok: false })
    const resultado = await clasificarGasto({
      motivo: 'Test', banco: '', tiposDisponibles: ['Comida'], contextosDisponibles: [],
    })
    expect(resultado).toBeNull()
  })

  test('devuelve null sin llamar a la red si no hay motivo', async () => {
    let llamado = false
    global.fetch = async () => { llamado = true; return { ok: true, json: async () => ({}) } }
    const resultado = await clasificarGasto({ motivo: '', tiposDisponibles: ['Comida'] })
    expect(resultado).toBeNull()
    expect(llamado).toBe(false)
  })
})

describe('extraerCampos', () => {
  test('descarta una respuesta con fecha en formato inválido', async () => {
    mockRespuestaGroq({ fecha: 'no-es-fecha', motivo: 'X', monto: 100, usd: 0 })
    const resultado = await extraerCampos('snippet cualquiera')
    expect(resultado).toBeNull()
  })

  test('descarta una respuesta sin monto ni usd', async () => {
    mockRespuestaGroq({ fecha: '2026-07-20', motivo: 'X', monto: 0, usd: 0 })
    const resultado = await extraerCampos('snippet cualquiera')
    expect(resultado).toBeNull()
  })

  test('acepta una respuesta válida', async () => {
    mockRespuestaGroq({ fecha: '2026-07-20', motivo: 'Comercio X', monto: 5000, usd: 0 })
    const resultado = await extraerCampos('snippet cualquiera')
    expect(resultado).toEqual({ fecha: '2026-07-20', motivo: 'Comercio X', monto: 5000, usd: 0 })
  })
})
