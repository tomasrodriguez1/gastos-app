// Historial de conversaciones del agente conversacional (F3). Persiste los
// UIMessage tal como los maneja @ai-sdk/react (id/role/parts[]) — los
// tool-parts (crear_gasto, editar_gasto, ...) ya vienen con su input/output
// adentro, así que reabrir una conversación pasada también reconstruye las
// acciones que tomó el agente, sin un modelo de datos aparte para eso.

import sql from '../db/client.js'

// Crea la conversación la primera vez que llega un mensaje — si el usuario
// nunca escribe nada, no queda una fila vacía en la tabla.
export async function crearConversacion(id) {
  await sql`
    INSERT INTO agente_conversaciones (id) VALUES (${id})
    ON CONFLICT (id) DO NOTHING
  `
}

export async function guardarMensaje(conversacionId, mensaje) {
  if (!mensaje?.id) return
  await sql`
    INSERT INTO agente_mensajes (id, conversacion_id, role, parts)
    VALUES (${mensaje.id}, ${conversacionId}, ${mensaje.role}, ${mensaje.parts || []})
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      parts = EXCLUDED.parts
  `
  await sql`UPDATE agente_conversaciones SET updated_at = NOW() WHERE id = ${conversacionId}`
}

// Se fija una sola vez, con el primer texto del usuario — no se pisa en
// mensajes siguientes.
export async function asegurarTitulo(conversacionId, texto) {
  if (!texto) return
  await sql`
    UPDATE agente_conversaciones
    SET titulo = ${texto.slice(0, 60)}
    WHERE id = ${conversacionId} AND titulo IS NULL
  `
}

export async function listarConversaciones() {
  return sql`
    SELECT id, titulo, created_at, updated_at
    FROM agente_conversaciones
    ORDER BY updated_at DESC
    LIMIT 200
  `
}

export async function obtenerConversacion(id) {
  const [conversacion] = await sql`
    SELECT id, titulo, created_at, updated_at FROM agente_conversaciones WHERE id = ${id}
  `
  if (!conversacion) return null

  const mensajes = await sql`
    SELECT id, role, parts FROM agente_mensajes
    WHERE conversacion_id = ${id}
    ORDER BY created_at ASC
  `

  return { ...conversacion, mensajes }
}
