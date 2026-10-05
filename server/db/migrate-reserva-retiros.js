import sql from './client.js'

// Columnas adicionales en reserva_saldo para mostrar el desglose de "egresos" (retiros, ya
// calculados en calcularSaldoEsperado pero antes no se persistían) e "ingresos" (crecimiento
// estimado por tasa_anual) en el historial de /fondos. Nullable: las filas registradas antes de
// esta migración quedan sin desglose (no se recalculan retroactivamente). Corre después de
// migrateReservas() — depende de que reserva_saldo ya exista.
export async function migrateReservaRetiros() {
  await sql.begin(async (tx) => {
    await tx.unsafe('ALTER TABLE reserva_saldo ADD COLUMN IF NOT EXISTS retiros NUMERIC')
    await tx.unsafe('ALTER TABLE reserva_saldo ADD COLUMN IF NOT EXISTS crecimiento NUMERIC')
  })
}

if (import.meta.main) {
  try {
    await migrateReservaRetiros()
    console.log('[migrate:reserva-retiros] ✓ Columnas retiros/crecimiento listas')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
