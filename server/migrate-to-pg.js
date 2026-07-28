/**
 * Script one-shot: migra datos del SQLite local → PostgreSQL.
 * Ejecutar una sola vez: bun run migrate:pg
 * Es idempotente (ON CONFLICT DO NOTHING en todos los inserts).
 */

import { Database } from 'bun:sqlite'
import { resolve } from 'path'
import sql from './db/client.js'
import { initSchema } from './db/init.js'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../src/utils/ciclos.js'

const SQLITE_PATH = resolve(import.meta.dir, '../data/gastos.db')
console.log(`[migrate] Leyendo SQLite: ${SQLITE_PATH}`)
const db = new Database(SQLITE_PATH, { readonly: true })

function toBool(v) { return v === 1 || v === true }

await initSchema()
console.log('[migrate] Schema PG listo\n')

// ─── 1. catalogo_grupo ───────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM catalogo_grupo').all()
  console.log(`[migrate] catalogo_grupo: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO catalogo_grupo (id, nombre, orden) VALUES (${r.id}, ${r.nombre}, ${r.orden}) ON CONFLICT DO NOTHING`
  }
}

// ─── 2. catalogo_subcategoria ────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM catalogo_subcategoria').all()
  console.log(`[migrate] catalogo_subcategoria: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO catalogo_subcategoria (id, grupo_id, nombre, orden) VALUES (${r.id}, ${r.grupo_id}, ${r.nombre}, ${r.orden}) ON CONFLICT DO NOTHING`
  }
}

// ─── 3. catalogo_tipo ────────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM catalogo_tipo').all()
  console.log(`[migrate] catalogo_tipo: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO catalogo_tipo (id, nombre, orden) VALUES (${r.id}, ${r.nombre}, ${r.orden}) ON CONFLICT DO NOTHING`
  }
}

// ─── 4. catalogo_banco ───────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM catalogo_banco').all()
  console.log(`[migrate] catalogo_banco: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO catalogo_banco (id, nombre, orden) VALUES (${r.id}, ${r.nombre}, ${r.orden}) ON CONFLICT DO NOTHING`
  }
}

// ─── 5. catalogo_contexto ────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM catalogo_contexto').all()
  console.log(`[migrate] catalogo_contexto: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO catalogo_contexto (id, nombre, orden) VALUES (${r.id}, ${r.nombre}, ${r.orden}) ON CONFLICT DO NOTHING`
  }
}

// ─── 6. gastos ───────────────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM gastos').all()
  console.log(`[migrate] gastos: ${rows.length} filas`)
  await sql.begin(async (tx) => {
    for (const r of rows) {
      // tipos y presupuesto_manual están como JSON strings en SQLite → Postgres los castea a JSONB
      await tx`
        INSERT INTO gastos (
          id, sync_key, fecha, mes, ciclo_financiero, motivo, banco, tipos, contexto,
          monto, monto_real, usd, monto_clp_manual, split,
          presupuesto_manual, contexto_override, monto_presupuesto_manual,
          es_manual, pagado, created_at, updated_at
        ) VALUES (
          ${r.id}, ${r.sync_key ?? null}, ${r.fecha}, ${obtenerMesCalendario(r.fecha)},
          ${obtenerCicloFinanciero(r.fecha)}, ${r.motivo},
          ${r.banco || ''}, ${r.tipos || '[]'}, ${r.contexto || ''},
          ${r.monto || 0}, ${r.monto_real || 0}, ${r.usd || 0},
          ${r.monto_clp_manual ?? null}, ${r.split || 0},
          ${r.presupuesto_manual ?? null},
          ${r.contexto_override ?? null}, ${r.monto_presupuesto_manual ?? null},
          ${toBool(r.es_manual)}, ${toBool(r.pagado)},
          ${r.created_at ?? null}, ${r.updated_at ?? null}
        )
        ON CONFLICT DO NOTHING
      `
    }
  })
}

// ─── 7. presupuesto_ciclo ────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM presupuesto_mes').all()
  console.log(`[migrate] presupuesto_ciclo: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO presupuesto_ciclo (ciclo, created_at, updated_at) VALUES (${r.mes}, ${r.created_at ?? null}, ${r.updated_at ?? null}) ON CONFLICT DO NOTHING`
  }
}

// ─── 8. presupuesto_ingreso ──────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM presupuesto_ingreso').all()
  console.log(`[migrate] presupuesto_ingreso: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO presupuesto_ingreso (ciclo, fuente, monto) VALUES (${r.mes}, ${r.fuente}, ${r.monto}) ON CONFLICT DO NOTHING`
  }
}

// ─── 9. presupuesto_categoria ────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM presupuesto_categoria').all()
  console.log(`[migrate] presupuesto_categoria: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO presupuesto_categoria (ciclo, grupo, subcategoria, previsto, fgp) VALUES (${r.mes}, ${r.grupo}, ${r.subcategoria}, ${r.previsto}, ${toBool(r.fgp)}) ON CONFLICT DO NOTHING`
  }
}

// ─── 10. presupuesto_fondo ───────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM presupuesto_fondo').all()
  console.log(`[migrate] presupuesto_fondo: ${rows.length} filas`)
  for (const r of rows) {
    await sql`
      INSERT INTO presupuesto_fondo (ciclo, nombre, previsto_aportar, acumulado, objetivo, fecha_meta, vinculado, emoji)
      VALUES (
        ${r.mes}, ${r.nombre},
        ${r.previsto_aportar || 0}, ${r.acumulado || 0},
        ${r.objetivo ?? null}, ${r.fecha_meta ?? null},
        ${r.vinculado ?? null}, ${r.emoji ?? null}
      )
      ON CONFLICT DO NOTHING
    `
  }
}

// ─── 11. regla_mapeo ─────────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM regla_mapeo').all()
  console.log(`[migrate] regla_mapeo: ${rows.length} filas`)
  for (const r of rows) {
    await sql`
      INSERT INTO regla_mapeo (prioridad, contexto, tipo, banco, motivo_regex, grupo_dest, subcat_dest, descripcion, activa)
      VALUES (${r.prioridad}, ${r.contexto ?? null}, ${r.tipo ?? null}, ${r.banco ?? null}, ${r.motivo_regex ?? null}, ${r.grupo_dest}, ${r.subcat_dest ?? null}, ${r.descripcion ?? null}, ${toBool(r.activa ?? 1)})
    `
  }
}

// ─── 12. duplicado_exclusion ─────────────────────────────────────────────────
{
  let rows = []
  try {
    rows = db.prepare('SELECT * FROM duplicado_exclusion').all()
  } catch {
    console.log('[migrate] duplicado_exclusion: tabla no existe en SQLite (ok)')
  }
  console.log(`[migrate] duplicado_exclusion: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO duplicado_exclusion (gasto_id_a, gasto_id_b, created_at) VALUES (${r.gasto_id_a}, ${r.gasto_id_b}, ${r.created_at ?? null}) ON CONFLICT DO NOTHING`
  }
}

// ─── 13. config ──────────────────────────────────────────────────────────────
{
  const rows = db.prepare('SELECT * FROM config').all()
  console.log(`[migrate] config: ${rows.length} filas`)
  for (const r of rows) {
    await sql`INSERT INTO config (clave, valor, updated_at) VALUES (${r.clave}, ${r.valor}, ${r.updated_at ?? null}) ON CONFLICT DO NOTHING`
  }
}

await sql.end()
db.close()
console.log('\n[migrate] ✓ Migración completa')
