import sql from './client.js'

// `tipo` distingue aporte (+) de ajuste (±) en fondo_ahorro_movimiento — nunca 'pago': un pago/uso
// de un fondo de ahorro sigue siendo (como siempre) un gasto con financiado_por = nombre, no una
// fila nueva acá, para no duplicar la contabilidad del gasto (misma regla que ya rige
// fondo_tarjeta/reserva_tarjeta). Corre después de migrateFondoAhorroMovimientos().
export async function migrateFondoAhorroTipo() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      ALTER TABLE fondo_ahorro_movimiento ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'aporte'
    `)
    await tx.unsafe(`
      ALTER TABLE fondo_ahorro_movimiento DROP CONSTRAINT IF EXISTS fondo_ahorro_movimiento_tipo_check
    `)
    await tx.unsafe(`
      ALTER TABLE fondo_ahorro_movimiento ADD CONSTRAINT fondo_ahorro_movimiento_tipo_check
        CHECK (tipo IN ('aporte', 'ajuste'))
    `)
  })
}

if (import.meta.main) {
  try {
    await migrateFondoAhorroTipo()
    console.log('[migrate:fondo-ahorro-tipo] ✓ Columna tipo lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
