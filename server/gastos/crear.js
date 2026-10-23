// Inserción de gastos automáticos — extraído de server/ingesta.js para que
// el agente conversacional (server/agente.js) reutilice el mismo camino que
// la ingesta de mail, en vez de duplicar el INSERT.
//
// Por defecto nace 'pendiente': ni la ingesta de mail ni el agente confirman
// un gasto por sí solos, eso es siempre un acto humano en /bandeja o /log.
// `estado` es override-able solo porque la ingesta de mail también necesita
// insertar como 'error_parseo' cuando ni el regex ni la IA rescatan los
// campos — el agente conversacional nunca usa ese valor.
//
// Viajes (DEC-024): `viaje_id` undefined = autodetectar (el único viaje 'en_curso' cuyo rango
// cubre la fecha); null = sin viaje; string = ese viaje. Con viaje, el presupuesto_manual pasa a
// ser la sugerencia del viaje (ALE/VIAJES) aunque la memoria de comercios trajera otro — el
// mismo Uber de todos los días, en un viaje, es gasto del viaje. Sigue naciendo 'pendiente'.

import sql from '../db/client.js'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../../src/utils/ciclos.js'
import { sugerirAsignacionViaje, viajeEnCursoParaFecha } from '../../src/utils/viajes.js'

// Best-effort: un fallo al buscar viajes nunca debe impedir registrar el gasto.
export async function resolverViajeParaGasto(viajeId, fecha, db = sql) {
  try {
    if (viajeId === null) return null
    if (typeof viajeId === 'string' && viajeId) {
      const [row] = await db`SELECT id FROM viaje WHERE id = ${viajeId}`
      return row?.id || null
    }
    const enCurso = await db`SELECT id, fecha_desde, fecha_hasta, estado FROM viaje WHERE estado = 'en_curso'`
    return viajeEnCursoParaFecha(enCurso, fecha)?.id || null
  } catch (error) {
    console.error('[viajes] no se pudo resolver viaje:', error.message)
    return null
  }
}

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
  viaje_id = undefined,
}) {
  const viajeId = await resolverViajeParaGasto(viaje_id, fecha)
  if (viajeId) presupuesto_manual = sugerirAsignacionViaje({ tipos, contexto })

  const mes = obtenerMesCalendario(fecha)
  const cicloFinanciero = obtenerCicloFinanciero(fecha)
  const gastoId = crypto.randomUUID()

  await sql`
    INSERT INTO gastos (
      id, fecha, mes, ciclo_financiero, motivo, banco, tipos, contexto,
      monto, monto_real, usd, es_manual, estado, origen, fuente_id, payload_raw,
      presupuesto_manual, viaje_id, updated_at
    ) VALUES (
      ${gastoId}, ${fecha}, ${mes}, ${cicloFinanciero}, ${motivo}, ${banco}, ${tipos}, ${contexto},
      ${monto}, ${monto}, ${usd}, false, ${estado}, ${origen}, ${fuente_id}, ${payload_raw},
      ${presupuesto_manual}, ${viajeId}, NOW()
    )
  `

  return { gastoId, fecha, mes, cicloFinanciero, estado, viajeId }
}
