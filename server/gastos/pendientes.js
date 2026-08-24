// Listado/búsqueda de gastos pendientes de revisión (bandeja) — usado por el
// tool buscar_gastos_pendientes del agente conversacional (server/agente.js)
// para encontrar el gastoId correcto antes de editarlo. No existía ningún
// endpoint con este filtro server-side; hoy el filtro por estado pendiente
// solo pasa client-side en BandejaPage.jsx.

import sql from '../db/client.js'
import { deserializarGasto } from './serializacion.js'

export async function listarPendientes({ busqueda = '', limite = 15 } = {}) {
  const termino = busqueda.trim()
  const rows = termino
    ? await sql`
        SELECT * FROM gastos
        WHERE estado IN ('pendiente', 'error_parseo')
          AND (motivo ILIKE ${'%' + termino + '%'} OR banco ILIKE ${'%' + termino + '%'})
        ORDER BY created_at DESC
        LIMIT ${limite}
      `
    : await sql`
        SELECT * FROM gastos
        WHERE estado IN ('pendiente', 'error_parseo')
        ORDER BY created_at DESC
        LIMIT ${limite}
      `
  return rows.map(deserializarGasto)
}
