import sql from './client.js'

// Registro de avisos de Telegram: qué message_id de qué chat corresponde a qué
// gasto, para que una respuesta (reply) a ese aviso quede atada al gasto.
// Idempotente — corre en cada arranque, igual que migrate-agente-historial.js.
export async function migrateTelegramAvisos() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS telegram_avisos (
      chat_id     TEXT NOT NULL,
      message_id  BIGINT NOT NULL,
      gasto_id    TEXT NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (chat_id, message_id)
    )
  `)
}

if (import.meta.main) {
  try {
    await migrateTelegramAvisos()
    console.log('[migrate:telegram-avisos] ✓ Tabla telegram_avisos lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
