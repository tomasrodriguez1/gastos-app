import { readFileSync } from 'fs'
import { resolve } from 'path'
import sql from './client.js'

export async function initSchema() {
  const schema = readFileSync(resolve(import.meta.dir, 'schema.pg.sql'), 'utf-8')
  await sql.unsafe(schema)
  console.log('[db] Schema initialized')
}
