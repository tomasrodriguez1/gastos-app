// Queries de telegram_avisos: qué message_id de qué chat es el aviso de qué
// gasto, para que un turno de chat que responde a ese mensaje resuelva de qué
// gasto se habla sin buscar en la bandeja.
//
// Lo normal es que lo guarde la propia app al enviar (el webhook de n8n le
// devuelve el mensaje que mandó Telegram). POST /api/agente/telegram/avisos
// queda como respaldo para registrarlo desde afuera.

import sql from '../db/client.js'
import { crearConversacion, guardarMensaje } from '../agente/historial.js'

export function idConversacionTelegram(chatId) {
  return `telegram:${chatId}`
}

export async function registrarAviso({ chatId, messageId, gastoId }) {
  await sql`
    INSERT INTO telegram_avisos (chat_id, message_id, gasto_id)
    VALUES (${String(chatId)}, ${messageId}, ${gastoId})
    ON CONFLICT (chat_id, message_id) DO UPDATE SET gasto_id = EXCLUDED.gasto_id
  `
}

// Registra el aviso y, si hay texto, lo agrega al historial de la conversación
// de Telegram como mensaje del agente: al contestar, el modelo ve qué preguntó.
// Id fijo, así un reintento lo pisa en vez de duplicarlo.
export async function registrarAvisoEnviado({ chatId, messageId, gastoId, texto = '' }) {
  await registrarAviso({ chatId, messageId, gastoId })
  if (!texto) return
  const conversacionId = idConversacionTelegram(chatId)
  await crearConversacion(conversacionId)
  await guardarMensaje(conversacionId, {
    id: `aviso:${chatId}:${messageId}`,
    role: 'assistant',
    parts: [{ type: 'text', text: texto }],
  })
}

export async function obtenerAvisoGasto(chatId, messageId) {
  const [row] = await sql`
    SELECT gasto_id FROM telegram_avisos
    WHERE chat_id = ${String(chatId)} AND message_id = ${messageId}
  `
  return row?.gasto_id ?? null
}
