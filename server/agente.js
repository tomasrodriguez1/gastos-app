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
import { bodyLimit } from 'hono/body-limit'
import { streamText, tool, stepCountIs, convertToModelMessages, generateId } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { cargarCatalogos } from './catalogos.js'
import { buscarComercio } from './comercios.js'
import { crearGastoPendiente } from './gastos/crear.js'
import { actualizarGasto, obtenerGastoPorId } from './gastos/actualizar.js'
import { listarPendientes, resumirBandeja } from './gastos/pendientes.js'
import { buscarSimilares } from './duplicados.js'
import { resumenCiclo, buscarGastosCiclo } from './consultas/ciclo.js'
import {
  crearConversacion,
  guardarMensaje,
  asegurarTitulo,
  listarConversaciones,
  obtenerConversacion,
} from './agente/historial.js'
import { transcribir } from './agente/transcripcion.js'
import { cargarReservasActivas, registrarSaldo } from './reservas.js'
import { obtenerCicloActual } from '../src/utils/ciclos.js'

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'

function promptSistema(catalogos, hoy, reservas, cicloActual) {
  const grupos = (catalogos.grupos || []).map(g => ({
    grupo: g.nombre,
    subcategorias: (g.subcategorias || []).map(s => s.nombre),
  }))
  return [
    'Sos un agente que ayuda a registrar gastos personales en español (Chile) a partir de una frase libre o de fotos de boletas/vouchers/comprobantes, a revisar la bandeja de pendientes y a responder cómo va el ciclo financiero.',
    `Hoy es ${hoy}. El ciclo financiero actual es ${cicloActual} (corte día 29 del mes anterior al 28 del mes nominal). Si el usuario dice "este mes" o "cómo voy", usá ese ciclo, no el mes calendario, salvo que pida un YYYY-MM concreto.`,
    'Si el usuario dice "ayer", "el viernes pasado", etc., calculá la fecha real y respondé siempre en formato YYYY-MM-DD.',
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
    'Flujo a seguir para crear un gasto:',
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
    '7. Si crear_gasto responde bloqueado=true, hay un posible duplicado (p.ej. el mismo cargo ya llegó',
    '   por mail). Mostrá los candidatos (fecha, comercio, monto, banco, origen) y esperá. NO lo confirmés',
    '   en bandeja. Solo si el usuario insiste ("igual crealo", "no es el mismo") volvé a llamar con',
    '   ignorar_duplicado=true. Nunca pongas ignorar_duplicado=true en la primera llamada.',
    '',
    'El gasto siempre nace "pendiente" al crearse — vos NUNCA lo confirmás ni lo das por aprobado, eso',
    'lo hace la persona en su bandeja de revisión, incluso después de que ya te confirmó el resumen y',
    'creaste el gasto. Tampoco ofrezcas confirmar en bloque: eso se hace en /bandeja.',
    '',
    'Si algo queda ambiguo y el usuario no te lo aclara cuando le preguntás, usá tu mejor criterio,',
    'avisá qué asumiste en el resumen, y esperá igual su confirmación antes de crear — total el gasto',
    'queda pendiente de revisión humana después también.',
    '',
    'Triage de la bandeja (lote, sin confirmar): si pregunta qué hay pendiente, de un banco, o quiere',
    'revisar varios ("¿qué hay pendiente de Edwards?", "los de error de parseo"):',
    '1. Llamá primero a resumir_bandeja (con banco si lo mencionó) y contá el lote (cantidad, bancos, montos).',
    '2. Después buscar_gastos_pendientes para listar breve: fecha, comercio, monto, banco, gastoId corto.',
    '3. Esperá instrucción por ítem ("el de Unimarc cámbiale el tipo a supermercado"). No edites el lote entero de una.',
    '4. Si hay más de un candidato, preguntá cuál es antes de tocar nada.',
    '5. Editar de a uno con editar_gasto. Si hay más que el límite, ofrecé continuar con offset.',
    '6. NUNCA confirmes ni ofrezcas confirmar pendientes — ni uno ni en bloque.',
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
    '',
    'Preguntas de estado del ciclo (solo lectura, no escribas presupuesto): "¿cómo voy?", "¿cuánto me',
    'queda en comida?", "¿qué categoría está en rojo?", "¿cuánto gasté en Uber?". Usá resumen_ciclo',
    'para el panorama (semaforos, restante, en_rojo) y buscar_gastos para un comercio o para filtrar',
    'por grupo. Mapeá nombres coloquiales a estos grupos/subcategorías — nunca inventes un grupo:',
    `   ${JSON.stringify(grupos)}`,
    'Si pide un ciclo pasado, pasá ciclo=YYYY-MM. No inventes números: si la tool no trae dato, decilo.',
    '',
    'Saldos de reservas de ahorro (bolsillos externos, ej. Mercado Pago — mantención auto, patente,',
    'vacaciones, plata para terceros): si el usuario adjunta una foto que muestra saldos de',
    '"bolsillos"/reservas (no una boleta de compra), tu tarea es distinta a la de un gasto — extraé',
    'cada nombre de bolsillo visible y su monto, y mapealo por nombre a una de estas reservas',
    'activas (nunca inventes una reserva que no esté en la lista; si no reconocés el match,',
    'preguntá o decí explícitamente que no la reconociste):',
    `   Reservas activas: ${JSON.stringify(reservas.map(r => ({ id: r.id, nombre: r.nombre, emoji: r.emoji })))}`,
    'Mostrale al usuario un resumen de qué leíste (reserva → monto) y esperá su confirmación',
    'explícita en el turno siguiente — igual que con crear_gasto — antes de llamar a',
    'registrar_saldos_reserva. Si el usuario corrige un monto antes de confirmar, actualizá el',
    'resumen y volvé a preguntar. registrar_saldos_reserva es idempotente por fecha: si ya se',
    'registró un saldo hoy y el usuario da un número distinto, se corrige solo, sin que hagas nada',
    'especial — no hace falta ninguna tool de corrección aparte.',
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

export async function ejecutarCrearGasto(catalogos, {
  fecha,
  motivo,
  monto = 0,
  usd = 0,
  banco = '',
  tipos = [],
  contexto = '',
  ignorar_duplicado = false,
}) {
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

  if (!ignorar_duplicado) {
    const candidatos = await buscarSimilares({
      fecha,
      motivo,
      monto: monto || 0,
      usd: usd || 0,
      banco: banco || '',
    })
    if (candidatos.length) {
      return {
        bloqueado: true,
        candidatos,
        resumen: `No creé el gasto: encontré ${candidatos.length} posible${candidatos.length === 1 ? '' : 's'} duplicado${candidatos.length === 1 ? '' : 's'}. Mostráselos al usuario y esperá. Si insiste, volvé a llamar con ignorar_duplicado=true.`,
      }
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
}

function crearGastoToolFactory(catalogos) {
  return tool({
    description:
      'Crea el gasto en estado pendiente de revisión humana. Nunca lo confirma — eso pasa después, en /bandeja. ' +
      'Si encuentra un posible duplicado, NO inserta y devuelve bloqueado=true; solo reintentar con ignorar_duplicado=true si el usuario insiste.',
    inputSchema: z.object({
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Fecha del gasto en formato YYYY-MM-DD'),
      motivo: z.string().describe('Comercio o descripción corta del gasto'),
      monto: z.number().default(0).describe('Monto en pesos chilenos, entero. 0 si el gasto fue en dólares'),
      usd: z.number().default(0).describe('Monto en dólares, con decimales. 0 si el gasto fue en pesos chilenos'),
      banco: z.string().default('').describe('Banco o medio de pago usado'),
      tipos: z.array(z.string()).default([]).describe('Tipos del gasto — solo valores que existan en el catálogo'),
      contexto: z.string().default('').describe('Contexto del gasto — solo un valor que exista en el catálogo'),
      ignorar_duplicado: z.boolean().default(false).describe('true solo si el usuario insistió en crear aunque haya un posible duplicado'),
    }),
    // Filtro duro server-side, igual criterio que clasificarGasto() en
    // server/ingesta/groq.js: el modelo no es el guardián del catálogo, el
    // prompt le pide que no invente valores pero acá se filtra igual.
    execute: async (input) => ejecutarCrearGasto(catalogos, input),
  })
}

const buscarPendientesTool = tool({
  description:
    'Busca o lista gastos que ya están en la bandeja esperando revisión (estado pendiente o ' +
    'error_parseo), sin importar si llegaron por mail o por chat. Usarla para encontrar el ' +
    'gastoId correcto antes de llamar a editar_gasto, o para listar un lote después de resumir_bandeja.',
  inputSchema: z.object({
    busqueda: z.string().default('').describe('Texto para filtrar por comercio/motivo o banco. Vacío para ver los más recientes'),
    banco: z.string().default('').describe('Filtro por banco (coincide parcial, case-insensitive)'),
    estado: z.enum(['', 'pendiente', 'error_parseo']).default('').describe('Vacío = ambos estados de bandeja'),
    tipos: z.array(z.string()).default([]).describe('Si hay valores, el gasto debe incluir al menos uno'),
    limite: z.number().int().min(1).max(30).default(15),
    offset: z.number().int().min(0).default(0).describe('Para pedir los siguientes después del primer lote'),
  }),
  execute: async ({ busqueda, banco, estado, tipos, limite, offset }) => {
    const pendientes = await listarPendientes({ busqueda, banco, estado, tipos, limite, offset })
    return {
      total: pendientes.length,
      offset: offset || 0,
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

const resumirBandejaTool = tool({
  description:
    'Resumen agregado de la bandeja (conteos por banco/estado/origen y suma), sin listar cada gasto. ' +
    'Usarla primero cuando el usuario pregunta qué hay pendiente o pide un lote.',
  inputSchema: z.object({
    banco: z.string().default('').describe('Opcional: filtrar por banco (p.ej. Edwards)'),
  }),
  execute: async ({ banco }) => resumirBandeja({ banco }),
})

const resumenCicloTool = tool({
  description:
    'Resumen de solo lectura del ciclo financiero: gastado vs presupuesto, semáforos por grupo, ' +
    'categorías en rojo y pendientes sin clasificar. Default: ciclo actual (corte 29–28).',
  inputSchema: z.object({
    ciclo: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('YYYY-MM del ciclo. Omitir = ciclo actual'),
  }),
  execute: async ({ ciclo }) => resumenCiclo({ ciclo }),
})

const buscarGastosTool = tool({
  description:
    'Busca gastos de un ciclo (confirmados y pendientes) por comercio/motivo y/o grupo presupuestario. ' +
    'Para "cuánto gasté en Uber" o "cuánto va en comida". No escribe nada.',
  inputSchema: z.object({
    texto: z.string().default('').describe('Texto a buscar en el motivo/comercio'),
    ciclo: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('YYYY-MM del ciclo. Omitir = ciclo actual'),
    grupo: z.string().default('').describe('Nombre o fragmento del grupo presupuestario (p.ej. comida)'),
  }),
  execute: async ({ texto, ciclo, grupo }) => buscarGastosCiclo({ texto, ciclo, grupo }),
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

// Registra saldo(s) de reserva leídos de una foto. A diferencia de crear_gasto,
// escribe directo (sin estado 'pendiente' en DB) — nunca escribe a `gastos` ni
// a `presupuesto_*`, solo lee de ahí para calcular el esperado, y es corregible
// con un simple upsert por (reserva, fecha). La garantía de "el usuario vio el
// número antes de que cuente" no es un gate de DB acá sino el mismo patrón
// conversacional de crear_gasto: el prompt le pide al modelo mostrar el resumen
// y esperar confirmación explícita antes de llamar a esta tool.
function registrarSaldosReservaToolFactory(reservas) {
  return tool({
    description:
      'Registra el/los saldo(s) leído(s) de una o más reservas (bolsillos de ahorro) para hoy o ' +
      'la fecha indicada, y calcula si calzan contra lo esperado según los gastos de su categoría ' +
      'vinculada. Idempotente por (reserva, fecha): un segundo llamado el mismo día corrige el anterior.',
    inputSchema: z.object({
      lecturas: z.array(z.object({
        reservaId: z.number().int().describe('Id de la reserva, tomado de la lista de reservas activas'),
        monto: z.number().describe('Saldo leído en la foto, en pesos chilenos'),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Fecha del saldo mostrado (normalmente hoy)'),
      })).min(1).describe('Una entrada por cada bolsillo/reserva reconocido en la(s) foto(s)'),
    }),
    execute: async ({ lecturas }) => {
      const resultados = []
      for (const { reservaId, monto, fecha } of lecturas) {
        const reserva = reservas.find(r => r.id === reservaId)
        if (!reserva) {
          resultados.push({ reservaId, error: 'No reconocí esa reserva.' })
          continue
        }
        const r = await registrarSaldo({ reservaId, monto, fecha })
        if (r.error) {
          resultados.push({ reservaId, error: r.error })
          continue
        }
        resultados.push({
          reservaId,
          nombre: reserva.nombre,
          monto_leido: monto,
          monto_esperado: r.montoEsperado,
          diferencia: r.diferencia,
          no_calza: r.noCalza,
          resumen: r.montoEsperado == null
            ? `${reserva.emoji} ${reserva.nombre}: primera lectura, sin línea base.`
            : `${reserva.emoji} ${reserva.nombre}: leído $${monto} vs esperado $${Math.round(r.montoEsperado)}` +
              (r.noCalza ? ` — ⚠ no calza (dif. $${Math.round(r.diferencia)})` : ' — cuadra'),
        })
      }
      return { resultados }
    },
  })
}

export const agenteRouter = new Hono()

agenteRouter.post(
  '/chat',
  bodyLimit({ maxSize: 20 * 1024 * 1024, onError: (c) => c.json({ error: 'Mensaje demasiado grande (¿muchas fotos?)' }, 413) }),
  async (c) => {
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

  const [catalogos, reservas] = await Promise.all([cargarCatalogos(), cargarReservasActivas()])
  const hoy = new Date().toISOString().slice(0, 10)
  const cicloActual = obtenerCicloActual()

  const result = streamText({
    model: openai(OPENAI_MODEL),
    system: promptSistema(catalogos, hoy, reservas, cicloActual),
    messages: await convertToModelMessages(messages),
    tools: {
      buscar_comercio: buscarComercioTool,
      crear_gasto: crearGastoToolFactory(catalogos),
      buscar_gastos_pendientes: buscarPendientesTool,
      resumir_bandeja: resumirBandejaTool,
      editar_gasto: editarGastoToolFactory(catalogos),
      registrar_saldos_reserva: registrarSaldosReservaToolFactory(reservas),
      resumen_ciclo: resumenCicloTool,
      buscar_gastos: buscarGastosTool,
    },
    stopWhen: stepCountIs(16),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: generateId,
    onFinish: async ({ responseMessage }) => {
      await guardarMensaje(conversacionId, responseMessage)
    },
  })
  },
)

// Transcripción de notas de voz (F3) — el texto resultante se trata en el
// cliente exactamente como si el usuario lo hubiera escrito: llena el input
// del chat, no se envía solo. Límite de body explícito porque no hay ninguno
// configurado a nivel global y un audio en base64/multipart puede ser grande.
agenteRouter.post(
  '/transcribir',
  bodyLimit({ maxSize: 20 * 1024 * 1024, onError: (c) => c.json({ error: 'Audio demasiado grande' }, 413) }),
  async (c) => {
    if (!process.env.GROQ_API_KEY) {
      return c.json({ error: 'Transcripción no configurada: falta GROQ_API_KEY' }, 503)
    }

    let formData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Body inválido' }, 400)
    }
    const audio = formData.get('audio')
    if (!(audio instanceof Blob) || audio.size === 0) {
      return c.json({ error: 'Falta el audio' }, 400)
    }

    try {
      const { texto } = await transcribir(audio)
      return c.json({ texto })
    } catch {
      return c.json({ error: 'No se pudo transcribir el audio' }, 502)
    }
  },
)

agenteRouter.get('/conversaciones', async (c) => {
  const conversaciones = await listarConversaciones()
  return c.json(conversaciones)
})

agenteRouter.get('/conversaciones/:id', async (c) => {
  const conversacion = await obtenerConversacion(c.req.param('id'))
  if (!conversacion) return c.json({ error: 'Conversación no encontrada' }, 404)
  return c.json(conversacion)
})
