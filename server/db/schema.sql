-- Tabla principal de gastos (esquema post-migración)
CREATE TABLE IF NOT EXISTS gastos (
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
  pagado                 INTEGER DEFAULT 0,
  created_at             TEXT DEFAULT (datetime('now')),
  updated_at             TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gastos_mes ON gastos(mes);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
-- idx_gastos_sync_key is created by migration 002 (after sync_key column exists)

-- Presupuesto normalizado
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

-- Catálogos
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

-- Reglas de mapeo gasto → presupuesto
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

-- Configuración
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
