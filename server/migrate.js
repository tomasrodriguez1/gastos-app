import { Database } from 'bun:sqlite'
import { readFileSync, existsSync, renameSync } from 'fs'
import { resolve } from 'path'

const DB_PATH = resolve(import.meta.dir, '../data/gastos.db')
const DATA_DIR = resolve(import.meta.dir, '../data')

const db = new Database(DB_PATH, { create: true })
db.exec(readFileSync(resolve(import.meta.dir, 'db/schema.sql'), 'utf-8'))

function leerJson(nombre) {
  const ruta = resolve(DATA_DIR, nombre)
  if (!existsSync(ruta)) return null
  try {
    return JSON.parse(readFileSync(ruta, 'utf-8'))
  } catch {
    console.error(`Error leyendo ${nombre}`)
    return null
  }
}

const stmt = db.prepare(`
  INSERT INTO gastos (_id, fecha, mes, motivo, banco, tipos, contexto,
    monto, monto_real, usd, monto_clp_manual, split, presupuesto_manual,
    contexto_override, monto_presupuesto_manual, es_manual, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(_id) DO UPDATE SET
    motivo = excluded.motivo,
    banco = excluded.banco,
    tipos = excluded.tipos,
    contexto = excluded.contexto,
    monto = excluded.monto,
    monto_real = excluded.monto_real,
    usd = excluded.usd,
    monto_clp_manual = excluded.monto_clp_manual,
    split = excluded.split,
    presupuesto_manual = excluded.presupuesto_manual,
    contexto_override = excluded.contexto_override,
    monto_presupuesto_manual = excluded.monto_presupuesto_manual,
    updated_at = datetime('now')
`)

function insertarGastos(lista, esManual) {
  const insertar = db.transaction((gastos) => {
    for (const g of gastos) {
      const id = g._id || g.id || `${g.fecha}|${g.motivo?.trim().toLowerCase()}`
      if (!id || id === '|') {
        console.warn('Gasto sin identificador válido, omitiendo:', g.motivo, g.fecha)
        continue
      }
      stmt.run(
        id, g.fecha, g.mes || g.fecha?.substring(0, 7), g.motivo,
        g.banco || '', JSON.stringify(g.tipos || []), g.contexto || '',
        g.monto || 0, g.monto_real ?? g.monto ?? 0, g.usd || 0,
        g.monto_clp_manual ?? null, g.split || 0,
        g.presupuesto_manual ? JSON.stringify(g.presupuesto_manual) : null,
        g.contexto_override ?? null, g.monto_presupuesto_manual ?? null,
        esManual
      )
    }
  })
  insertar(lista)
}

// Migrar gastos.json
const gastos = leerJson('gastos.json')
if (gastos && gastos.length) {
  insertarGastos(gastos, 0)
  console.log(`✓ gastos.json: ${gastos.length} registros migrados`)
  renameSync(resolve(DATA_DIR, 'gastos.json'), resolve(DATA_DIR, 'gastos.json.bak'))
} else {
  console.log('— gastos.json: no encontrado o vacío')
}

// Migrar gastos_manuales.json
const manuales = leerJson('gastos_manuales.json')
if (manuales && manuales.length) {
  insertarGastos(manuales, 1)
  console.log(`✓ gastos_manuales.json: ${manuales.length} registros migrados`)
  renameSync(resolve(DATA_DIR, 'gastos_manuales.json'), resolve(DATA_DIR, 'gastos_manuales.json.bak'))
} else {
  console.log('— gastos_manuales.json: no encontrado o vacío')
}

// Migrar presupuesto.json
const presupuesto = leerJson('presupuesto.json')
if (presupuesto && Object.keys(presupuesto).length) {
  const stmtPres = db.prepare(`
    INSERT INTO presupuesto (mes, datos, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(mes) DO UPDATE SET datos = excluded.datos, updated_at = datetime('now')
  `)
  const insertarMeses = db.transaction((meses) => {
    for (const [mes, datos] of Object.entries(meses)) {
      stmtPres.run(mes, JSON.stringify(datos))
    }
  })
  insertarMeses(presupuesto)
  const nMeses = Object.keys(presupuesto).length
  console.log(`✓ presupuesto.json: ${nMeses} mes(es) migrado(s)`)
  renameSync(resolve(DATA_DIR, 'presupuesto.json'), resolve(DATA_DIR, 'presupuesto.json.bak'))
} else {
  console.log('— presupuesto.json: no encontrado o vacío')
}

console.log('\nMigración completada. DB:', DB_PATH)
db.close()
