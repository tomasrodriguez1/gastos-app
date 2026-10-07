import sql from './client.js'

// Libro del FGP (Fondo Gastos Previstos) como fondo con arrastre entre ciclos. El aporte (previsto
// de las líneas fgp=true de cada ciclo) y el gasto (gastos de esas líneas) se derivan — acá solo
// vive lo que no se puede derivar:
//   traspaso_tc — el gasto (gasto_id) ya se pasó al fondo de tarjeta. Con tarjeta_movimiento_id
//                 si generó un aporte real en fondo_tarjeta_movimiento; NULL si solo se marcó
//                 ("ya estaba movido"). No afecta el saldo del FGP.
//   cobertura   — plata que entró al FGP desde otro lado para tapar un exceso (+).
//   deficit     — exceso que se paga con el sueldo del ciclo `ciclo` (+, compromiso).
//   ajuste      — corrección manual del saldo (±).
// Borrar el aporte de tarjeta o el movimiento de fondo de ahorro asociado borra la fila (CASCADE),
// así el gasto vuelve a quedar pendiente de mover. Idempotente — corre en cada arranque.
export async function migrateFGP() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS fgp_movimiento (
        id                         SERIAL PRIMARY KEY,
        tipo                       TEXT NOT NULL CHECK (tipo IN ('traspaso_tc', 'cobertura', 'deficit', 'ajuste')),
        ciclo                      TEXT NOT NULL CHECK (ciclo ~ '^\\d{4}-\\d{2}$'),
        fecha                      TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        monto                      NUMERIC NOT NULL,
        gasto_id                   TEXT,
        tarjeta_movimiento_id      INTEGER REFERENCES fondo_tarjeta_movimiento(id) ON DELETE CASCADE,
        fondo_ahorro_movimiento_id INTEGER REFERENCES fondo_ahorro_movimiento(id) ON DELETE CASCADE,
        origen                     TEXT,
        nota                       TEXT,
        created_at                 TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fgp_traspaso_gasto ON fgp_movimiento(gasto_id) WHERE tipo = 'traspaso_tc'`)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_fgp_movimiento_fecha ON fgp_movimiento(fecha DESC, id DESC)')
  })
}

if (import.meta.main) {
  try {
    await migrateFGP()
    console.log('[migrate:fgp] ✓ Tabla fgp_movimiento lista')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
