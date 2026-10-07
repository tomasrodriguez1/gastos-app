import { describe, test, expect, afterAll, afterEach, mock } from 'bun:test'
import { Hono } from 'hono'
import sql from './db/client.js'
import { createTelegramRouter, idConversacionTelegram } from './telegram.js'
import { crearGastoPendiente } from './gastos/crear.js'

// ejecutarTurno y avisar inyectados: estos tests validan auth, el registro de
// avisos y la resolución reply → gasto, sin llamar a OpenAI ni a n8n.
const TOKEN = 'token-telegram-test'
const ejecutarTurnoMock = mock(async () => ({ texto: 'respuesta del agente' }))
const avisarMock = mock(async () => ({ flaco: true, razones: ['sin_memoria'], texto: 'aviso', enviado: false }))

afterEach(() => {
  ejecutarTurnoMock.mockReset()
  ejecutarTurnoMock.mockImplementation(async () => ({ texto: 'respuesta del agente' }))
  avisarMock.mockClear()
})

const app = new Hono()
app.route('/', createTelegramRouter({ token: TOKEN, ejecutarTurno: ejecutarTurnoMock, avisar: avisarMock }))

const CHAT_ID = `test-${crypto.randomUUID().slice(0, 8)}`
const gastosCreados = []

afterAll(async () => {
  await sql`DELETE FROM agente_conversaciones WHERE id = ${idConversacionTelegram(CHAT_ID)}`
  if (gastosCreados.length) {
    await sql`DELETE FROM gastos WHERE id = ANY(${gastosCreados})`
  }
})

function post(path, body, token = TOKEN) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function crearGasto(estado = 'pendiente') {
  const { gastoId } = await crearGastoPendiente({
    fecha: '2026-10-05',
    motivo: `ZZTELEGRAM${crypto.randomUUID().slice(0, 8)}`,
    monto: 1000,
    banco: 'Edwards',
    origen: 'mail',
  })
  if (estado !== 'pendiente') await sql`UPDATE gastos SET estado = ${estado} WHERE id = ${gastoId}`
  gastosCreados.push(gastoId)
  return gastoId
}

describe('auth', () => {
  test('sin token o con token malo -> 401 en los tres endpoints', async () => {
    for (const path of ['/chat', '/avisos', '/aviso']) {
      expect((await post(path, {}, null)).status).toBe(401)
      expect((await post(path, {}, 'otro')).status).toBe(401)
    }
    expect(ejecutarTurnoMock).not.toHaveBeenCalled()
  })

  test('sin token configurado en el servidor -> 401 siempre', async () => {
    const sinToken = new Hono()
    sinToken.route('/', createTelegramRouter({ token: '', ejecutarTurno: ejecutarTurnoMock }))
    const res = await sinToken.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' },
      body: JSON.stringify({ conversacionId: 1, texto: 'hola' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /avisos', () => {
  test('gasto inexistente -> 404', async () => {
    const res = await post('/avisos', { gastoId: 'no-existe', chatId: CHAT_ID, messageId: 1 })
    expect(res.status).toBe(404)
  })

  test('gasto confirmado -> 409 y no guarda', async () => {
    const gastoId = await crearGasto('confirmado')
    const res = await post('/avisos', { gastoId, chatId: CHAT_ID, messageId: 2 })
    expect(res.status).toBe(409)
    const filas = await sql`SELECT 1 FROM telegram_avisos WHERE chat_id = ${CHAT_ID} AND message_id = 2`
    expect(filas.length).toBe(0)
  })

  test('faltan campos -> 400', async () => {
    expect((await post('/avisos', { gastoId: 'x', chatId: CHAT_ID })).status).toBe(400)
  })

  test('gasto pendiente -> registra y guarda el texto en el historial', async () => {
    const gastoId = await crearGasto()
    const res = await post('/avisos', { gastoId, chatId: CHAT_ID, messageId: '3', texto: 'UNIMARC $1.000. ¿Qué fue?' })
    expect(res.status).toBe(200)

    const [aviso] = await sql`SELECT gasto_id FROM telegram_avisos WHERE chat_id = ${CHAT_ID} AND message_id = 3`
    expect(aviso.gasto_id).toBe(gastoId)
    const mensajes = await sql`SELECT role FROM agente_mensajes WHERE conversacion_id = ${idConversacionTelegram(CHAT_ID)}`
    expect(mensajes.map(m => m.role)).toEqual(['assistant'])
  })
})

describe('POST /chat', () => {
  test('sin texto -> 400', async () => {
    expect((await post('/chat', { conversacionId: CHAT_ID, texto: '  ' })).status).toBe(400)
  })

  test('mensaje suelto -> turno normal, sin gasto', async () => {
    const res = await post('/chat', { conversacionId: CHAT_ID, texto: '¿cómo voy?' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, texto: 'respuesta del agente' })
    expect(ejecutarTurnoMock.mock.calls[0][0]).toEqual({
      conversacionId: idConversacionTelegram(CHAT_ID),
      texto: '¿cómo voy?',
      gasto: null,
      avisoSinRegistro: false,
    })
  })

  test('reply a un aviso registrado -> pasa el gasto al turno', async () => {
    const gastoId = await crearGasto()
    await post('/avisos', { gastoId, chatId: CHAT_ID, messageId: 10 })

    await post('/chat', { conversacionId: CHAT_ID, texto: 'es comida, personal', replyToMessageId: 10 })
    const { gasto, avisoSinRegistro } = ejecutarTurnoMock.mock.calls[0][0]
    expect(gasto.id).toBe(gastoId)
    expect(avisoSinRegistro).toBe(false)
  })

  test('reply a un mensaje sin registro -> turno normal avisando', async () => {
    await post('/chat', { conversacionId: CHAT_ID, texto: 'hola', replyToMessageId: 999999 })
    const { gasto, avisoSinRegistro } = ejecutarTurnoMock.mock.calls[0][0]
    expect(gasto).toBeNull()
    expect(avisoSinRegistro).toBe(true)
  })

  test('si el turno falla -> 502 con un texto para mandar igual', async () => {
    ejecutarTurnoMock.mockImplementation(async () => { throw new Error('openai caído') })
    const res = await post('/chat', { conversacionId: CHAT_ID, texto: 'hola' })
    expect(res.status).toBe(502)
    expect((await res.json()).texto).toBeTruthy()
  })
})

describe('POST /aviso', () => {
  test('delega en avisarGastoFlaco y devuelve el texto', async () => {
    const res = await post('/aviso', { gastoId: 'g-1' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, flaco: true, texto: 'aviso' })
    expect(avisarMock).toHaveBeenCalledWith({ gastoId: 'g-1' })
  })

  test('gasto ya confirmado -> 409', async () => {
    avisarMock.mockImplementationOnce(async () => ({ error: 'no_pendiente' }))
    expect((await post('/aviso', { gastoId: 'g-1' })).status).toBe(409)
  })
})
