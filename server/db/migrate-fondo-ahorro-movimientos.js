import sql from './client.js'

// Historial de aportes manuales a un fondo de ahorro del presupuesto (presupuesto_fondo) que NO
// está vinculado a una categoría — para esos, "acumulado" sigue siendo el campo autoritativo
// (se actualiza via PUT /api/presupuesto/:ciclo, igual que siempre); esta tabla es solo un log
// adicional para mostrar "ingresos" como lista, igual que `listarUsosFondo` ya muestra egresos
// desde gastos.financiado_por. No ciclo: un fondo se referencia por nombre, igual criterio que
// gastos.financiado_por (convención, no FK) — así un fondo que se recrea cada ciclo (copiar
// ciclo anterior) conserva su historial. Idempotente — corre en cada arranque.
export async function migrateFondoAhorroMovimientos() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS fondo_ahorro_movimiento (
        id           SERIAL PRIMARY KEY,
        fondo_nombre TEXT NOT NULL,
        fecha        TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        monto        NUMERIC NOT NULL,
        nota         TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_fondo_ahorro_mov_nombre ON fondo_ahorro_movimiento(fondo_nombre, fecha DESC)')
  })
}

if (import.meta.main) {
  try {
    await migrateFondoAhorroMovimientos()
    console.log('[migrate:fondo-ahorro-movimientos] ✓ Tabla fondo_ahorro_movimiento lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
