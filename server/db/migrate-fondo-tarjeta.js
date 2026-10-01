import sql from './client.js'

// Fondo común para pagar las tarjetas (Edwards + BICE): libro de movimientos
// con signo (aporte +, pago −, ajuste ±). El saldo es SUM(monto) por moneda —
// nunca se persiste. Reemplaza la "referencia manual legacy" de reserva_tarjeta
// (que no participaba en cálculos). Idempotente — corre en cada arranque, igual
// que migrate-reservas.js.
export async function migrateFondoTarjeta() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS fondo_tarjeta_movimiento (
        id         SERIAL PRIMARY KEY,
        fecha      TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        tipo       TEXT NOT NULL CHECK (tipo IN ('aporte', 'ajuste', 'pago')),
        moneda     TEXT NOT NULL CHECK (moneda IN ('CLP', 'USD')),
        monto      NUMERIC NOT NULL,
        banco      TEXT,
        nota       TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_fondo_tarjeta_moneda_fecha ON fondo_tarjeta_movimiento(moneda, fecha DESC, id DESC)')
  })
}

if (import.meta.main) {
  try {
    await migrateFondoTarjeta()
    console.log('[migrate:fondo-tarjeta] ✓ Tabla fondo_tarjeta_movimiento lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
