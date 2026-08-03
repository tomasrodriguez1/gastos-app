// Inserción de gastos automáticos — extraído de server/ingesta.js para que
// el agente conversacional (server/agente.js) reutilice el mismo camino que
// la ingesta de mail, en vez de duplicar el INSERT.
//
// Por defecto nace 'pendiente': ni la ingesta de mail ni el agente confirman
// un gasto por sí solos, eso es siempre un acto humano en /bandeja o /log.
// `estado` es override-able solo porque la ingesta de mail también necesita
// insertar como 'error_parseo' cuando ni el regex ni la IA rescatan los
// campos — el agente conversacional nunca usa ese valor.

import sql from '../db/client.js'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../../src/utils/ciclos.js'

export async function crearGastoPendiente({
  fecha,
  motivo,
  monto = 0,
  usd = 0,
  banco = '',
  tipos = [],
  contexto = '',
  presupuesto_manual = null,
  estado = 'pendiente',
  origen,
  fuente_id = null,
  payload_raw = null,
}) {
  const mes = obtenerMesCalendario(fecha)
  const cicloFinanciero = obtenerCicloFinanciero(fecha)
  const gastoId = crypto.randomUUID()

  await sql`
    INSERT INTO gastos (
      id, fecha, mes, ciclo_financiero, motivo, banco, tipos, contexto,
      monto, monto_real, usd, es_manual, estado, origen, fuente_id, payload_raw,
      presupuesto_manual, updated_at
    ) VALUES (
      ${gastoId}, ${fecha}, ${mes}, ${cicloFinanciero}, ${motivo}, ${banco}, ${tipos}, ${contexto},
      ${monto}, ${monto}, ${usd}, false, ${estado}, ${origen}, ${fuente_id}, ${payload_raw},
      ${presupuesto_manual}, NOW()
    )
  `

  return { gastoId, fecha, mes, cicloFinanciero, estado }
}
