import sql from './client.js'

export async function migrateFondoUso() {
  const [{ gastos_existe: gastosExiste }] = await sql`
    SELECT to_regclass('public.gastos') IS NOT NULL AS gastos_existe
  `
  if (!gastosExiste) return

  await sql.begin(async (tx) => {
    await tx.unsafe('ALTER TABLE gastos ADD COLUMN IF NOT EXISTS financiado_por TEXT')
    await tx.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_gastos_financiado_por
      ON gastos(financiado_por)
      WHERE financiado_por IS NOT NULL
    `)

    const [{ fondos_existe: fondosExiste }] = await tx`
      SELECT to_regclass('public.presupuesto_fondo') IS NOT NULL AS fondos_existe
    `
    if (fondosExiste) {
      await tx.unsafe("ALTER TABLE presupuesto_fondo ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'")
    }
  })
}

if (import.meta.main) {
  try {
    await migrateFondoUso()
    console.log('[migrate:fondo-uso] ✓ Migración de uso de fondos completada')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
