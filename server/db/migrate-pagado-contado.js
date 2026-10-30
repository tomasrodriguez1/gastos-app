import sql from './client.js'
import { PATRON_MEDIO_YA_PAGADO } from '../../src/utils/medioPago.js'

// Idempotente: cada arranque marca como pagados los gastos de efectivo,
// transferencia o débito que todavía figuran pendientes.
export async function migratePagadoContado() {
  const filas = await sql`
    UPDATE gastos
    SET pagado = TRUE, updated_at = NOW()
    WHERE pagado IS NOT TRUE
      AND banco ~* ${PATRON_MEDIO_YA_PAGADO}
    RETURNING id
  `
  if (filas.length > 0) {
    console.log(`[migrate:pagado-contado] ${filas.length} gasto(s) de contado marcados como pagados`)
  }
  return filas.length
}

if (import.meta.main) {
  try {
    const n = await migratePagadoContado()
    console.log(`[migrate:pagado-contado] ✓ ${n} fila(s)`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}
