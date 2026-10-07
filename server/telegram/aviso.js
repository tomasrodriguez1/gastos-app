// Aviso proactivo por Telegram de un gasto de tarjeta que entró "flaco" por la
// ingesta (Edwards por mail, BICE por teléfono). La app decide si avisar, el
// modelo del agente redacta el texto y n8n solo lo transporta a Telegram:
// POST a N8N_TELEGRAM_AVISO_URL, un gasto = un POST = un mensaje. El webhook
// responde con el mensaje que mandó Telegram ("Respond: When Last Node
// Finishes"), y la app registra ese message_id → gasto para atar la respuesta.
//
// Todo es best-effort: sin URL configurada no se manda nada, y ningún fallo
// (modelo, red, n8n) sube hasta la ingesta. Si el modelo no responde, el texto
// sale de una plantilla fija para que nunca quede un aviso sin texto.

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { cargarCatalogos } from '../catalogos.js'
import { buscarComercio } from '../comercios.js'
import { obtenerGastoPorId } from '../gastos/actualizar.js'
import { registrarAvisoEnviado } from './avisos.js'

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'
const TIMEOUT_REDACCION_MS = 15_000
// El webhook espera a que Telegram envíe el mensaje antes de responder.
const TIMEOUT_ENVIO_MS = 15_000

export const ESTADOS_EDITABLES = ['pendiente', 'error_parseo']

// Flaco = el gasto necesita que la persona lo complete. Con hit de memoria y
// contexto lleno no se avisa: los tipos/contexto vienen de una confirmación
// humana anterior.
export function evaluarFlaco({ estado, memoria, contexto }) {
  const razones = []
  if (estado === 'error_parseo') razones.push('error_parseo')
  if (!memoria) razones.push('sin_memoria')
  if (!contexto) razones.push('sin_contexto')
  return { flaco: razones.length > 0, razones }
}

function montoTexto({ monto, usd }) {
  if (usd) return `US$${Number(usd).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${Math.round(Number(monto) || 0).toLocaleString('es-CL')}`
}

export function textoAvisoPlantilla(gasto, razones) {
  const banco = gasto.banco || 'la tarjeta'
  if (razones.includes('error_parseo')) {
    return `No pude leer un cargo de ${banco} ("${gasto.motivo}"). ¿Me dices comercio y monto?`
  }
  const cabecera = `${gasto.motivo} · ${montoTexto(gasto)} · ${banco}.`
  const tipos = gasto.tipos || []
  if (!gasto.contexto && tipos.length === 0) return `${cabecera} ¿Qué fue y con qué contexto lo dejo?`
  if (!gasto.contexto) return `${cabecera} Lo dejé como ${tipos.join(', ')}. ¿Qué contexto le pongo?`
  const clasificacion = tipos.length ? `${tipos.join(', ')} · ${gasto.contexto}` : gasto.contexto
  return `${cabecera} Lo clasifiqué como ${clasificacion}. ¿Está bien?`
}

function promptRedaccion(catalogos) {
  return [
    'Redactas un aviso corto de Telegram sobre un gasto de tarjeta que acaba de entrar a la app de gastos personales y le falta información.',
    'Español de Chile, tuteo, texto plano: sin Markdown, sin asteriscos, sin listas. Máximo 2 líneas.',
    'Incluye comercio, monto y banco tal como vienen. Termina con UNA sola pregunta, solo por lo que falta:',
    '- error_parseo: di que no se pudo leer el cargo y pide comercio y monto.',
    '- sin tipos ni contexto: pregunta qué fue y con qué contexto dejarlo.',
    '- con tipos pero sin_contexto: di cómo quedó y pregunta el contexto.',
    '- sin_memoria pero con tipos y contexto: di cómo lo clasificaste y pregunta si está bien.',
    'No inventes datos ni ofrezcas confirmar el gasto: queda pendiente en la bandeja.',
    `Si sugieres un tipo o contexto, solo de estas listas. Tipos: ${JSON.stringify(catalogos?.tipos || [])}. Contextos: ${JSON.stringify(catalogos?.contextos || [])}.`,
  ].join('\n')
}

async function generarConModelo({ system, prompt }) {
  const { text } = await generateText({
    model: openai(OPENAI_MODEL),
    system,
    prompt,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(TIMEOUT_REDACCION_MS),
  })
  return text
}

// `generar` es inyectable para tests, igual que server/ingesta/agente.js.
export async function redactarAviso(gasto, razones, catalogos, { generar } = {}) {
  if (!generar && !process.env.OPENAI_API_KEY) return textoAvisoPlantilla(gasto, razones)
  try {
    const texto = await (generar ?? generarConModelo)({
      system: promptRedaccion(catalogos),
      prompt: JSON.stringify({
        razones,
        estado: gasto.estado,
        fecha: gasto.fecha,
        comercio: gasto.motivo,
        monto: montoTexto(gasto),
        banco: gasto.banco || '',
        tipos: gasto.tipos || [],
        contexto: gasto.contexto || '',
      }),
    })
    const limpio = typeof texto === 'string' ? texto.trim() : ''
    return limpio || textoAvisoPlantilla(gasto, razones)
  } catch (error) {
    console.warn('[telegram] no se pudo redactar el aviso, uso plantilla:', error.message)
    return textoAvisoPlantilla(gasto, razones)
  }
}

// Lo que responde el webhook es la salida del nodo Telegram de n8n: según la
// versión del nodo viene envuelta en `result` (respuesta cruda de la Bot API)
// o directo. Se aceptan las dos, y también un array de un elemento.
export function leerMensajeEnviado(respuesta) {
  const primero = Array.isArray(respuesta) ? respuesta[0] : respuesta
  const mensaje = primero?.result ?? primero
  const messageId = Number(mensaje?.message_id)
  const chatId = mensaje?.chat?.id
  if (!Number.isSafeInteger(messageId) || chatId == null || chatId === '') return null
  return { messageId, chatId: String(chatId) }
}

export async function enviarAvisoTelegram(payload, {
  url = process.env.N8N_TELEGRAM_AVISO_URL,
  token = process.env.TELEGRAM_AGENTE_TOKEN,
  fetchFn = fetch,
} = {}) {
  if (!url) return { enviado: false }
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
    })
    if (!res.ok) {
      console.warn(`[telegram] webhook de aviso respondió ${res.status}`)
      return { enviado: false }
    }
    const mensaje = leerMensajeEnviado(await res.json().catch(() => null))
    if (!mensaje) {
      console.warn('[telegram] el webhook de aviso no devolvió el mensaje enviado: la respuesta no quedará atada al gasto')
    }
    return { enviado: true, ...mensaje }
  } catch (error) {
    console.warn('[telegram] no se pudo enviar el aviso:', error.message)
    return { enviado: false }
  }
}

export const depsAvisoPorDefecto = {
  obtenerGasto: obtenerGastoPorId,
  buscarComercio,
  cargarCatalogos,
  redactar: redactarAviso,
  enviar: enviarAvisoTelegram,
  registrar: registrarAvisoEnviado,
}

// Orquesta un aviso: lo usa la ingesta (fire-and-forget, con `memoria` del
// momento de clasificar) y POST /api/agente/telegram/aviso (sin `memoria`, se
// recalcula contra comercio_mapeo).
export async function avisarGastoFlaco({ gastoId, origen, memoria }, deps = depsAvisoPorDefecto) {
  const gasto = await deps.obtenerGasto(gastoId)
  if (!gasto) return { error: 'no_encontrado' }
  if (!ESTADOS_EDITABLES.includes(gasto.estado)) return { error: 'no_pendiente' }

  const hayMemoria = memoria ?? Boolean(await deps.buscarComercio(gasto.motivo))
  const { flaco, razones } = evaluarFlaco({ estado: gasto.estado, memoria: hayMemoria, contexto: gasto.contexto })
  if (!flaco) return { flaco: false, razones: [] }

  const catalogos = await deps.cargarCatalogos()
  const texto = await deps.redactar(gasto, razones, catalogos)
  const payload = {
    gastoId: gasto.id,
    origen: origen || gasto.origen,
    banco: gasto.banco || '',
    fecha: gasto.fecha,
    motivo: gasto.motivo,
    monto: gasto.monto || 0,
    usd: gasto.usd || 0,
    tipos: gasto.tipos || [],
    contexto: gasto.contexto || '',
    flaco: true,
    razones,
    texto,
  }
  const { enviado, messageId, chatId } = await deps.enviar(payload)

  let registrado = false
  if (enviado && messageId != null && chatId) {
    try {
      await deps.registrar({ chatId, messageId, gastoId: gasto.id, texto })
      registrado = true
    } catch (error) {
      console.warn('[telegram] no se pudo registrar el aviso:', error.message)
    }
  }
  return { ...payload, enviado, registrado }
}

// Default de la ingesta: sin webhook configurado no tiene sentido leer el
// gasto ni gastar una llamada al modelo para redactar algo que no se envía.
export async function avisarGastoFlacoSiConfigurado(datos) {
  if (!process.env.N8N_TELEGRAM_AVISO_URL) return { enviado: false }
  return avisarGastoFlaco(datos)
}
