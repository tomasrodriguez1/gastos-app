// Agente conversacional (F3) — captura de gastos que no llegan por mail
// (BICE, efectivo, transferencias) a partir de una frase libre. Endpoint
// separado de /api/ingesta a propósito: esto es una sesión de browser
// autenticada en tiempo real, no un webhook de n8n con token propio.
//
// Reutiliza exactamente el mismo camino de inserción que server/ingesta.js
// (cargarCatalogos, buscarComercio, crearGastoPendiente) para que un gasto
// creado acá sea indistinguible en /bandeja de uno que llegó por mail, salvo
// por origen='chat'. El agente NUNCA confirma un gasto — siempre nace
// 'pendiente'; confirmarlo sigue siendo un acto humano.
//
// Proveedor: OpenAI vía Vercel AI SDK, deliberadamente separado de Groq
// (server/ingesta/groq.js) — acá se necesita tool calling + streaming de
// pasos, que el flujo de clasificación batch de mails no requiere.

import { Hono } from 'hono'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { cargarCatalogos } from './catalogos.js'
import { buscarComercio } from './comercios.js'
import { crearGastoPendiente } from './gastos/crear.js'

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'

function promptSistema(catalogos, hoy) {
  return [
    'Sos un agente que ayuda a registrar gastos personales en español (Chile) a partir de una frase libre o de fotos de boletas/vouchers/comprobantes.',
    `Hoy es ${hoy}. Si el usuario dice "ayer", "el viernes pasado", etc., calculá la fecha real y respondé siempre en formato YYYY-MM-DD.`,
    'Modismos chilenos de plata: "1 luca" = 1.000 pesos, "2 palos" = 2.000.000 de pesos.',
    '',
    'Sobre imágenes: si el usuario adjunta una o más fotos, cada una es habitualmente una boleta o',
    'comprobante de un gasto distinto — extraé fecha/monto/comercio de cada imagen igual que si te lo',
    'hubiera escrito, y llamá a crear_gasto una vez por cada gasto distinto que identifiques. Solo',
    'tratá varias fotos como un único gasto si el texto del usuario lo indica explícitamente (p.ej.',
    '"estas dos fotos son de la misma compra"). Si una imagen está borrosa o le falta un dato clave,',
    'preguntá puntualmente por ese dato en vez de adivinar el monto — ahí sí no asumas.',
    '',
    'Flujo a seguir:',
    '1. Extraé de lo que el usuario ya escribió o de las imágenes adjuntas todo lo que puedas: fecha, monto (o USD), comercio/motivo, banco.',
    '2. Llamá a la tool buscar_comercio con el comercio para ver si ya lo conocés de confirmaciones anteriores del usuario.',
    '3. Si buscar_comercio no encontró nada, elegí vos mismo tipos y contexto — SOLO valores que existan en estas listas, nunca inventes uno nuevo:',
    `   Tipos válidos: ${JSON.stringify(catalogos.tipos)}`,
    `   Contextos válidos: ${JSON.stringify(catalogos.contextos)}`,
    `   Bancos habituales (orientativo, no es una lista cerrada): ${JSON.stringify(catalogos.bancos)}`,
    '4. Preguntá SOLO el dato puntual que falte y no puedas inferir razonablemente — nunca pidas un formulario completo de una vez. Si ya tenés todo lo necesario, no preguntes nada y pasá directo al paso 5.',
    '5. Llamá a la tool crear_gasto con todo lo que tengas. El gasto queda "pendiente" — vos NUNCA lo confirmás ni lo das por aprobado, eso lo hace la persona en su bandeja de revisión.',
    '',
    'Si algo queda ambiguo y no se resuelve con una pregunta puntual, usá tu mejor criterio, avisá qué asumiste, y creá el gasto igual — total queda pendiente de revisión.',
  ].join('\n')
}

const buscarComercioTool = tool({
  description:
    'Busca si un comercio ya fue clasificado antes a partir de confirmaciones previas del usuario (memoria de comercios). ' +
    'Devuelve los tipos/contexto que se usaron la última vez, o encontrado:false si es la primera vez que aparece.',
  inputSchema: z.object({
    comercio: z.string().describe('El nombre del comercio o motivo del gasto, tal como lo dijo el usuario'),
  }),
  execute: async ({ comercio }) => {
    const memoria = await buscarComercio(comercio)
    if (!memoria) return { encontrado: false }
    return {
      encontrado: true,
      tipos: memoria.tipos,
      contexto: memoria.contexto,
      banco_habitual: memoria.banco_habitual,
      veces_confirmado: memoria.veces_confirmado,
    }
  },
})

function crearGastoToolFactory(catalogos) {
  return tool({
    description: 'Crea el gasto en estado pendiente de revisión humana. Nunca lo confirma — eso pasa después, en /bandeja.',
    inputSchema: z.object({
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Fecha del gasto en formato YYYY-MM-DD'),
      motivo: z.string().describe('Comercio o descripción corta del gasto'),
      monto: z.number().default(0).describe('Monto en pesos chilenos, entero. 0 si el gasto fue en dólares'),
      usd: z.number().default(0).describe('Monto en dólares, con decimales. 0 si el gasto fue en pesos chilenos'),
      banco: z.string().default('').describe('Banco o medio de pago usado'),
      tipos: z.array(z.string()).default([]).describe('Tipos del gasto — solo valores que existan en el catálogo'),
      contexto: z.string().default('').describe('Contexto del gasto — solo un valor que exista en el catálogo'),
    }),
    // Filtro duro server-side, igual criterio que clasificarGasto() en
    // server/ingesta/groq.js: el modelo no es el guardián del catálogo, el
    // prompt le pide que no invente valores pero acá se filtra igual.
    execute: async ({ fecha, motivo, monto, usd, banco, tipos, contexto }) => {
      let tiposValidados = (tipos || []).filter(t => catalogos.tipos.includes(t))
      let contextoValidado = catalogos.contextos.includes(contexto) ? contexto : ''
      let presupuestoManual = null

      if (tiposValidados.length === 0 && !contextoValidado) {
        const memoria = await buscarComercio(motivo)
        if (memoria) {
          tiposValidados = memoria.tipos
          contextoValidado = memoria.contexto
          presupuestoManual = memoria.presupuesto_manual
        }
      }

      const { gastoId } = await crearGastoPendiente({
        fecha,
        motivo,
        monto: monto || 0,
        usd: usd || 0,
        banco: banco || '',
        tipos: tiposValidados,
        contexto: contextoValidado,
        presupuesto_manual: presupuestoManual,
        origen: 'chat',
      })

      const montoTexto = usd ? `US$${usd}` : `$${monto || 0}`
      return {
        gastoId,
        estado: 'pendiente',
        resumen: `Gasto creado: ${motivo} — ${montoTexto} (${fecha}). Queda pendiente en /bandeja.`,
      }
    },
  })
}

export const agenteRouter = new Hono()

agenteRouter.post('/chat', async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    return c.json({ error: 'Agente no configurado: falta OPENAI_API_KEY' }, 503)
  }

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body inválido' }, 400)
  }
  const { messages } = body || {}
  if (!Array.isArray(messages)) return c.json({ error: 'Falta "messages"' }, 400)

  const catalogos = await cargarCatalogos()
  const hoy = new Date().toISOString().slice(0, 10)

  const result = streamText({
    model: openai(OPENAI_MODEL),
    system: promptSistema(catalogos, hoy),
    messages: await convertToModelMessages(messages),
    tools: {
      buscar_comercio: buscarComercioTool,
      crear_gasto: crearGastoToolFactory(catalogos),
    },
    stopWhen: stepCountIs(6),
  })

  return result.toUIMessageStreamResponse()
})
