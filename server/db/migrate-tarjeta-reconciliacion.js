import sql from './client.js'

export async function migrateTarjetaReconciliacion() {
  const [{ gastos_existe: gastosExiste }] = await sql`
    SELECT to_regclass('public.gastos') IS NOT NULL AS gastos_existe
  `
  if (!gastosExiste) return

  await sql.begin(async (tx) => {
    await tx.unsafe('ALTER TABLE gastos ADD COLUMN IF NOT EXISTS plata_en_cuenta BOOLEAN NOT NULL DEFAULT FALSE')
    await tx.unsafe('ALTER TABLE gastos ADD COLUMN IF NOT EXISTS en_presupuesto BOOLEAN NOT NULL DEFAULT TRUE')
  })
}

if (import.meta.main) {
  try {
    await migrateTarjetaReconciliacion()
    console.log('[migrate:tarjeta] ✓ Migración de tarjeta completada')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
