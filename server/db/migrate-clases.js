import sql from './client.js'

// Módulo de clases particulares (DEC-019): familia, alumno, clase, pago y pago_clase. Tablas propias, sin
// tocar gastos ni presupuesto. El único vínculo con las finanzas es pago.ingreso_id: cada pago
// registrado en la app crea un `ingreso` (origen='clases') en la misma transacción. RESTRICT en
// esa FK para que el ingreso no se pueda borrar suelto: se saca deshaciendo el pago.
//
// La deuda no se persiste: es Σ clase.monto con estado='dictada' y cobro='pendiente'.
// notion_id es la clave del import (id real de Notion o clave sintética), UNIQUE para que
// reimportar no duplique. Va después de migrateIngresos() (FK a ingreso), por eso no está en
// schema.pg.sql. Idempotente — corre en cada arranque.
export async function migrateClases(db = sql) {
  await db.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS alumno (
        id                  SERIAL PRIMARY KEY,
        nombre              TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) > 0),
        precio_hora_default INTEGER NOT NULL CHECK (precio_hora_default > 0),
        activo              BOOLEAN NOT NULL DEFAULT true,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    // Familia = cuenta de cobro: agrupa hermanos y guarda al apoderado (a quién se le escribe por
    // WhatsApp). Un alumno sin familia se cobra solo.
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS familia (
        id                 SERIAL PRIMARY KEY,
        nombre             TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
        apoderado_nombre   TEXT,
        apoderado_telefono TEXT,
        created_at         TIMESTAMPTZ DEFAULT NOW(),
        updated_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE UNIQUE INDEX IF NOT EXISTS idx_familia_nombre_lower ON familia (lower(nombre))')
    await tx.unsafe('ALTER TABLE alumno ADD COLUMN IF NOT EXISTS familia_id INTEGER REFERENCES familia(id) ON DELETE RESTRICT')
    // El alta por MCP compara el nombre sin distinguir mayúsculas: "cristóbal mena" no duplica.
    await tx.unsafe('CREATE UNIQUE INDEX IF NOT EXISTS idx_alumno_nombre_lower ON alumno (lower(nombre))')
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS clase (
        id               SERIAL PRIMARY KEY,
        alumno_id        INTEGER NOT NULL REFERENCES alumno(id) ON DELETE RESTRICT,
        fecha            TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        hora_inicio      TEXT NOT NULL CHECK (hora_inicio ~ '^([01]\\d|2[0-3]):[0-5]\\d$'),
        duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
        modalidad        TEXT NOT NULL CHECK (modalidad IN ('online', 'presencial')),
        precio_hora      INTEGER NOT NULL CHECK (precio_hora >= 0),
        monto            INTEGER NOT NULL CHECK (monto >= 0),
        estado           TEXT NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'dictada', 'cancelada')),
        cobro            TEXT NOT NULL DEFAULT 'pendiente' CHECK (cobro IN ('pendiente', 'pagado')),
        notion_id        TEXT UNIQUE,
        notion_status    TEXT,
        nota             TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW(),
        CHECK (NOT (estado = 'cancelada' AND cobro = 'pagado'))
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_clase_alumno_fecha ON clase(alumno_id, fecha)')
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_clase_fecha ON clase(fecha)')
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_clase_updated_at ON clase(updated_at)')
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS pago (
        id         SERIAL PRIMARY KEY,
        alumno_id  INTEGER NOT NULL REFERENCES alumno(id) ON DELETE RESTRICT,
        fecha      TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        monto      INTEGER NOT NULL CHECK (monto > 0),
        ingreso_id INTEGER UNIQUE REFERENCES ingreso(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_pago_fecha ON pago(fecha DESC, id DESC)')
    // Un pago de familia puede cubrir clases de varios hermanos: alumno_id queda NULL y
    // familia_id dice de quién es. Pago de un solo alumno: alumno_id (y familia_id si tiene).
    await tx.unsafe('ALTER TABLE pago ADD COLUMN IF NOT EXISTS familia_id INTEGER REFERENCES familia(id) ON DELETE RESTRICT')
    await tx.unsafe('ALTER TABLE pago ALTER COLUMN alumno_id DROP NOT NULL')
    // Un pago registrado por MCP nace 'pendiente' (con su ingreso pendiente) y las clases siguen
    // sin cobrar hasta que un humano lo confirma (DEC-020). Los pagos de la UI nacen confirmados.
    await tx.unsafe(`ALTER TABLE pago ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmado'`)
    await tx.unsafe('ALTER TABLE pago DROP CONSTRAINT IF EXISTS pago_estado_check')
    await tx.unsafe(`ALTER TABLE pago ADD CONSTRAINT pago_estado_check CHECK (estado IN ('pendiente', 'confirmado'))`)
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS pago_clase (
        pago_id  INTEGER NOT NULL REFERENCES pago(id) ON DELETE CASCADE,
        clase_id INTEGER NOT NULL UNIQUE REFERENCES clase(id) ON DELETE RESTRICT,
        PRIMARY KEY (pago_id, clase_id)
      )
    `)
    // Clases importadas que se eliminaron en la app: el import las salta para no revivirlas.
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS clase_import_descartada (
        notion_id    TEXT PRIMARY KEY,
        eliminada_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  })
}

if (import.meta.main) {
  try {
    await migrateClases()
    console.log('[migrate:clases] ✓ Tablas alumno, clase, pago y pago_clase listas')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
