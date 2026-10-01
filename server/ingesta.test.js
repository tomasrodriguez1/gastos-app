import { describe, test, expect, afterAll, afterEach, mock } from 'bun:test'
import { Hono } from 'hono'
import sql from './db/client.js'
import { createIngestaRouter } from './ingesta.js'

// IA inyectada en vez de mockear el módulo — mock.module de Bun reemplaza el módulo para
// todo el proceso de test (contaminaría server/ingesta/groq.test.js si corren juntos, p.ej.
// vía `bun test server`). Estos tests validan la orquestación del endpoint (idempotencia,
// fallback regex->IA, estado resultante), no la IA en sí — eso vive en groq.test.js.
const extraerCamposMock = mock(async () => null)
const clasificarConAgenteMock = mock(async () => null)
const clasificarGastoMock = mock(async () => null)

afterEach(() => {
  extraerCamposMock.mockReset()
  clasificarConAgenteMock.mockReset()
  clasificarGastoMock.mockReset()
  extraerCamposMock.mockImplementation(async () => null)
  clasificarConAgenteMock.mockImplementation(async () => null)
  clasificarGastoMock.mockImplementation(async () => null)
})

const app = new Hono()
app.route('/', createIngestaRouter({
  ia: {
    extraerCampos: extraerCamposMock,
    clasificarConAgente: clasificarConAgenteMock,
    clasificarGasto: clasificarGastoMock,
  },
}))

const TOKEN = process.env.INGESTA_TOKEN
const fuenteIdsCreados = []

afterAll(async () => {
  if (fuenteIdsCreados.length) {
    await sql`DELETE FROM gastos WHERE fuente_id = ANY(${fuenteIdsCreados})`
  }
})

function post(body, token = TOKEN) {
  return app.request('/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function buscarGasto(fuenteId) {
  const [gasto] = await sql`SELECT * FROM gastos WHERE fuente_id = ${fuenteId}`
  return gasto
}

describe('POST /api/ingesta', () => {
  test('token inválido -> 401, no inserta nada', async () => {
    const res = await post([{ id: 'no-deberia-existir' }], 'token-incorrecto')
    expect(res.status).toBe(401)
    expect(await buscarGasto('no-deberia-existir')).toBeUndefined()
  })

  test.skipIf(!TOKEN)('mail conocido de Edwards parsea por regex -> pendiente, clasificado', async () => {
    clasificarGastoMock.mockResolvedValueOnce({ tipos: ['Suscripcion'], contexto: 'Personal' })
    const fuenteId = `test-edwards-${crypto.randomUUID()}`
    fuenteIdsCreados.push(fuenteId)

    const res = await post([{
      id: fuenteId,
      snippet: 'Te informamos que se ha realizado una compra por US$23,80 con Tarjeta de Crédito ****5256 en OPENAI el 06/07/2026 12:40. Revisa Saldos y Movimientos',
      From: 'Banco Edwards <enviodigital@bancoedwards.cl>',
      Subject: 'Compra con Tarjeta de Crédito',
      internalDate: '1783356062000',
    }])
    expect(res.status).toBe(200)
    const { resultados } = await res.json()
    expect(resultados[0].estado).toBe('pendiente')
    expect(extraerCamposMock).not.toHaveBeenCalled()

    const gasto = await buscarGasto(fuenteId)
    expect(gasto.motivo).toBe('OPENAI')
    expect(Number(gasto.usd)).toBeCloseTo(23.8)
    expect(gasto.banco).toBe('Edwards')
    expect(gasto.origen).toBe('mail')
    expect(gasto.tipos).toEqual(['Suscripcion'])
    expect(gasto.contexto).toBe('Personal')
  })

  test.skipIf(!TOKEN)('comercio nuevo: si el agente clasifica, Groq no se llama', async () => {
    clasificarConAgenteMock.mockResolvedValueOnce({ tipos: ['Comida'], contexto: 'Personal' })
    const fuenteId = `test-agente-${crypto.randomUUID()}`
    fuenteIdsCreados.push(fuenteId)
    const comercio = `ZZAGENTE${fuenteId.slice(-8)}`

    const res = await post([{
      id: fuenteId,
      snippet: `Te informamos que se ha realizado una compra por $4.200 con Tarjeta de Crédito ****5256 en ${comercio} el 26/07/2026 13:40.`,
      From: 'Banco Edwards <enviodigital@bancoedwards.cl>',
      Subject: 'Compra con Tarjeta de Crédito',
      internalDate: '1783356062000',
    }])
    expect(res.status).toBe(200)
    const { resultados } = await res.json()
    expect(resultados[0].estado).toBe('pendiente')
    expect(clasificarGastoMock).not.toHaveBeenCalled()

    const gasto = await buscarGasto(fuenteId)
    expect(gasto.motivo).toBe(comercio)
    expect(gasto.tipos).toEqual(['Comida'])
    expect(gasto.contexto).toBe('Personal')
    expect(gasto.origen).toBe('mail')
  })

  test.skipIf(!TOKEN)('desenvuelve el mensaje cuando llega envuelto en { json: {...} } (n8n "Using Fields Below")', async () => {
    const fuenteId = `test-envuelto-${crypto.randomUUID()}`
    fuenteIdsCreados.push(fuenteId)

    const res = await post({
      json: {
        id: fuenteId,
        snippet: 'Te informamos que se ha realizado una compra por $8.500 con Tarjeta de Crédito ****5256 en UBER el 15/07/2026 09:00.',
        From: 'Banco Edwards <enviodigital@bancoedwards.cl>',
        Subject: 'Compra con Tarjeta de Crédito',
        internalDate: '1783356062000',
      },
    })
    expect(res.status).toBe(200)
    const { resultados } = await res.json()
    expect(resultados[0].estado).toBe('pendiente')

    const gasto = await buscarGasto(fuenteId)
    expect(gasto.motivo).toBe('UBER')
    expect(Number(gasto.monto)).toBe(8500)
  })

  test.skipIf(!TOKEN)('fuente_id repetido no duplica el gasto', async () => {
    const fuenteId = `test-dup-${crypto.randomUUID()}`
    fuenteIdsCreados.push(fuenteId)
    const msg = {
      id: fuenteId,
      snippet: 'Te informamos que se ha realizado una compra por $12.990 con Tarjeta de Crédito ****5256 en MERCADO TALMA el 26/07/2026 13:40.',
      From: 'Banco Edwards <enviodigital@bancoedwards.cl>',
      Subject: 'Compra con Tarjeta de Crédito',
      internalDate: '1783356062000',
    }

    await post([msg])
    const res2 = await post([msg])
    const { resultados } = await res2.json()
    expect(resultados[0].duplicado).toBe(true)

    const filas = await sql`SELECT id FROM gastos WHERE fuente_id = ${fuenteId}`
    expect(filas.length).toBe(1)
  })

  test.skipIf(!TOKEN)('subject desconocido y regex/IA fallan -> error_parseo con payload_raw intacto', async () => {
    const fuenteId = `test-errorparseo-${crypto.randomUUID()}`
    fuenteIdsCreados.push(fuenteId)
    const msg = {
      id: fuenteId,
      snippet: 'un mensaje que no matchea ningún patrón conocido',
      From: 'Banco Edwards <enviodigital@bancoedwards.cl>',
      Subject: 'Aviso genérico',
      internalDate: '1783356062000',
    }

    const res = await post([msg])
    const { resultados } = await res.json()
    expect(resultados[0].estado).toBe('error_parseo')

    const gasto = await buscarGasto(fuenteId)
    expect(Number(gasto.monto)).toBe(0)
    expect(gasto.payload_raw).toEqual(msg)
    expect(gasto.tipos).toEqual([])
    expect(clasificarConAgenteMock).not.toHaveBeenCalled()
    expect(clasificarGastoMock).not.toHaveBeenCalled()
  })

  test.skipIf(!TOKEN)('subject desconocido pero la IA rescata los campos -> pendiente', async () => {
    extraerCamposMock.mockResolvedValueOnce({ fecha: '2026-07-20', motivo: 'COMERCIO X', monto: 5000, usd: 0 })
    const fuenteId = `test-extraccion-${crypto.randomUUID()}`
    fuenteIdsCreados.push(fuenteId)

    const res = await post([{
      id: fuenteId,
      snippet: 'texto libre que el regex no reconoce',
      From: 'Banco Edwards <enviodigital@bancoedwards.cl>',
      Subject: 'Otro aviso',
      internalDate: '1783356062000',
    }])
    const { resultados } = await res.json()
    expect(resultados[0].estado).toBe('pendiente')

    const gasto = await buscarGasto(fuenteId)
    expect(gasto.motivo).toBe('COMERCIO X')
    expect(Number(gasto.monto)).toBe(5000)
  })
})

function postTelefono(body, token = TOKEN) {
  return app.request('/telefono', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ingesta/telefono', () => {
  test('token inválido -> 401', async () => {
    const res = await postTelefono({ comercio: 'Uber', monto: 4500 }, 'token-incorrecto')
    expect(res.status).toBe(401)
  })

  test.skipIf(!TOKEN)('data como texto JSON del atajo -> pendiente BICE, clasificado por el agente', async () => {
    clasificarConAgenteMock.mockResolvedValueOnce({ tipos: ['Transporte'], contexto: 'Personal' })
    const comercio = `ZZFONO${crypto.randomUUID().slice(0, 8)}`

    const res = await postTelefono({
      data: JSON.stringify({ comercio, monto: '4.500' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.estado).toBe('pendiente')
    expect(body.duplicado).toBe(false)
    fuenteIdsCreados.push(body.fuente_id)
    expect(clasificarGastoMock).not.toHaveBeenCalled()

    const gasto = await buscarGasto(body.fuente_id)
    expect(gasto.motivo).toBe(comercio)
    expect(Number(gasto.monto)).toBe(4500)
    expect(gasto.banco).toBe('BICE')
    expect(gasto.origen).toBe('telefono')
    expect(gasto.tipos).toEqual(['Transporte'])
    expect(gasto.contexto).toBe('Personal')
  })

  test.skipIf(!TOKEN)('mismo comercio y monto el mismo día no duplica', async () => {
    const comercio = `ZZFONODUP${crypto.randomUUID().slice(0, 8)}`
    const payload = { data: { comercio, monto: 3200 } }

    const primera = await postTelefono(payload)
    const segunda = await postTelefono(payload)
    const body1 = await primera.json()
    const body2 = await segunda.json()
    fuenteIdsCreados.push(body1.fuente_id)

    expect(body1.duplicado).toBe(false)
    expect(body2.duplicado).toBe(true)
    expect(body2.gastoId).toBe(body1.gastoId)

    const filas = await sql`SELECT id FROM gastos WHERE fuente_id = ${body1.fuente_id}`
    expect(filas.length).toBe(1)
  })

  test.skipIf(!TOKEN)('sin comercio o sin monto -> 400, no clasifica', async () => {
    const res = await postTelefono({ data: { comercio: '', monto: 1000 } })
    expect(res.status).toBe(400)
    expect(clasificarConAgenteMock).not.toHaveBeenCalled()
    expect(clasificarGastoMock).not.toHaveBeenCalled()
  })
})
