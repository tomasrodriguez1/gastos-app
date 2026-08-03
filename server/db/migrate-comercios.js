import sql from './client.js'

// Crea la tabla de memoria de comercios. Idempotente — corre en cada arranque,
// igual que migrate-ingesta.js, porque initSchema() solo se ejecuta en dev
// o con RUN_SCHEMA_INIT=true.
export async function migrateComercios() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS comercio_mapeo (
        comercio_normalizado TEXT PRIMARY KEY,
        comercio_ejemplo     TEXT NOT NULL,
        tipos                JSONB NOT NULL DEFAULT '[]',
        contexto             TEXT DEFAULT '',
        presupuesto_manual   JSONB,
        banco_habitual       TEXT DEFAULT '',
        veces_confirmado     INTEGER NOT NULL DEFAULT 1,
        ultima_confirmacion  TIMESTAMPTZ DEFAULT NOW(),
        created_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_comercio_veces ON comercio_mapeo(veces_confirmado DESC)')
  })
}

if (import.meta.main) {
  try {
    await migrateComercios()
    console.log('[migrate:comercios] ✓ Tabla comercio_mapeo lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
