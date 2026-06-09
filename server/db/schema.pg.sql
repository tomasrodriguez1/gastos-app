-- ─── GASTOS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gastos (
  id                       TEXT PRIMARY KEY,
  sync_key                 TEXT UNIQUE,
  fecha                    TEXT NOT NULL,
  mes                      TEXT NOT NULL,
  motivo                   TEXT NOT NULL,
  banco                    TEXT DEFAULT '',
  tipos                    JSONB DEFAULT '[]',
  contexto                 TEXT DEFAULT '',
  monto                    NUMERIC DEFAULT 0,
  monto_real               NUMERIC DEFAULT 0,
  usd                      NUMERIC DEFAULT 0,
  monto_clp_manual         NUMERIC,
  split                    NUMERIC DEFAULT 0,
  presupuesto_manual       JSONB,
  contexto_override        TEXT,
  monto_presupuesto_manual NUMERIC,
  es_manual                BOOLEAN DEFAULT FALSE,
  pagado                   BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_mes ON gastos(mes);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_sync_key ON gastos(sync_key) WHERE sync_key IS NOT NULL;

-- ─── PRESUPUESTO ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS presupuesto_mes (
  mes        TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presupuesto_ingreso (
  id     SERIAL PRIMARY KEY,
  mes    TEXT NOT NULL REFERENCES presupuesto_mes(mes) ON DELETE CASCADE,
  fuente TEXT NOT NULL,
  monto  NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(mes, fuente)
);

CREATE TABLE IF NOT EXISTS presupuesto_categoria (
  id           SERIAL PRIMARY KEY,
  mes          TEXT NOT NULL REFERENCES presupuesto_mes(mes) ON DELETE CASCADE,
  grupo        TEXT NOT NULL,
  subcategoria TEXT NOT NULL,
  previsto     NUMERIC NOT NULL DEFAULT 0,
  fgp          BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(mes, grupo, subcategoria)
);

CREATE TABLE IF NOT EXISTS presupuesto_fondo (
  id               SERIAL PRIMARY KEY,
  mes              TEXT NOT NULL REFERENCES presupuesto_mes(mes) ON DELETE CASCADE,
  nombre           TEXT NOT NULL,
  previsto_aportar NUMERIC DEFAULT 0,
  acumulado        NUMERIC DEFAULT 0,
  objetivo         NUMERIC,
  fecha_meta       TEXT,
  vinculado        JSONB,
  emoji            TEXT DEFAULT '💰',
  UNIQUE(mes, nombre)
);

-- ─── CATÁLOGOS ───────────────────────────────────────────────────────────────

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

-- ─── REGLAS DE MAPEO ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS regla_mapeo (
  id           SERIAL PRIMARY KEY,
  prioridad    INTEGER NOT NULL,
  contexto     TEXT,
  tipo         TEXT,
  banco        TEXT,
  motivo_regex TEXT,
  grupo_dest   TEXT,
  subcat_dest  TEXT,
  descripcion  TEXT,
  activa       BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_regla_prioridad ON regla_mapeo(prioridad) WHERE activa = TRUE;

-- ─── DUPLICADOS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duplicado_exclusion (
  gasto_id_a TEXT NOT NULL,
  gasto_id_b TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (gasto_id_a, gasto_id_b)
);

-- ─── CONFIG ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS config (
  clave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
