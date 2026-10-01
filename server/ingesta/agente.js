// Clasificación one-shot de un gasto de mail cuyo comercio no está en memoria.
// Usa el mismo modelo que el agente conversacional (OPENAI_MODEL) y el mismo
// filtro duro de catálogo, pero no abre un chat: no hay un segundo turno donde
// alguien confirme, así que no llama a crear_gasto ni a ninguna tool de escritura.
// Best-effort, igual que server/ingesta/groq.js: cualquier fallo devuelve null
// y la ingesta sigue (Groq, o el gasto pendiente sin clasificar).

import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'
const TIMEOUT_MS = 15_000

const esquemaClasificacion = z.object({
  tipos: z.array(z.string()),
  contexto: z.string(),
})

// Efecto habitual de tipo + contexto sobre grupo/subcategoría. No se persiste:
// lo deriva src/utils/mapeo.js (fallback hardcodeado; las reglas de DB pueden
// pisarlo). Sirve para que el modelo elija un tipo que caiga en la categoría
// correcta, sin inventar un grupo.
const MAPEO_TIPO_CONTEXTO = [
  'Si contexto es Ale: Viaje→ALE/Pasajes, Comida→ALE/Comida, Ocio→ALE/Fiesta, Regalo→ALE/Regalos, Transporte→ALE/Transporte; otro tipo→ALE/Otros.',
  'Si contexto es Trabajo: cualquier tipo→EMPRENDIMIENTO/Zalantos.',
  'Si no: Comida→COMIDA/Restaurantes (o ENTRETENIMIENTO/Carrete si contexto es Amigos), Ocio→ENTRETENIMIENTO/Carrete, Deporte→ENTRETENIMIENTO/Padel, Regalo→ENTRETENIMIENTO/Regalos, Ropa→CUIDADO PERSONAL/Ropa, "Regalo propio"→CUIDADO PERSONAL/Corte de Pelo, Viaje→VIAJES/Pasajes, Transporte→TRANSPORTE/Tag, Mantención→TRANSPORTE/Ahorro Mantenimiento, Auto→TRANSPORTE/Ahorro Patente, Salud→SALUD/Consulta Médica, Suscripcion→HOGAR Y SERVICIOS/Suscripciones, Externo o Proyecto→EMPRENDIMIENTO/Zalantos, Deuda→PRÉSTAMOS Y BANCOS (TC Edwards si el banco es Edwards, TC BICE si es BICE, si no Otras Deudas).',
  'Turno, Ajuste, Unknown, VA, "A medias" y Otro no mapean a una categoría: evitalos salvo que el movimiento sea claramente eso.',
].join(' ')

export function filtrarClasificacion(resultado, tiposDisponibles, contextosDisponibles) {
  if (!resultado || typeof resultado !== 'object') return null

  const tiposSugeridos = Array.isArray(resultado.tipos) ? resultado.tipos : []
  const tipos = tiposSugeridos.filter(t => tiposDisponibles.includes(t))

  const contextoSugerido = typeof resultado.contexto === 'string' ? resultado.contexto : ''
  const contexto = (contextosDisponibles || []).includes(contextoSugerido) ? contextoSugerido : ''

  if (tipos.length === 0 && !contexto) return null
  return { tipos, contexto }
}

function promptSistema(catalogos) {
  return [
    'Clasificás un gasto personal ya extraído de un mail bancario en Chile.',
    'No creás el gasto, no preguntás y no pedís confirmación: solo elegís tipos y contexto.',
    'Elegí SOLO valores que existan en las listas. Nunca inventes uno nuevo.',
    'Si no estás seguro, dejá la lista de tipos vacía y el contexto vacío.',
    `Tipos válidos: ${JSON.stringify(catalogos.tipos)}`,
    `Contextos válidos: ${JSON.stringify(catalogos.contextos || [])}`,
    'Grupo y subcategoría no se guardan en el gasto: se derivan después de tipo + contexto.',
    MAPEO_TIPO_CONTEXTO,
  ].join('\n')
}

async function generarConModelo({ system, prompt }) {
  const { output } = await generateText({
    model: openai(OPENAI_MODEL),
    system,
    prompt,
    maxRetries: 0,
    timeout: TIMEOUT_MS,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    output: Output.object({
      schema: esquemaClasificacion,
      name: 'clasificacion',
      description: 'Tipos y contexto del gasto, solo valores del catálogo',
    }),
  })
  return output
}

// `generar` es inyectable para tests. En producción no se pasa y se usa el modelo.
export async function clasificarConAgente({
  motivo,
  banco,
  monto = 0,
  usd = 0,
  fecha,
  catalogos,
}, { generar } = {}) {
  if (!motivo || !catalogos?.tipos?.length) return null
  if (!generar && !process.env.OPENAI_API_KEY) return null

  try {
    const montoTexto = usd ? `US$${usd}` : `$${monto || 0}`
    const resultado = await (generar ?? generarConModelo)({
      system: promptSistema(catalogos),
      prompt: `Comercio/motivo: "${motivo}". Banco: "${banco || 'desconocido'}". Fecha: ${fecha || 'desconocida'}. Monto: ${montoTexto}.`,
    })
    return filtrarClasificacion(resultado, catalogos.tipos, catalogos.contextos)
  } catch {
    return null
  }
}
