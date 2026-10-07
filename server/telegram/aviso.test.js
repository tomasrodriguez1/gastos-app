import { describe, test, expect, mock } from 'bun:test'
import {
  evaluarFlaco,
  textoAvisoPlantilla,
  redactarAviso,
  enviarAvisoTelegram,
  leerMensajeEnviado,
  avisarGastoFlaco,
} from './aviso.js'

const gastoBase = {
  id: 'g-1',
  estado: 'pendiente',
  origen: 'mail',
  fecha: '2026-10-05',
  motivo: 'UNIMARC',
  monto: 12990,
  usd: 0,
  banco: 'Edwards',
  tipos: ['Comida'],
  contexto: 'Personal',
}

describe('evaluarFlaco', () => {
  test('memoria con contexto -> no flaco', () => {
    expect(evaluarFlaco({ estado: 'pendiente', memoria: true, contexto: 'Personal' })).toEqual({ flaco: false, razones: [] })
  })

  test('sin memoria -> flaco aunque el modelo haya puesto contexto', () => {
    expect(evaluarFlaco({ estado: 'pendiente', memoria: false, contexto: 'Personal' })).toEqual({ flaco: true, razones: ['sin_memoria'] })
  })

  test('memoria con contexto vacío -> flaco sin_contexto', () => {
    expect(evaluarFlaco({ estado: 'pendiente', memoria: true, contexto: '' })).toEqual({ flaco: true, razones: ['sin_contexto'] })
  })

  test('error_parseo -> flaco con todas las razones que apliquen', () => {
    expect(evaluarFlaco({ estado: 'error_parseo', memoria: false, contexto: '' }).razones)
      .toEqual(['error_parseo', 'sin_memoria', 'sin_contexto'])
  })
})

describe('textoAvisoPlantilla', () => {
  const unaPregunta = (texto) => (texto.match(/\?/g) || []).length === 1

  test('error_parseo pide comercio y monto', () => {
    const texto = textoAvisoPlantilla({ ...gastoBase, estado: 'error_parseo', motivo: 'Aviso genérico' }, ['error_parseo'])
    expect(texto).toContain('No pude leer')
    expect(texto).toContain('comercio y monto')
    expect(unaPregunta(texto)).toBe(true)
  })

  test('sin tipos ni contexto pregunta qué fue', () => {
    const texto = textoAvisoPlantilla({ ...gastoBase, tipos: [], contexto: '' }, ['sin_memoria', 'sin_contexto'])
    expect(texto).toContain('UNIMARC')
    expect(texto).toContain('$12.990')
    expect(texto).toContain('Edwards')
    expect(unaPregunta(texto)).toBe(true)
  })

  test('sin memoria pero completo pregunta si está bien', () => {
    const texto = textoAvisoPlantilla(gastoBase, ['sin_memoria'])
    expect(texto).toContain('Comida · Personal')
    expect(unaPregunta(texto)).toBe(true)
    expect(texto).not.toMatch(/[*_`]/)
  })

  test('USD se muestra en dólares', () => {
    expect(textoAvisoPlantilla({ ...gastoBase, monto: 0, usd: 23.8 }, ['sin_memoria'])).toContain('US$23,80')
  })
})

describe('redactarAviso', () => {
  test('usa el texto del modelo', async () => {
    const generar = mock(async () => '  UNIMARC $12.990 Edwards. ¿Comida personal?  ')
    expect(await redactarAviso(gastoBase, ['sin_memoria'], { tipos: [], contextos: [] }, { generar }))
      .toBe('UNIMARC $12.990 Edwards. ¿Comida personal?')
    expect(generar).toHaveBeenCalledTimes(1)
  })

  test('si el modelo falla, cae a la plantilla', async () => {
    const generar = mock(async () => { throw new Error('timeout') })
    expect(await redactarAviso(gastoBase, ['sin_memoria'], {}, { generar }))
      .toBe(textoAvisoPlantilla(gastoBase, ['sin_memoria']))
  })

  test('si el modelo devuelve vacío, cae a la plantilla', async () => {
    const generar = mock(async () => '   ')
    expect(await redactarAviso(gastoBase, ['sin_memoria'], {}, { generar }))
      .toBe(textoAvisoPlantilla(gastoBase, ['sin_memoria']))
  })
})

describe('enviarAvisoTelegram', () => {
  test('sin URL no llama a fetch', async () => {
    const fetchFn = mock(async () => new Response('ok'))
    expect(await enviarAvisoTelegram({ texto: 'x' }, { url: '', fetchFn })).toEqual({ enviado: false })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('manda el payload con el Bearer compartido y lee el mensaje enviado', async () => {
    const fetchFn = mock(async () => Response.json({ ok: true, result: { message_id: 4521, chat: { id: 777 } } }))
    const res = await enviarAvisoTelegram({ texto: 'x' }, { url: 'https://n8n.test/webhook', token: 'secreto', fetchFn })
    expect(res).toEqual({ enviado: true, messageId: 4521, chatId: '777' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://n8n.test/webhook')
    expect(init.headers.Authorization).toBe('Bearer secreto')
    expect(JSON.parse(init.body)).toEqual({ texto: 'x' })
  })

  test('webhook que no devuelve el mensaje -> enviado, sin messageId', async () => {
    const fetchFn = mock(async () => new Response('Workflow was started'))
    expect(await enviarAvisoTelegram({ texto: 'x' }, { url: 'https://n8n.test/webhook', fetchFn })).toEqual({ enviado: true })
  })

  test('un fetch que falla no tira excepción', async () => {
    const fetchFn = mock(async () => { throw new Error('ECONNREFUSED') })
    expect(await enviarAvisoTelegram({ texto: 'x' }, { url: 'https://n8n.test/webhook', fetchFn })).toEqual({ enviado: false })
  })
})

describe('leerMensajeEnviado', () => {
  test('acepta la respuesta envuelta en result, directa o en array', () => {
    const esperado = { messageId: 10, chatId: '5' }
    expect(leerMensajeEnviado({ ok: true, result: { message_id: 10, chat: { id: 5 } } })).toEqual(esperado)
    expect(leerMensajeEnviado({ message_id: 10, chat: { id: 5 } })).toEqual(esperado)
    expect(leerMensajeEnviado([{ result: { message_id: 10, chat: { id: 5 } } }])).toEqual(esperado)
  })

  test('sin message_id o sin chat -> null', () => {
    expect(leerMensajeEnviado(null)).toBeNull()
    expect(leerMensajeEnviado({ ok: true })).toBeNull()
    expect(leerMensajeEnviado({ message_id: 10 })).toBeNull()
  })
})

describe('avisarGastoFlaco', () => {
  function deps(gasto, { memoria = null } = {}) {
    return {
      obtenerGasto: mock(async () => gasto),
      buscarComercio: mock(async () => memoria),
      cargarCatalogos: mock(async () => ({ tipos: ['Comida'], contextos: ['Personal'] })),
      redactar: mock(async () => 'texto del aviso'),
      enviar: mock(async () => ({ enviado: true, messageId: 4521, chatId: '777' })),
      registrar: mock(async () => {}),
    }
  }

  test('con memoria y contexto no redacta ni envía', async () => {
    const d = deps(gastoBase)
    expect(await avisarGastoFlaco({ gastoId: 'g-1', origen: 'mail', memoria: true }, d)).toEqual({ flaco: false, razones: [] })
    expect(d.redactar).not.toHaveBeenCalled()
    expect(d.enviar).not.toHaveBeenCalled()
  })

  test('sin memoria envía exactamente un payload con el texto redactado', async () => {
    const d = deps(gastoBase)
    const res = await avisarGastoFlaco({ gastoId: 'g-1', origen: 'mail', memoria: false }, d)
    expect(d.enviar).toHaveBeenCalledTimes(1)
    expect(d.enviar.mock.calls[0][0]).toMatchObject({
      gastoId: 'g-1',
      origen: 'mail',
      banco: 'Edwards',
      motivo: 'UNIMARC',
      monto: 12990,
      flaco: true,
      razones: ['sin_memoria'],
      texto: 'texto del aviso',
    })
    expect(res.enviado).toBe(true)
    expect(d.registrar).toHaveBeenCalledWith({ chatId: '777', messageId: 4521, gastoId: 'g-1', texto: 'texto del aviso' })
    expect(res.registrado).toBe(true)
  })

  test('si el webhook no devolvió el mensaje, no registra', async () => {
    const d = deps(gastoBase)
    d.enviar.mockImplementation(async () => ({ enviado: true }))
    const res = await avisarGastoFlaco({ gastoId: 'g-1', memoria: false }, d)
    expect(d.registrar).not.toHaveBeenCalled()
    expect(res.registrado).toBe(false)
  })

  test('si registrar falla, no tira excepción', async () => {
    const d = deps(gastoBase)
    d.registrar.mockImplementation(async () => { throw new Error('db caída') })
    expect((await avisarGastoFlaco({ gastoId: 'g-1', memoria: false }, d)).registrado).toBe(false)
  })

  test('sin memoria explícita la recalcula contra comercio_mapeo', async () => {
    const d = deps(gastoBase, { memoria: { tipos: ['Comida'], contexto: 'Personal' } })
    expect((await avisarGastoFlaco({ gastoId: 'g-1' }, d)).flaco).toBe(false)
    expect(d.buscarComercio).toHaveBeenCalledWith('UNIMARC')
  })

  test('gasto inexistente o ya confirmado -> error, no envía', async () => {
    const inexistente = deps(null)
    expect(await avisarGastoFlaco({ gastoId: 'x' }, inexistente)).toEqual({ error: 'no_encontrado' })
    const confirmado = deps({ ...gastoBase, estado: 'confirmado' })
    expect(await avisarGastoFlaco({ gastoId: 'g-1' }, confirmado)).toEqual({ error: 'no_pendiente' })
    expect(confirmado.enviar).not.toHaveBeenCalled()
  })
})
