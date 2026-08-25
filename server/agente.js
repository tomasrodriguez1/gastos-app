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
import { streamText, tool, stepCountIs, convertToModelMessages, generateId } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { cargarCatalogos } from './catalogos.js'
import { buscarComercio } from './comercios.js'
import { crearGastoPendiente } from './gastos/crear.js'
import { actualizarGasto, obtenerGastoPorId } from './gastos/actualizar.js'
import { listarPendientes } from './gastos/pendientes.js'
import {
  crearConversacion,
  guardarMensaje,
  asegurarTitulo,
  listarConversaciones,
  obtenerConversacion,
} from './agente/historial.js'

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'

function promptSistema(catalogos, hoy) {
  return [
    'Sos un agente que ayuda a registrar gastos personales en español (Chile) a partir de una frase libre o de fotos de boletas/vouchers/comprobantes.',
    `Hoy es ${hoy}. Si el usuario dice "ayer", "el viernes pasado", etc., calculá la fecha real y respondé siempre en formato YYYY-MM-DD.`,
    'Modismos chilenos de plata: "1 luca" = 1.000 pesos, "2 palos" = 2.000.000 de pesos.',
    '',
    'Sobre imágenes: si el usuario adjunta una o más fotos, cada una es habitualmente una boleta o',
    'comprobante de un gasto distinto — extraé fecha/monto/comercio de cada imagen igual que si te lo',
    'hubiera escrito, uno por cada gasto distinto que identifiques (sumalos todos al resumen del paso 5,',
    'no llames a crear_gasto todavía). Solo tratá varias fotos como un único gasto si el texto del',
    'usuario lo indica explícitamente (p.ej. "estas dos fotos son de la misma compra"). Si una imagen',
    'está borrosa o le falta un dato clave, preguntá puntualmente por ese dato en vez de adivinar el',
    'monto — ahí sí no asumas.',
    '',
    'Flujo a seguir:',
    '1. Extraé de lo que el usuario ya escribió o de las imágenes adjuntas todo lo que puedas: fecha, monto (o USD), comercio/motivo, banco.',
    '2. Llamá a la tool buscar_comercio con el comercio para ver si ya lo conocés de confirmaciones anteriores del usuario.',
    '3. Si buscar_comercio no encontró nada, elegí vos mismo tipos y contexto — SOLO valores que existan en estas listas, nunca inventes uno nuevo:',
    `   Tipos válidos: ${JSON.stringify(catalogos.tipos)}`,
    `   Contextos válidos: ${JSON.stringify(catalogos.contextos)}`,
    `   Bancos habituales (orientativo, no es una lista cerrada): ${JSON.stringify(catalogos.bancos)}`,
    '4. Si falta un dato puntual que no podés inferir razonablemente, preguntalo — nunca pidas un formulario completo de una vez.',
    '5. Antes de crear nada, mostrale al usuario un resumen breve de cada gasto que vas a crear (fecha,',
    '   monto, comercio, banco, tipo/contexto) y preguntale si está bien así. NO llames a crear_gasto en',
    '   este mismo turno — esperá su respuesta en el siguiente mensaje. Si son varios gastos (p.ej. varias',
    '   fotos), resumilos todos juntos en una sola pregunta.',
    '6. Recién cuando el usuario confirme explícitamente ("sí", "dale", "correcto", "así está bien" o',
    '   similar), llamá a crear_gasto una vez por cada gasto confirmado. Si en cambio te corrige algo,',
    '   actualizá el resumen con la corrección y volvé a preguntar antes de crear — no asumas que ya',
    '   quedó confirmado solo porque te dio un dato más.',
    '',
    'El gasto siempre nace "pendiente" al crearse — vos NUNCA lo confirmás ni lo das por aprobado, eso',
    'lo hace la persona en su bandeja de revisión, incluso después de que ya te confirmó el resumen y',
    'creaste el gasto.',
    '',
    'Si algo queda ambiguo y el usuario no te lo aclara cuando le preguntás, usá tu mejor criterio,',
    'avisá qué asumiste en el resumen, y esperá igual su confirmación antes de crear — total el gasto',
    'queda pendiente de revisión humana después también.',
    '',
    'Corregir un gasto que ya quedó pendiente: si el usuario te pide arreglar algo de un gasto',
    'anterior (propio o llegado por mail — "el almuerzo de ayer en realidad fue 8 lucas", "cambiale',
    'el banco al de Falabella"), primero llamá a buscar_gastos_pendientes (con texto de búsqueda si',
    'lo tenés, o sin texto para ver los últimos) para encontrar el gastoId correcto. Si hay más de',
    'un candidato razonable, preguntá cuál es antes de tocar nada. Después llamá a editar_gasto con',
    'ese gastoId, listá en "campos" EXACTAMENTE los que cambian (nada más) y completá solo esos —',
    'no llenes el resto del formulario con ceros o vacíos, cualquier valor fuera de "campos" se',
    'ignora igual, pero mandarlos confunde. Igual que crear_gasto, editar_gasto NUNCA confirma el',
    'gasto — sigue pendiente hasta que la persona lo confirme en su bandeja. Solo podés editar',
    'gastos que sigan pendientes o en error_parseo; si ya fue confirmado, avisale que ya no se',
    'puede tocar desde acá.',
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

const buscarPendientesTool = tool({
  description:
    'Busca o lista gastos que ya están en la bandeja esperando revisión (estado pendiente o ' +
    'error_parseo), sin importar si llegaron por mail o por chat. Usarla para encontrar el ' +
    'gastoId correcto antes de llamar a editar_gasto.',
  inputSchema: z.object({
    busqueda: z.string().default('').describe('Texto para filtrar por comercio/motivo o banco. Vacío para ver los más recientes'),
  }),
  execute: async ({ busqueda }) => {
    const pendientes = await listarPendientes({ busqueda })
    return {
      total: pendientes.length,
      gastos: pendientes.map(g => ({
        gastoId: g.id,
        fecha: g.fecha,
        motivo: g.motivo,
        monto: g.monto,
        usd: g.usd,
        banco: g.banco,
        tipos: g.tipos,
        contexto: g.contexto,
        estado: g.estado,
        origen: g.origen,
      })),
    }
  },
})

function editarGastoToolFactory(catalogos) {
  return tool({
    description:
      'Corrige campos de un gasto que ya está pendiente o en error_parseo (encontrado con ' +
      'buscar_gastos_pendientes). Nunca puede confirmarlo ni tocar uno ya confirmado — eso sigue ' +
      'siendo un acto humano en /bandeja.',
    inputSchema: z.object({
      gastoId: z.string().describe('El id del gasto a editar, obtenido de buscar_gastos_pendientes'),
      campos: z.array(z.enum(['fecha', 'motivo', 'monto', 'usd', 'banco', 'tipos', 'contexto']))
        .describe('Lista de los campos que EFECTIVAMENTE cambian — solo estos se aplican. Cualquier otro valor presente en esta llamada que no esté listado acá se ignora, así que no completes campos que no cambian.'),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Nueva fecha en formato YYYY-MM-DD — solo se usa si "fecha" está en campos'),
      motivo: z.string().optional().describe('Nuevo comercio o descripción — solo se usa si "motivo" está en campos'),
      monto: z.number().optional().describe('Nuevo monto en pesos chilenos — solo se usa si "monto" está en campos'),
      usd: z.number().optional().describe('Nuevo monto en dólares — solo se usa si "usd" está en campos'),
      banco: z.string().optional().describe('Nuevo banco o medio de pago — solo se usa si "banco" está en campos'),
      tipos: z.array(z.string()).optional().describe('Nuevos tipos — solo valores que existan en el catálogo, solo se usa si "tipos" está en campos'),
      contexto: z.string().optional().describe('Nuevo contexto — solo un valor que exista en el catálogo, solo se usa si "contexto" está en campos'),
    }),
    // No confiar en "vino un valor no-undefined" como señal de intención de
    // cambio: modelos vía tool calling suelen completar TODOS los campos
    // opcionales del schema (con '' / 0 / [] de relleno) en vez de omitir
    // los que no cambian, y aplicar eso a ciegas pisa datos reales con
    // vacíos (visto en vivo: dos llamadas paralelas dejaron motivo="" en
    // una y monto=0 en la otra). Por eso "campos" es la única fuente de
    // verdad de qué tocar — el resto del payload se ignora.
    execute: async ({ gastoId, campos, ...cambios }) => {
      const actual = await obtenerGastoPorId(gastoId)
      if (!actual) return { error: 'No encontré ningún gasto con ese id.' }
      if (actual.estado !== 'pendiente' && actual.estado !== 'error_parseo') {
        return { error: 'Ese gasto ya no está pendiente — no lo puedo editar desde acá, hace falta corregirlo a mano en /bandeja o /log.' }
      }

      const changes = {}
      for (const campo of campos || []) {
        const valor = cambios[campo]
        if (valor === undefined) continue
        if (campo === 'tipos') {
          const filtrados = valor.filter(t => catalogos.tipos.includes(t))
          if (filtrados.length) changes.tipos = filtrados
          continue
        }
        if (campo === 'contexto') {
          if (catalogos.contextos.includes(valor)) changes.contexto = valor
          continue
        }
        changes[campo] = valor
      }

      if (Object.keys(changes).length === 0) return { error: 'No me diste ningún cambio válido para aplicar.' }

      const resultado = await actualizarGasto(gastoId, changes)
      if (resultado.error) return { error: 'No pude editar el gasto.' }

      return {
        ok: true,
        gastoId,
        resumen: `Gasto actualizado: ${resultado.gasto.motivo} — sigue pendiente de revisión en /bandeja.`,
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
  const { messages, conversacionId } = body || {}
  if (!Array.isArray(messages)) return c.json({ error: 'Falta "messages"' }, 400)
  if (!conversacionId) return c.json({ error: 'Falta "conversacionId"' }, 400)

  await crearConversacion(conversacionId)

  const ultimoMensaje = messages[messages.length - 1]
  if (ultimoMensaje?.role === 'user') {
    await guardarMensaje(conversacionId, ultimoMensaje)
    const texto = (ultimoMensaje.parts || [])
      .filter(p => p.type === 'text' && p.text)
      .map(p => p.text)
      .join(' ')
      .trim()
    await asegurarTitulo(conversacionId, texto)
  }

  const catalogos = await cargarCatalogos()
  const hoy = new Date().toISOString().slice(0, 10)

  const result = streamText({
    model: openai(OPENAI_MODEL),
    system: promptSistema(catalogos, hoy),
    messages: await convertToModelMessages(messages),
    tools: {
      buscar_comercio: buscarComercioTool,
      crear_gasto: crearGastoToolFactory(catalogos),
      buscar_gastos_pendientes: buscarPendientesTool,
      editar_gasto: editarGastoToolFactory(catalogos),
    },
    stopWhen: stepCountIs(8),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: generateId,
    onFinish: async ({ responseMessage }) => {
      await guardarMensaje(conversacionId, responseMessage)
    },
  })
})

agenteRouter.get('/conversaciones', async (c) => {
  const conversaciones = await listarConversaciones()
  return c.json(conversaciones)
})

agenteRouter.get('/conversaciones/:id', async (c) => {
  const conversacion = await obtenerConversacion(c.req.param('id'))
  if (!conversacion) return c.json({ error: 'Conversación no encontrada' }, 404)
  return c.json(conversacion)
})
