import sql from './client.js'

// Reservas de ahorro externas (F6, ej. Mercado Pago): catálogo persistente +
// historial de saldos leídos. Standalone a propósito, igual criterio que
// reserva_tarjeta — no se fusiona con presupuesto_fondo, que es per-ciclo y se
// recrea/reemplaza cada mes. Idempotente — corre en cada arranque, igual que
// migrate-comercios.js, porque initSchema() solo se ejecuta en dev o con
// RUN_SCHEMA_INIT=true.
export async function migrateReservas() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS reserva (
        id          SERIAL PRIMARY KEY,
        nombre      TEXT NOT NULL UNIQUE,
        emoji       TEXT DEFAULT '💰',
        vinculado   JSONB NOT NULL,
        tasa_anual  NUMERIC DEFAULT 0.03,
        activa      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS reserva_saldo (
        id             SERIAL PRIMARY KEY,
        reserva_id     INTEGER NOT NULL REFERENCES reserva(id) ON DELETE CASCADE,
        fecha          TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        monto_leido    NUMERIC NOT NULL,
        monto_esperado NUMERIC,
        diferencia     NUMERIC,
        origen         TEXT NOT NULL DEFAULT 'foto_agente' CHECK (origen IN ('foto_agente', 'manual')),
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (reserva_id, fecha)
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_reserva_activa ON reserva(activa) WHERE activa = TRUE')
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_reserva_saldo_reserva_fecha ON reserva_saldo(reserva_id, fecha DESC)')
  })
}

if (import.meta.main) {
  try {
    await migrateReservas()
    console.log('[migrate:reservas] ✓ Tablas reserva/reserva_saldo listas')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
