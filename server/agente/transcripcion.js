// Transcripción de notas de voz del chat del agente (F3) vía Groq Whisper.
// A diferencia de server/ingesta/groq.js (best-effort, nunca lanza), acá el
// usuario está esperando activamente un resultado — un fallo debe propagarse
// para que el frontend lo muestre y el usuario reintente o escriba a mano.

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo'
const TIMEOUT_MS = 30000

export async function transcribir(audioBlob) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const formData = new FormData()
    formData.append('file', audioBlob, 'nota-de-voz.webm')
    formData.append('model', GROQ_WHISPER_MODEL)
    formData.append('language', 'es')
    formData.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData,
    })
    if (!res.ok) throw new Error(`Groq respondió ${res.status}`)

    const data = await res.json()
    const texto = typeof data?.text === 'string' ? data.text.trim() : ''
    if (!texto) throw new Error('Transcripción vacía')

    return { texto }
  } finally {
    clearTimeout(timeout)
  }
}
