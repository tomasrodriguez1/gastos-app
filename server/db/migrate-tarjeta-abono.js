import sql from './client.js'

// Abonos a las tarjetas (Edwards/BICE) hechos fuera de un pago de movimientos concretos
// (ej. depositar 170 USD en el banco). Libro con signo por banco y moneda: abono +,
// aplicacion − (cuando después se marcan como pagados los movimientos que el abono cubrió).
// El saldo es SUM(monto) y baja la deuda mostrada; nunca se persiste. Idempotente — corre en
// cada arranque, igual que migrate-fondo-tarjeta.js.
export async function migrateTarjetaAbono() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS tarjeta_abono (
        id         SERIAL PRIMARY KEY,
        fecha      TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        banco      TEXT NOT NULL,
        moneda     TEXT NOT NULL CHECK (moneda IN ('CLP', 'USD')),
        tipo       TEXT NOT NULL CHECK (tipo IN ('abono', 'aplicacion')),
        monto      NUMERIC NOT NULL,
        nota       TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_tarjeta_abono_banco_moneda ON tarjeta_abono(banco, moneda)')
  })
}

if (import.meta.main) {
  try {
    await migrateTarjetaAbono()
    console.log('[migrate:tarjeta-abono] ✓ Tabla tarjeta_abono lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
