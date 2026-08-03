// Memoria de comercios (F2) — cascada de clasificación gratis-antes-que-LLM.
// Se alimenta desde el hook de aprendizaje en PATCH /api/gastos/:id (ver
// server/index.js) y se consulta desde server/ingesta.js y server/agente.js
// antes de llamar a cualquier IA.

import sql from './db/client.js'
import { normalizarComercio } from '../src/utils/comercio.js'

// Devuelve el mapeo aprendido para un motivo, o null si no hay match o el
// motivo normaliza a vacío. No lanza — un fallo de lookup no debe bloquear
// la clasificación, solo hace que se caiga al LLM.
export async function buscarComercio(motivo) {
  const clave = normalizarComercio(motivo)
  if (!clave) return null

  try {
    const [fila] = await sql`
      SELECT tipos, contexto, presupuesto_manual, banco_habitual, veces_confirmado
      FROM comercio_mapeo
      WHERE comercio_normalizado = ${clave}
      LIMIT 1
    `
    if (!fila) return null

    return {
      tipos: Array.isArray(fila.tipos) ? fila.tipos : [],
      contexto: fila.contexto || '',
      presupuesto_manual: fila.presupuesto_manual || null,
      banco_habitual: fila.banco_habitual || '',
      veces_confirmado: fila.veces_confirmado,
    }
  } catch (error) {
    console.error('[comercios] error en buscarComercio:', error.message)
    return null
  }
}

// Upsert a partir de un gasto ya confirmado (row completo de la tabla gastos,
// tal como lo devuelve `RETURNING *`). Last-write-wins en los campos —
// tu corrección más reciente pisa a la anterior—, acumulativo solo en el
// contador de confianza. Best-effort: nunca debe hacer fallar el guardado
// del gasto que la disparó.
export async function aprenderComercio(gasto) {
  const clave = normalizarComercio(gasto.motivo)
  if (!clave) return

  const tipos = Array.isArray(gasto.tipos)
    ? gasto.tipos
    : (typeof gasto.tipos === 'string' ? JSON.parse(gasto.tipos || '[]') : [])
  const contexto = gasto.contexto_override || gasto.contexto || ''
  if (tipos.length === 0 && !contexto) return

  const presupuestoManual = typeof gasto.presupuesto_manual === 'string'
    ? JSON.parse(gasto.presupuesto_manual)
    : (gasto.presupuesto_manual || null)

  await sql`
    INSERT INTO comercio_mapeo (
      comercio_normalizado, comercio_ejemplo, tipos, contexto,
      presupuesto_manual, banco_habitual, veces_confirmado, ultima_confirmacion
    ) VALUES (
      ${clave}, ${gasto.motivo}, ${tipos}, ${contexto},
      ${presupuestoManual}, ${gasto.banco || ''}, 1, NOW()
    )
    ON CONFLICT (comercio_normalizado) DO UPDATE SET
      comercio_ejemplo = EXCLUDED.comercio_ejemplo,
      tipos = EXCLUDED.tipos,
      contexto = EXCLUDED.contexto,
      presupuesto_manual = EXCLUDED.presupuesto_manual,
      banco_habitual = EXCLUDED.banco_habitual,
      veces_confirmado = comercio_mapeo.veces_confirmado + 1,
      ultima_confirmacion = NOW()
  `
}

export async function listarComercios() {
  return sql`SELECT * FROM comercio_mapeo ORDER BY veces_confirmado DESC, ultima_confirmacion DESC`
}

export async function olvidarComercio(comercioNormalizado) {
  const rows = await sql`
    DELETE FROM comercio_mapeo WHERE comercio_normalizado = ${comercioNormalizado} RETURNING comercio_normalizado
  `
  return rows.length > 0
}
