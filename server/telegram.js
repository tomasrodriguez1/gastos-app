// Canal Telegram del agente conversacional. n8n es solo el tubo: recibe el
// mensaje (o transcribe la nota de voz), llama acá con texto plano y manda la
// respuesta a Telegram. El cerebro es el mismo de /agente (construirAgente en
// server/agente.js): mismo modelo, prompt, tools y tope de pasos.
//
// Auth: Bearer TELEGRAM_AGENTE_TOKEN, timing-safe, mismo patrón que /mcp. Sin
// token configurado o sin Bearer correcto → 401 siempre, también en dev; por
// eso se monta antes del gate global (ver server/index.js y createAuthMiddleware).
//
// A diferencia de POST /api/agente/chat (stream de sesión de browser con el
// historial en el body), acá el historial vive en el servidor: n8n solo manda
// el texto nuevo y recibe JSON { texto }.

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { streamText, convertToModelMessages, generateId } from 'ai'
import { timingSafeEqualString } from './auth.js'
import { construirAgente } from './agente.js'
import { cargarCatalogos } from './catalogos.js'
import { cargarReservasActivas } from './reservas.js'
import {
  crearConversacion,
  guardarMensaje,
  asegurarTitulo,
  ultimosMensajes,
} from './agente/historial.js'
import { obtenerGastoPorId } from './gastos/actualizar.js'
import { registrarAvisoEnviado, obtenerAvisoGasto, idConversacionTelegram } from './telegram/avisos.js'
import { avisarGastoFlaco, ESTADOS_EDITABLES } from './telegram/aviso.js'

const MAX_BODY_BYTES = 64 * 1024
const LIMITE_HISTORIAL = 40
const RESPUESTA_FALLO = 'No pude procesar el mensaje, intenta de nuevo.'

function tokenBearer(c) {
  const authHeader = c.req.header('Authorization') || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
}

// Telegram manda chat.id y message_id como números; n8n puede pasarlos como
// texto según cómo esté armado el nodo.
function leerEntero(valor) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor
  return Number.isSafeInteger(n) ? n : null
}

function leerChatId(valor) {
  if (typeof valor === 'number' && Number.isSafeInteger(valor)) return String(valor)
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  return null
}

export { idConversacionTelegram }

const NOTA_CANAL = 'Canal: respondes por Telegram. Texto plano, breve, sin Markdown (sin asteriscos, sin tablas, sin encabezados).'

function instruccionesTurno({ gasto, avisoSinRegistro }) {
  if (gasto) {
    const datos = {
      gastoId: gasto.id,
      fecha: gasto.fecha,
      motivo: gasto.motivo,
      monto: gasto.monto,
      usd: gasto.usd,
      banco: gasto.banco,
      tipos: gasto.tipos,
      contexto: gasto.contexto,
      estado: gasto.estado,
      origen: gasto.origen,
    }
    const lineas = [
      `Este mensaje responde al aviso del gasto ${gasto.id}. Estás completando ese gasto; no hace falta buscarlo en la bandeja. Datos actuales: ${JSON.stringify(datos)}`,
      'Pregunta solo lo que falta y aplica lo que te diga con editar_gasto sobre ese gastoId, sin pedir confirmación previa. En "campos" van únicamente los que cambian (fecha, motivo, monto, usd, banco, tipos, contexto).',
      'El gasto sigue pendiente: no lo confirmes ni ofrezcas confirmarlo. Si editar_gasto lo rechaza porque ya no está pendiente o en error_parseo, dilo en una frase y no reintentes.',
    ]
    if (!ESTADOS_EDITABLES.includes(gasto.estado)) {
      lineas.push(`Ojo: ese gasto ya está "${gasto.estado}", ya no se puede editar desde acá. Dilo en una frase.`)
    }
    return lineas.join('\n')
  }
  if (avisoSinRegistro) {
    return 'El usuario respondió a un mensaje que no corresponde a un aviso de gasto registrado: dilo en una frase y sigue con su mensaje como un turno normal.'
  }
  return ''
}

function textoDeMensaje(mensaje) {
  return (mensaje?.parts || [])
    .filter(p => p.type === 'text' && p.text)
    .map(p => p.text.trim())
    .filter(Boolean)
    .join('\n\n')
}

// Un turno completo, sin streaming hacia afuera: carga historial, corre el
// agente, guarda ambos mensajes en el mismo formato UIMessage que el chat web
// (así la conversación también se puede reabrir en /agente) y devuelve el texto.
export async function ejecutarTurnoTelegram({ conversacionId, texto, gasto = null, avisoSinRegistro = false }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Agente no configurado: falta OPENAI_API_KEY')

  await crearConversacion(conversacionId)
  await asegurarTitulo(conversacionId, texto)

  const historial = await ultimosMensajes(conversacionId, LIMITE_HISTORIAL)
  const mensajeUsuario = { id: generateId(), role: 'user', parts: [{ type: 'text', text: texto }] }
  await guardarMensaje(conversacionId, mensajeUsuario)
  const mensajes = [...historial, mensajeUsuario]

  const [catalogos, reservas] = await Promise.all([cargarCatalogos(), cargarReservasActivas()])
  const extraSistema = [NOTA_CANAL, instruccionesTurno({ gasto, avisoSinRegistro })].filter(Boolean).join('\n\n')

  const result = streamText({
    ...construirAgente({ catalogos, reservas, extraSistema }),
    messages: await convertToModelMessages(mensajes),
  })

  let respuesta = null
  let errorStream = null
  const stream = result.toUIMessageStream({
    originalMessages: mensajes,
    generateMessageId: generateId,
    onError: (error) => {
      errorStream = error
      return 'error'
    },
    onFinish: async ({ responseMessage }) => {
      respuesta = responseMessage
      await guardarMensaje(conversacionId, responseMessage)
    },
  })
  // Drenar el stream: la respuesta completa llega por onFinish.
  await stream.pipeTo(new WritableStream())

  if (errorStream) throw errorStream
  return { texto: textoDeMensaje(respuesta) || (await result.text).trim() }
}

export function createTelegramRouter({
  token = process.env.TELEGRAM_AGENTE_TOKEN,
  ejecutarTurno = ejecutarTurnoTelegram,
  avisar = avisarGastoFlaco,
  obtenerGasto = obtenerGastoPorId,
} = {}) {
  const router = new Hono()

  router.use('*', async (c, next) => {
    const provisto = tokenBearer(c)
    if (!token || !provisto || !timingSafeEqualString(provisto, token)) {
      c.header('WWW-Authenticate', 'Bearer')
      return c.json({ ok: false, error: 'No autorizado' }, 401)
    }
    return next()
  })

  router.use('*', bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ ok: false, error: 'Body demasiado grande' }, 413),
  }))

  async function leerBody(c) {
    try {
      return await c.req.json()
    } catch {
      return null
    }
  }

  // Aviso de un gasto flaco: evalúa, el agente redacta y se envía a n8n. La
  // ingesta llama a la misma función por dentro; esto sirve para reenviar a
  // mano un aviso que se perdió o probar la redacción.
  router.post('/aviso', async (c) => {
    const body = await leerBody(c)
    const gastoId = typeof body?.gastoId === 'string' ? body.gastoId.trim() : ''
    if (!gastoId) return c.json({ ok: false, error: 'Falta "gastoId"' }, 400)

    const resultado = await avisar({ gastoId })
    if (resultado.error === 'no_encontrado') return c.json({ ok: false, error: 'Gasto no encontrado' }, 404)
    if (resultado.error === 'no_pendiente') return c.json({ ok: false, error: 'El gasto ya no está pendiente' }, 409)
    return c.json({
      ok: true,
      flaco: resultado.flaco,
      razones: resultado.razones,
      texto: resultado.texto ?? null,
      enviado: resultado.enviado ?? false,
      registrado: resultado.registrado ?? false,
    })
  })

  // Respaldo: lo normal es que la app registre el aviso sola con la respuesta
  // del webhook de n8n (server/telegram/aviso.js). Esto permite registrarlo
  // desde afuera si el webhook no devolvió el mensaje enviado.
  router.post('/avisos', async (c) => {
    const body = await leerBody(c)
    const gastoId = typeof body?.gastoId === 'string' ? body.gastoId.trim() : ''
    const chatId = leerChatId(body?.chatId)
    const messageId = leerEntero(body?.messageId)
    if (!gastoId || !chatId || messageId == null) {
      return c.json({ ok: false, error: 'Faltan gastoId, chatId o messageId' }, 400)
    }

    const gasto = await obtenerGasto(gastoId)
    if (!gasto) return c.json({ ok: false, error: 'Gasto no encontrado' }, 404)
    if (!ESTADOS_EDITABLES.includes(gasto.estado)) {
      return c.json({ ok: false, error: 'El gasto ya no está pendiente' }, 409)
    }

    const texto = typeof body?.texto === 'string' ? body.texto.trim() : ''
    await registrarAvisoEnviado({ chatId, messageId, gastoId: gasto.id, texto })

    return c.json({ ok: true })
  })

  router.post('/chat', async (c) => {
    const body = await leerBody(c)
    const chatId = leerChatId(body?.conversacionId)
    const texto = typeof body?.texto === 'string' ? body.texto.trim() : ''
    if (!chatId) return c.json({ ok: false, error: 'Falta "conversacionId"' }, 400)
    if (!texto) return c.json({ ok: false, error: 'Falta "texto"' }, 400)

    let gasto = null
    let avisoSinRegistro = false
    const replyTo = body?.replyToMessageId
    if (replyTo != null && replyTo !== '') {
      const messageId = leerEntero(replyTo)
      const gastoId = messageId == null ? null : await obtenerAvisoGasto(chatId, messageId)
      gasto = gastoId ? await obtenerGasto(gastoId) : null
      avisoSinRegistro = !gasto
    }

    try {
      const { texto: respuesta } = await ejecutarTurno({
        conversacionId: idConversacionTelegram(chatId),
        texto,
        gasto,
        avisoSinRegistro,
      })
      return c.json({ ok: true, texto: respuesta || RESPUESTA_FALLO })
    } catch (error) {
      console.error('[telegram] turno falló:', error.message)
      return c.json({ ok: false, texto: RESPUESTA_FALLO }, 502)
    }
  })

  return router
}

export const telegramRouter = createTelegramRouter()
