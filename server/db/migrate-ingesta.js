import sql from './client.js'

export async function migrateIngesta() {
  const [{ gastos_existe: gastosExiste }] = await sql`
    SELECT to_regclass('public.gastos') IS NOT NULL AS gastos_existe
  `
  if (!gastosExiste) return

  await sql.begin(async (tx) => {
    await tx.unsafe(`ALTER TABLE gastos ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmado'`)
    await tx.unsafe(`ALTER TABLE gastos ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual'`)
    await tx.unsafe('ALTER TABLE gastos ADD COLUMN IF NOT EXISTS fuente_id TEXT')
    await tx.unsafe('ALTER TABLE gastos ADD COLUMN IF NOT EXISTS payload_raw JSONB')
    await tx.unsafe('CREATE UNIQUE INDEX IF NOT EXISTS idx_gastos_fuente_id ON gastos(fuente_id) WHERE fuente_id IS NOT NULL')
    await tx.unsafe(`CREATE INDEX IF NOT EXISTS idx_gastos_estado ON gastos(estado) WHERE estado != 'confirmado'`)
  })
}

if (import.meta.main) {
  try {
    await migrateIngesta()
    console.log('[migrate:ingesta] ✓ Migración de ingesta completada')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
