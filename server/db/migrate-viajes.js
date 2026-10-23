import sql from './client.js'

// Viajes: etiqueta ortogonal a la categoría presupuestaria. Un gasto pertenece a 0 o 1 viaje
// (gastos.viaje_id); el viaje no cambia el presupuesto del ciclo — ver src/utils/viajes.js y
// DEC-024. Sin FK a propósito: los ids de gastos son texto y borrar un viaje limpia viaje_id en
// la misma transacción (server/viajes.js). Idempotente — corre en cada arranque.
export async function migrateViajes() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS viaje (
        id          TEXT PRIMARY KEY,
        nombre      TEXT NOT NULL,
        emoji       TEXT,
        fecha_desde TEXT NOT NULL CHECK (fecha_desde ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        fecha_hasta TEXT NOT NULL CHECK (fecha_hasta ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        presupuesto NUMERIC,
        estado      TEXT NOT NULL DEFAULT 'planificado' CHECK (estado IN ('planificado', 'en_curso', 'cerrado')),
        nota        TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        CHECK (fecha_hasta >= fecha_desde)
      )
    `)

    const [{ gastos_existe: gastosExiste }] = await tx`
      SELECT to_regclass('public.gastos') IS NOT NULL AS gastos_existe
    `
    if (gastosExiste) {
      await tx.unsafe('ALTER TABLE gastos ADD COLUMN IF NOT EXISTS viaje_id TEXT')
      await tx.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_gastos_viaje_id
        ON gastos(viaje_id)
        WHERE viaje_id IS NOT NULL
      `)
    }
  })
}

if (import.meta.main) {
  try {
    await migrateViajes()
    console.log('[migrate:viajes] ✓ Tabla viaje y gastos.viaje_id listas')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
