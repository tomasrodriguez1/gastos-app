// Llamadas a Groq — siempre best-effort: nunca lanzan, devuelven null ante cualquier
// error (sin API key, red caída, timeout, JSON inválido, lo que sea). El llamador
// nunca debe bloquear la ingesta esperando esto.

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
const TIMEOUT_MS = 5000

async function llamarGroq(mensajes) {
  if (!GROQ_API_KEY) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: mensajes,
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    })
    if (!res.ok) return null

    const data = await res.json()
    const contenido = data?.choices?.[0]?.message?.content
    if (!contenido) return null

    return JSON.parse(contenido)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/

// Se llama solo cuando el parser determinista no reconoce el formato del mail.
// Devuelve { fecha, motivo, monto, usd } | null.
export async function extraerCampos(snippet) {
  if (!snippet) return null

  const resultado = await llamarGroq([
    {
      role: 'system',
      content:
        'Extraes datos de una notificación de movimiento bancario en español (Chile). ' +
        'Responde SOLO un objeto JSON con estas claves: ' +
        '"fecha" (string YYYY-MM-DD, la fecha del movimiento, no la de hoy), ' +
        '"motivo" (string corto: el comercio o descripción del movimiento), ' +
        '"monto" (number: monto en pesos chilenos, entero, 0 si el movimiento fue en USD), ' +
        '"usd" (number: monto en dólares con decimales, 0 si el movimiento fue en CLP). ' +
        'Si no puedes determinar alguno de estos datos con confianza, responde {"fecha":null}.',
    },
    { role: 'user', content: snippet },
  ])

  if (!resultado || typeof resultado !== 'object') return null
  const { fecha, motivo, monto, usd } = resultado
  if (typeof fecha !== 'string' || !FECHA_REGEX.test(fecha)) return null
  if (typeof motivo !== 'string' || !motivo.trim()) return null
  const montoNum = Number(monto) || 0
  const usdNum = Number(usd) || 0
  if (montoNum === 0 && usdNum === 0) return null

  return { fecha, motivo: motivo.trim(), monto: montoNum, usd: usdNum }
}

// Sugiere tipos/contexto a partir del catálogo real (nunca inventa valores fuera de él).
// Devuelve { tipos: string[], contexto: string } | null.
export async function clasificarGasto({ motivo, banco, tiposDisponibles, contextosDisponibles }) {
  if (!motivo || !tiposDisponibles?.length) return null

  const resultado = await llamarGroq([
    {
      role: 'system',
      content:
        'Clasificas un gasto personal según catálogos fijos. Debes elegir SOLO valores que ' +
        'existan en las listas dadas — nunca inventes uno nuevo. Si no estás seguro, deja la ' +
        'lista de tipos vacía o el contexto vacío. Responde SOLO un objeto JSON: ' +
        '{ "tipos": string[], "contexto": string }.\n' +
        `Tipos válidos: ${JSON.stringify(tiposDisponibles)}\n` +
        `Contextos válidos: ${JSON.stringify(contextosDisponibles || [])}`,
    },
    { role: 'user', content: `Comercio/motivo: "${motivo}". Banco: "${banco || 'desconocido'}".` },
  ])

  if (!resultado || typeof resultado !== 'object') return null

  const tiposSugeridos = Array.isArray(resultado.tipos) ? resultado.tipos : []
  const tipos = tiposSugeridos.filter(t => tiposDisponibles.includes(t))

  const contextoSugerido = typeof resultado.contexto === 'string' ? resultado.contexto : ''
  const contexto = (contextosDisponibles || []).includes(contextoSugerido) ? contextoSugerido : ''

  if (tipos.length === 0 && !contexto) return null
  return { tipos, contexto }
}
