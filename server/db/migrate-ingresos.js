import sql from './client.js'

// Ingresos reales (fecha, fuente, monto), separados de presupuesto_ingreso
// (que es solo la previsión por ciclo, reemplazada cada PUT). Sin UNIQUE: a
// diferencia de reserva_saldo, un ingreso puede repetirse el mismo día/fuente
// (dos pagos reales) sin que sea un error. Idempotente — corre en cada
// arranque, igual que migrate-reservas.js.
export async function migrateIngresos() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS ingreso (
        id               SERIAL PRIMARY KEY,
        fecha            TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        ciclo_financiero TEXT NOT NULL,
        fuente           TEXT NOT NULL,
        monto            NUMERIC NOT NULL,
        nota             TEXT,
        origen           TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'chat')),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_ingreso_ciclo ON ingreso(ciclo_financiero)')
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
