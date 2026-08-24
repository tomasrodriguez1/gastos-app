// Actualización de gastos — extraído de PATCH /api/gastos/:id (server/index.js)
// para que el tool editar_gasto del agente conversacional (server/agente.js)
// reutilice exactamente la misma lógica (whitelist, recálculo de ciclo,
// aprendizaje de comercio) en vez de duplicarla.

import sql from '../db/client.js'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../../src/utils/ciclos.js'
import { deserializarGasto, serializarCampoGasto } from './serializacion.js'
import { aprenderComercio } from '../comercios.js'

const CAMPOS_EDITABLES = [
  'fecha', 'motivo', 'banco', 'tipos', 'contexto', 'monto', 'monto_real',
  'usd', 'monto_clp_manual', 'split', 'pagado', 'estado',
  'plata_en_cuenta', 'en_presupuesto',
  'presupuesto_manual', 'contexto_override', 'monto_presupuesto_manual',
]

export async function actualizarGasto(id, changes) {
  const fields = Object.keys(changes).filter(k => CAMPOS_EDITABLES.includes(k))
  if (fields.length === 0) return { error: 'sin_campos' }

  const updates = {}
  for (const f of fields) updates[f] = serializarCampoGasto(f, changes[f])
  if (fields.includes('fecha')) {
    try {
      updates.mes = obtenerMesCalendario(changes.fecha)
      updates.ciclo_financiero = obtenerCicloFinanciero(changes.fecha)
    } catch (error) {
      return { error: 'fecha_invalida', message: error.message }
    }
  }

  const rows = await sql`
    UPDATE gastos
    SET ${sql(updates)}, updated_at = NOW()
    WHERE id = ${id} OR sync_key = ${id}
    RETURNING *
  `
  if (rows.length === 0) return { error: 'no_encontrado' }

  // Memoria de comercios (F2): aprender de una confirmación humana es un
  // side-effect best-effort — nunca debe hacer fallar el guardado del gasto
  // que lo disparó. No aprende de pendientes editados, solo de confirmaciones.
  if (rows[0].estado === 'confirmado') {
    try {
      await aprenderComercio(rows[0])
    } catch (error) {
      console.error('[comercios] no se pudo aprender:', error.message)
    }
  }

  return { gasto: deserializarGasto(rows[0]) }
}

export async function obtenerGastoPorId(id) {
  const [row] = await sql`SELECT * FROM gastos WHERE id = ${id} OR sync_key = ${id}`
  return row ? deserializarGasto(row) : null
}
