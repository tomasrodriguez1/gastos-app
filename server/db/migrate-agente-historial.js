import sql from './client.js'

// Crea las tablas de historial del agente conversacional (F3). Idempotente —
// corre en cada arranque, igual que migrate-comercios.js, porque initSchema()
// solo se ejecuta en dev o con RUN_SCHEMA_INIT=true.
export async function migrateAgenteHistorial() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS agente_conversaciones (
        id          TEXT PRIMARY KEY,
        titulo      TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS agente_mensajes (
        id               TEXT PRIMARY KEY,
        conversacion_id  TEXT NOT NULL REFERENCES agente_conversaciones(id) ON DELETE CASCADE,
        role             TEXT NOT NULL,
        parts            JSONB NOT NULL,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_agente_mensajes_conversacion ON agente_mensajes(conversacion_id, created_at)')
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_agente_conversaciones_updated ON agente_conversaciones(updated_at DESC)')
  })
}

if (import.meta.main) {
  try {
    await migrateAgenteHistorial()
    console.log('[migrate:agente-historial] ✓ Tablas agente_conversaciones/agente_mensajes listas')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
