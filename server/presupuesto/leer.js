// Lectura del presupuesto de un ciclo — extraído de server/index.js para que
// el agente (consultas de estado) y el GET /api/presupuesto/:ciclo compartan
// la misma forma, sin duplicar el armado de ingresos/categorías/fondos.

import sql from '../db/client.js'
import { toMonto } from '../db/numeric.js'

export async function leerPresupuestoCiclo(ciclo) {
  const [cicloFila] = await sql`SELECT ciclo FROM presupuesto_ciclo WHERE ciclo = ${ciclo}`
  if (!cicloFila) return null

  const ingresoRows = await sql`SELECT fuente, monto FROM presupuesto_ingreso WHERE ciclo = ${ciclo}`
  const categoriaRows = await sql`SELECT grupo, subcategoria, previsto, fgp FROM presupuesto_categoria WHERE ciclo = ${ciclo} ORDER BY grupo, subcategoria`
  const fondoRows = await sql`SELECT nombre, previsto_aportar, acumulado, objetivo, fecha_meta, vinculado, emoji, estado FROM presupuesto_fondo WHERE ciclo = ${ciclo}`

  const ingresos = {}
  for (const r of ingresoRows) ingresos[r.fuente] = toMonto(r.monto)

  const categorias = {}
  for (const r of categoriaRows) {
    if (!categorias[r.grupo]) categorias[r.grupo] = { subcategorias: {} }
    categorias[r.grupo].subcategorias[r.subcategoria] = {
      previsto: toMonto(r.previsto),
      fgp: r.fgp === true,
    }
  }

  const fondos = {}
  for (const r of fondoRows) {
    const vinculado = typeof r.vinculado === 'string'
      ? JSON.parse(r.vinculado)
      : (r.vinculado ?? null)
    fondos[r.nombre] = {
      previsto_aportar: toMonto(r.previsto_aportar),
      acumulado: toMonto(r.acumulado),
      objetivo: toMonto(r.objetivo),
      estado: r.estado === 'cerrado' ? 'cerrado' : 'activo',
      ...(r.emoji && { emoji: r.emoji }),
      ...(r.fecha_meta && { fecha_meta: r.fecha_meta }),
      ...(vinculado && { vinculado }),
    }
  }

  return { ingresos, categorias, fondos }
}
