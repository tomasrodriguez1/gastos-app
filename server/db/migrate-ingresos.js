import sql from './client.js'

// Ingresos reales (fecha, fuente, monto), separados de presupuesto_ingreso
// (que es solo la previsión por ciclo, reemplazada cada PUT). Sin UNIQUE: a
// diferencia de reserva_saldo, un ingreso puede repetirse el mismo día/fuente
// (dos pagos reales) sin que sea un error. Idempotente — corre en cada
// arranque, igual que migrate-reservas.js.
//
// origen 'clases' = lo creó un pago de clases particulares (server/clases/);
// ese ingreso no se edita ni borra suelto, se saca deshaciendo el pago.
export async function migrateIngresos(db = sql) {
  await db.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS ingreso (
        id               SERIAL PRIMARY KEY,
        fecha            TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        ciclo_financiero TEXT NOT NULL,
        fuente           TEXT NOT NULL,
        monto            NUMERIC NOT NULL,
        nota             TEXT,
        origen           TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'chat', 'clases')),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_ingreso_ciclo ON ingreso(ciclo_financiero)')
    // Tablas creadas antes de 'clases': se reemplaza el CHECK (nombre por defecto de PG).
    await tx.unsafe('ALTER TABLE ingreso DROP CONSTRAINT IF EXISTS ingreso_origen_check')
    await tx.unsafe(`ALTER TABLE ingreso ADD CONSTRAINT ingreso_origen_check CHECK (origen IN ('manual', 'chat', 'clases'))`)
  })
}

if (import.meta.main) {
  try {
    await migrateIngresos()
    console.log('[migrate:ingresos] ✓ Tabla ingreso lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
