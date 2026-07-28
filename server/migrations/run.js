import { copyFileSync, existsSync } from 'fs'

// ─── Migration 002: _id → UUID + sync_key ────────────────────────────────────

function migration002(db, dbPath) {
  // Backup before touching data
  const bakPath = dbPath + '.bak'
  if (!existsSync(bakPath)) {
    copyFileSync(dbPath, bakPath)
    console.log(`  Backup creado en ${bakPath}`)
  }

  // Verify old schema exists (has _id column)
  const cols = db.prepare("PRAGMA table_info(gastos)").all()
  const colNames = cols.map(c => c.name)
  if (!colNames.includes('_id')) {
    // Fresh install or already migrated — just ensure the index exists
    db.exec(`CREATE INDEX IF NOT EXISTS idx_gastos_sync_key ON gastos(sync_key) WHERE sync_key IS NOT NULL`)
    console.log('  Tabla gastos ya tiene esquema nuevo')
    return
  }

  const rows = db.prepare('SELECT * FROM gastos').all()
  console.log(`  Migrando ${rows.length} registros...`)

  db.exec('DROP TABLE IF EXISTS gastos_new')
  db.exec(`
    CREATE TABLE gastos_new (
      id                     TEXT PRIMARY KEY,
      sync_key               TEXT UNIQUE,
      fecha                  TEXT NOT NULL,
      mes                    TEXT NOT NULL,
      motivo                 TEXT NOT NULL,
      banco                  TEXT DEFAULT '',
      tipos                  TEXT DEFAULT '[]',
      contexto               TEXT DEFAULT '',
      monto                  REAL DEFAULT 0,
      monto_real             REAL DEFAULT 0,
      usd                    REAL DEFAULT 0,
      monto_clp_manual       REAL,
      split                  REAL DEFAULT 0,
      presupuesto_manual     TEXT,
      contexto_override      TEXT,
      monto_presupuesto_manual REAL,
      es_manual              INTEGER DEFAULT 0,
      created_at             TEXT DEFAULT (datetime('now')),
      updated_at             TEXT DEFAULT (datetime('now'))
    )
  `)

  const insert = db.prepare(`
    INSERT INTO gastos_new (id, sync_key, fecha, mes, motivo, banco, tipos, contexto,
      monto, monto_real, usd, monto_clp_manual, split, presupuesto_manual,
      contexto_override, monto_presupuesto_manual, es_manual, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const copyAll = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(
        crypto.randomUUID(),
        row.es_manual === 0 ? row._id : null,
        row.fecha, row.mes, row.motivo, row.banco, row.tipos, row.contexto,
        row.monto, row.monto_real, row.usd, row.monto_clp_manual, row.split,
        row.presupuesto_manual, row.contexto_override, row.monto_presupuesto_manual,
        row.es_manual, row.created_at, row.updated_at
      )
    }
  })
  copyAll(rows)

  db.exec(`
    DROP TABLE gastos;
    ALTER TABLE gastos_new RENAME TO gastos;
    CREATE INDEX IF NOT EXISTS idx_gastos_mes ON gastos(mes);
    CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
    CREATE INDEX IF NOT EXISTS idx_gastos_sync_key ON gastos(sync_key) WHERE sync_key IS NOT NULL;
  `)

  console.log(`  ✓ ${rows.length} registros migrados a nuevo esquema UUID`)
}

// ─── Migration 004: Catálogos en DB ──────────────────────────────────────────

function migration004(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalogo_grupo (
      id     TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalogo_subcategoria (
      id        TEXT PRIMARY KEY,
      grupo_id  TEXT NOT NULL REFERENCES catalogo_grupo(id) ON DELETE CASCADE,
      nombre    TEXT NOT NULL,
      orden     INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalogo_tipo (
      id     TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalogo_banco (
      id     TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalogo_contexto (
      id     TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden  INTEGER NOT NULL DEFAULT 0
    );
  `)

  // Seed grupos
  const grupos = [
    ['HOGAR Y SERVICIOS', 'HOGAR Y SERVICIOS', 1],
    ['TRANSPORTE', 'TRANSPORTE', 2],
    ['SEGUROS', 'SEGUROS', 3],
    ['ALE', 'ALE', 4],
    ['PRÉSTAMOS Y BANCOS', 'PRÉSTAMOS Y BANCOS', 5],
    ['AHORROS O INVERSIONES', 'AHORROS O INVERSIONES', 6],
    ['EMPRENDIMIENTO', 'EMPRENDIMIENTO', 7],
    ['CUIDADO PERSONAL', 'CUIDADO PERSONAL', 8],
    ['ENTRETENIMIENTO', 'ENTRETENIMIENTO', 9],
    ['COMIDA', 'COMIDA', 10],
    ['VIAJES', 'VIAJES', 11],
    ['SALUD', 'SALUD', 12],
  ]
  for (const [id, nombre, orden] of grupos) {
    db.prepare('INSERT OR IGNORE INTO catalogo_grupo (id, nombre, orden) VALUES (?, ?, ?)').run(id, nombre, orden)
  }

  // Seed subcategorías
  const subcats = [
    ['HOGAR Y SERVICIOS_Teléfono', 'HOGAR Y SERVICIOS', 'Teléfono', 1],
    ['HOGAR Y SERVICIOS_Suscripciones', 'HOGAR Y SERVICIOS', 'Suscripciones', 2],
    ['TRANSPORTE_Tag', 'TRANSPORTE', 'Tag', 1],
    ['TRANSPORTE_Ahorro Mantenimiento', 'TRANSPORTE', 'Ahorro Mantenimiento', 2],
    ['TRANSPORTE_Ahorro Patente', 'TRANSPORTE', 'Ahorro Patente', 3],
    ['SEGUROS_Seguro Banco', 'SEGUROS', 'Seguro Banco', 1],
    ['ALE_Pasajes', 'ALE', 'Pasajes', 1],
    ['ALE_Comida', 'ALE', 'Comida', 2],
    ['ALE_Fiesta', 'ALE', 'Fiesta', 3],
    ['ALE_Regalos', 'ALE', 'Regalos', 4],
    ['ALE_Transporte', 'ALE', 'Transporte', 5],
    ['ALE_Ahorro Viajes Próximos', 'ALE', 'Ahorro Viajes Próximos', 6],
    ['ALE_Ahorro Regalos Próximos', 'ALE', 'Ahorro Regalos Próximos', 7],
    ['ALE_Otros', 'ALE', 'Otros', 8],
    ['PRÉSTAMOS Y BANCOS_TC Edwards', 'PRÉSTAMOS Y BANCOS', 'TC Edwards', 1],
    ['PRÉSTAMOS Y BANCOS_TC BICE', 'PRÉSTAMOS Y BANCOS', 'TC BICE', 2],
    ['PRÉSTAMOS Y BANCOS_Otras Deudas', 'PRÉSTAMOS Y BANCOS', 'Otras Deudas', 3],
    ['AHORROS O INVERSIONES_Jubilación S&P 500', 'AHORROS O INVERSIONES', 'Jubilación S&P 500', 1],
    ['AHORROS O INVERSIONES_Fondo Independencia', 'AHORROS O INVERSIONES', 'Fondo Independencia', 2],
    ['AHORROS O INVERSIONES_Emergencia', 'AHORROS O INVERSIONES', 'Emergencia', 3],
    ['EMPRENDIMIENTO_Zalantos', 'EMPRENDIMIENTO', 'Zalantos', 1],
    ['CUIDADO PERSONAL_Corte de Pelo', 'CUIDADO PERSONAL', 'Corte de Pelo', 1],
    ['CUIDADO PERSONAL_Ropa', 'CUIDADO PERSONAL', 'Ropa', 2],
    ['ENTRETENIMIENTO_Carrete', 'ENTRETENIMIENTO', 'Carrete', 1],
    ['ENTRETENIMIENTO_Padel', 'ENTRETENIMIENTO', 'Padel', 2],
    ['ENTRETENIMIENTO_Uber', 'ENTRETENIMIENTO', 'Uber', 3],
    ['ENTRETENIMIENTO_Regalos', 'ENTRETENIMIENTO', 'Regalos', 4],
    ['COMIDA_Alimentos', 'COMIDA', 'Alimentos', 1],
    ['COMIDA_Restaurantes', 'COMIDA', 'Restaurantes', 2],
    ['COMIDA_Otros', 'COMIDA', 'Otros', 3],
    ['VIAJES_Pasajes', 'VIAJES', 'Pasajes', 1],
    ['VIAJES_Comida', 'VIAJES', 'Comida', 2],
    ['VIAJES_Alojamiento', 'VIAJES', 'Alojamiento', 3],
    ['VIAJES_Otros', 'VIAJES', 'Otros', 4],
    ['SALUD_Consulta Médica', 'SALUD', 'Consulta Médica', 1],
    ['SALUD_Remedios', 'SALUD', 'Remedios', 2],
    ['SALUD_Suplementos', 'SALUD', 'Suplementos', 3],
    ['SALUD_Otros', 'SALUD', 'Otros', 4],
  ]
  for (const [id, grupoId, nombre, orden] of subcats) {
    db.prepare('INSERT OR IGNORE INTO catalogo_subcategoria (id, grupo_id, nombre, orden) VALUES (?, ?, ?, ?)').run(id, grupoId, nombre, orden)
  }

  // Seed tipos
  const tipos = [
    'A medias', 'Ajuste', 'Auto', 'Comida', 'Deporte', 'Deuda', 'Externo',
    'Mantención', 'Ocio', 'Otro', 'Proyecto', 'Regalo', 'Regalo propio', 'Ropa',
    'Salud', 'Suscripcion', 'Transporte', 'Turno', 'Unknown', 'VA', 'Viaje',
  ]
  tipos.forEach((t, i) => {
    db.prepare('INSERT OR IGNORE INTO catalogo_tipo (id, nombre, orden) VALUES (?, ?, ?)').run(t, t, i + 1)
  })

  // Seed bancos
  const bancos = ['Edwards', 'BICE', 'TC Papa', 'Otro', 'Transferencia', 'Efectivo']
  bancos.forEach((b, i) => {
    db.prepare('INSERT OR IGNORE INTO catalogo_banco (id, nombre, orden) VALUES (?, ?, ?)').run(b, b, i + 1)
  })

  // Seed contextos
  const contextos = ['Ale', 'Amigos', 'Solo', 'Trabajo', 'Familia', 'Salud', 'Viaje']
  contextos.forEach((ctx, i) => {
    db.prepare('INSERT OR IGNORE INTO catalogo_contexto (id, nombre, orden) VALUES (?, ?, ?)').run(ctx, ctx, i + 1)
  })

  console.log('  ✓ Catálogos seed insertados')
}

// ─── Migration 003: Presupuesto normalizado ───────────────────────────────────

function migration003(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS presupuesto_mes (
      mes        TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS presupuesto_ingreso (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      mes    TEXT NOT NULL REFERENCES presupuesto_mes(mes) ON DELETE CASCADE,
      fuente TEXT NOT NULL,
      monto  REAL NOT NULL DEFAULT 0,
      UNIQUE(mes, fuente)
    );
    CREATE TABLE IF NOT EXISTS presupuesto_categoria (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      mes          TEXT NOT NULL REFERENCES presupuesto_mes(mes) ON DELETE CASCADE,
      grupo        TEXT NOT NULL,
      subcategoria TEXT NOT NULL,
      previsto     REAL NOT NULL DEFAULT 0,
      fgp          INTEGER NOT NULL DEFAULT 0,
      UNIQUE(mes, grupo, subcategoria)
    );
    CREATE TABLE IF NOT EXISTS presupuesto_fondo (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      mes              TEXT NOT NULL REFERENCES presupuesto_mes(mes) ON DELETE CASCADE,
      nombre           TEXT NOT NULL,
      previsto_aportar REAL DEFAULT 0,
      acumulado        REAL DEFAULT 0,
      objetivo         REAL,
      fecha_meta       TEXT,
      vinculado        TEXT,
      UNIQUE(mes, nombre)
    );
  `)

  // Migrate from old presupuesto table if it still exists
  let oldRows
  try {
    oldRows = db.prepare('SELECT mes, datos FROM presupuesto').all()
  } catch { return } // table already dropped

  if (oldRows.length === 0) {
    console.log('  No hay datos de presupuesto que migrar')
    return
  }

  console.log(`  Migrando presupuesto de ${oldRows.length} mes(es)...`)

  const insertMes = db.prepare('INSERT OR IGNORE INTO presupuesto_mes (mes) VALUES (?)')
  const insertIngreso = db.prepare(
    'INSERT OR IGNORE INTO presupuesto_ingreso (mes, fuente, monto) VALUES (?, ?, ?)'
  )
  const insertCategoria = db.prepare(
    'INSERT OR IGNORE INTO presupuesto_categoria (mes, grupo, subcategoria, previsto, fgp) VALUES (?, ?, ?, ?, ?)'
  )
  const insertFondo = db.prepare(
    'INSERT OR IGNORE INTO presupuesto_fondo (mes, nombre, previsto_aportar, acumulado, objetivo) VALUES (?, ?, ?, ?, ?)'
  )

  const migrateAll = db.transaction((rows) => {
    for (const row of rows) {
      const datos = JSON.parse(row.datos)
      insertMes.run(row.mes)

      for (const [fuente, monto] of Object.entries(datos.ingresos || {})) {
        insertIngreso.run(row.mes, fuente, monto || 0)
      }

      for (const [grupo, gData] of Object.entries(datos.categorias || {})) {
        for (const [subcat, sData] of Object.entries(gData.subcategorias || {})) {
          insertCategoria.run(row.mes, grupo, subcat, sData.previsto || 0, sData.fgp ? 1 : 0)
        }
      }

      for (const [nombre, fData] of Object.entries(datos.fondos || {})) {
        insertFondo.run(row.mes, nombre, fData.previsto_aportar || 0, fData.acumulado || 0, fData.objetivo || null)
      }
    }
  })
  migrateAll(oldRows)

  db.exec('DROP TABLE IF EXISTS presupuesto')
  console.log('  ✓ Presupuesto normalizado, tabla vieja eliminada')
}

// ─── Migration 005: Reglas de mapeo ──────────────────────────────────────────

function migration005(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS regla_mapeo (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      prioridad    INTEGER NOT NULL,
      contexto     TEXT,
      tipo         TEXT,
      banco        TEXT,
      motivo_regex TEXT,
      grupo_dest   TEXT,
      subcat_dest  TEXT,
      descripcion  TEXT,
      activa       INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_regla_prioridad ON regla_mapeo(prioridad) WHERE activa = 1;
  `)

  const insert = db.prepare(`
    INSERT OR IGNORE INTO regla_mapeo (prioridad, contexto, tipo, banco, grupo_dest, subcat_dest, descripcion)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  // Verify no rules exist yet to avoid duplicate seeding
  const count = db.prepare('SELECT COUNT(*) as n FROM regla_mapeo').get().n
  if (count > 0) {
    console.log('  Reglas de mapeo ya existen, saltando seed')
    return
  }

  const reglas = [
    // Contexto Ale — prioridad 10
    [10, 'Ale', 'Viaje',      null,      'ALE',                   'Pasajes',              'Viaje con Ale'],
    [10, 'Ale', 'Comida',     null,      'ALE',                   'Comida',               'Comida con Ale'],
    [10, 'Ale', 'Ocio',       null,      'ALE',                   'Fiesta',               'Ocio con Ale'],
    [10, 'Ale', 'Regalo',     null,      'ALE',                   'Regalos',              'Regalo para Ale'],
    [10, 'Ale', 'Transporte', null,      'ALE',                   'Transporte',           'Transporte con Ale'],
    [10, 'Ale', null,         null,      'ALE',                   'Otros',                'Gasto genérico con Ale'],
    // Contexto Trabajo — prioridad 20
    [20, 'Trabajo', null,     null,      'EMPRENDIMIENTO',        'Zalantos',             'Gasto de trabajo'],
    // Tipos Externo/Proyecto sin contexto especial — prioridad 20
    [20, null,  'Externo',    null,      'EMPRENDIMIENTO',        'Zalantos',             'Gasto externo'],
    [20, null,  'Proyecto',   null,      'EMPRENDIMIENTO',        'Zalantos',             'Gasto de proyecto'],
    // Contexto Amigos — prioridad 30
    [30, 'Amigos', 'Comida',  null,      'ENTRETENIMIENTO',       'Carrete',              'Comida con amigos'],
    // Tipos genéricos — prioridad 50
    [50, null,  'Comida',     null,      'COMIDA',                'Restaurantes',         'Comida genérica'],
    [50, null,  'Ocio',       null,      'ENTRETENIMIENTO',       'Carrete',              'Ocio genérico'],
    [50, null,  'Deporte',    null,      'ENTRETENIMIENTO',       'Padel',                'Deporte'],
    [50, null,  'Regalo',     null,      'ENTRETENIMIENTO',       'Regalos',              'Regalo genérico'],
    [50, null,  'Ropa',       null,      'CUIDADO PERSONAL',      'Ropa',                 'Ropa'],
    [50, null,  'Regalo propio', null,   'CUIDADO PERSONAL',      'Corte de Pelo',        'Regalo propio'],
    [50, null,  'Viaje',      null,      'VIAJES',                'Pasajes',              'Viaje genérico'],
    [50, null,  'Transporte', null,      'TRANSPORTE',            'Tag',                  'Transporte genérico'],
    [50, null,  'Mantención', null,      'TRANSPORTE',            'Ahorro Mantenimiento', 'Mantención auto'],
    [50, null,  'Auto',       null,      'TRANSPORTE',            'Ahorro Patente',       'Auto'],
    [50, null,  'Salud',      null,      'SALUD',                 'Consulta Médica',      'Salud genérica'],
    [50, null,  'Suscripcion',null,      'HOGAR Y SERVICIOS',     'Suscripciones',        'Suscripción'],
    [50, null,  'Deuda',      'Edwards', 'PRÉSTAMOS Y BANCOS',    'TC Edwards',           'Deuda TC Edwards'],
    [50, null,  'Deuda',      'BICE',    'PRÉSTAMOS Y BANCOS',    'TC BICE',              'Deuda TC BICE'],
    [50, null,  'Deuda',      null,      'PRÉSTAMOS Y BANCOS',    'Otras Deudas',         'Deuda genérica'],
    // Sin mapping — prioridad 99 (grupo_dest = '_NONE_')
    [99, null,  'Turno',      null,      '_NONE_',                null,                   'Sin mapeo'],
    [99, null,  'Ajuste',     null,      '_NONE_',                null,                   'Sin mapeo'],
    [99, null,  'Unknown',    null,      '_NONE_',                null,                   'Sin mapeo'],
    [99, null,  'VA',         null,      '_NONE_',                null,                   'Sin mapeo'],
    [99, null,  'A medias',   null,      '_NONE_',                null,                   'Sin mapeo'],
    [99, null,  'Otro',       null,      '_NONE_',                null,                   'Sin mapeo'],
  ]

  const seedAll = db.transaction((reglas) => {
    for (const [prioridad, contexto, tipo, banco, grupoDest, subcatDest, descripcion] of reglas) {
      insert.run(prioridad, contexto, tipo, banco, grupoDest, subcatDest, descripcion)
    }
  })
  seedAll(reglas)

  console.log(`  ✓ ${reglas.length} reglas de mapeo insertadas`)
}

// ─── Migration 006: emoji column for presupuesto_fondo ───────────────────────

function migration006(db) {
  const cols = db.prepare("PRAGMA table_info(presupuesto_fondo)").all().map(c => c.name)
  if (!cols.includes('emoji')) {
    db.exec("ALTER TABLE presupuesto_fondo ADD COLUMN emoji TEXT DEFAULT '💰'")
    console.log('  Columna emoji agregada a presupuesto_fondo')
  }
}

// ─── Migration 007: pagado column + auto-link fondos manuales ────────────────

function migration007(db) {
  // Add pagado column to gastos
  const cols = db.prepare("PRAGMA table_info(gastos)").all().map(c => c.name)
  if (!cols.includes('pagado')) {
    db.exec("ALTER TABLE gastos ADD COLUMN pagado INTEGER DEFAULT 0")
    console.log('  Columna pagado agregada a gastos')
  }

  // Auto-link fondos that have no vinculado
  const links = [
    ['Mantenimiento Auto', JSON.stringify({ grupo: 'TRANSPORTE', subcategoria: 'Ahorro Mantenimiento' })],
    ['Patente Auto',       JSON.stringify({ grupo: 'TRANSPORTE', subcategoria: 'Ahorro Patente' })],
    ['Viajes',             JSON.stringify({ grupo: 'VIAJES',     subcategoria: 'Pasajes' })],
  ]
  for (const [nombre, vinculado] of links) {
    db.prepare(
      "UPDATE presupuesto_fondo SET vinculado = ? WHERE nombre = ? AND (vinculado IS NULL OR vinculado = '')"
    ).run(vinculado, nombre)
  }
  console.log('  ✓ Fondos manuales vinculados automáticamente')
}

// ─── Migration 008: add "desde" to vinculado JSON ────────────────────────────

function migration008(db) {
  const rows = db.prepare("SELECT id, vinculado FROM presupuesto_fondo WHERE vinculado IS NOT NULL").all()
  const update = db.prepare("UPDATE presupuesto_fondo SET vinculado = ? WHERE id = ?")
  const updateAll = db.transaction((rows) => {
    for (const row of rows) {
      try {
        const v = JSON.parse(row.vinculado)
        if (!v.desde) {
          v.desde = '2026-05'
          update.run(JSON.stringify(v), row.id)
        }
      } catch {
        // Un vínculo legacy inválido se conserva sin modificar.
      }
    }
  })
  updateAll(rows)
  console.log(`  ✓ "desde" agregado a ${rows.length} fondos vinculados`)
}

// ─── Migration 009: actualizar contextos ─────────────────────────────────────

function migration009(db) {
  const nuevos = ['Familia', 'Trabajo', 'Amigos', 'Personal', 'Polola']

  // Reemplazar catálogo
  db.exec("DELETE FROM catalogo_contexto")
  nuevos.forEach((ctx, i) => {
    db.prepare("INSERT INTO catalogo_contexto (id, nombre, orden) VALUES (?, ?, ?)").run(ctx, ctx, i + 1)
  })

  // Ale → Polola en reglas de mapeo
  db.prepare("UPDATE regla_mapeo SET contexto = 'Polola' WHERE contexto = 'Ale'").run()

  // Ale → Polola en gastos existentes (contexto y contexto_override)
  db.prepare("UPDATE gastos SET contexto = 'Polola' WHERE contexto = 'Ale'").run()
  db.prepare("UPDATE gastos SET contexto_override = 'Polola' WHERE contexto_override = 'Ale'").run()

  console.log('  ✓ Contextos actualizados')
}

// ─── Migration 010: tabla duplicado_exclusion ─────────────────────────────────

function migration010(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS duplicado_exclusion (
      gasto_id_a TEXT NOT NULL,
      gasto_id_b TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (gasto_id_a, gasto_id_b)
    )
  `)
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export function runMigrations(db, dbPath) {
  // Ensure config table exists
  db.exec(`CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )`)

  const row = db.prepare('SELECT valor FROM config WHERE clave = ?').get('migrations_run')
  const done = row ? JSON.parse(row.valor) : []

  const migrations = [
    { name: '002_uuid_sync_key',       run: (db) => migration002(db, dbPath) },
    { name: '004_catalogos',           run: migration004 },
    { name: '003_presupuesto_normal',  run: migration003 },
    { name: '005_reglas_mapeo',        run: migration005 },
    { name: '006_fondo_emoji',         run: migration006 },
    { name: '007_pagado_vinculado',    run: migration007 },
    { name: '008_vinculado_desde',     run: migration008 },
    { name: '009_contextos',           run: migration009 },
    { name: '010_duplicado_exclusion', run: migration010 },
  ]

  const saveDone = db.prepare(`
    INSERT INTO config (clave, valor, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = datetime('now')
  `)

  for (const m of migrations) {
    if (done.includes(m.name)) continue
    console.log(`[migrate] Ejecutando: ${m.name}`)
    m.run(db)
    done.push(m.name)
    saveDone.run('migrations_run', JSON.stringify(done))
    console.log(`[migrate] ✓ ${m.name} completada`)
  }
}
