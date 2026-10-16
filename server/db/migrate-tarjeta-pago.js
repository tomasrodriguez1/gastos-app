import sql from './client.js'

// Día de pago de cada tarjeta (tarjeta_ciclo.dia_pago), junto al día de cierre que ya existía.
// Con cierre + pago se calcula el vencimiento de cada período (src/utils/vencimientosTarjeta.js).
// Nullable: hasta que se configure, esa tarjeta no entra al aviso por vencimiento.
// tarjeta_ciclo la crea schema.pg.sql solo con RUN_SCHEMA_INIT, y las migraciones corren antes,
// así que se asegura aquí también. Idempotente — corre en cada arranque.
export async function migrateTarjetaPago() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS tarjeta_ciclo (
        banco      TEXT PRIMARY KEY,
        dia_cierre SMALLINT NOT NULL CHECK (dia_cierre BETWEEN 1 AND 28),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('ALTER TABLE tarjeta_ciclo ADD COLUMN IF NOT EXISTS dia_pago SMALLINT CHECK (dia_pago BETWEEN 1 AND 28)')
  })
}

if (import.meta.main) {
  try {
    await migrateTarjetaPago()
    console.log('[migrate:tarjeta-pago] ✓ tarjeta_ciclo.dia_pago lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
