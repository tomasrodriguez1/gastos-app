import sql from './client.js'

export async function migrateFinancialCycles() {
  let gastosExiste = false
  await sql.begin(async (tx) => {
    const [{ gastos_existe: existe }] = await tx`
      SELECT to_regclass('public.gastos') IS NOT NULL AS gastos_existe
    `
    gastosExiste = existe

    if (gastosExiste) {
      await tx.unsafe('ALTER TABLE gastos ADD COLUMN IF NOT EXISTS ciclo_financiero TEXT')
      await tx.unsafe(`
        UPDATE gastos
        SET
          mes = substring(fecha, 1, 7),
          ciclo_financiero = CASE
            WHEN substring(fecha, 9, 2)::integer >= 29
              THEN to_char((fecha::date + INTERVAL '1 month'), 'YYYY-MM')
            ELSE substring(fecha, 1, 7)
          END
        WHERE
          mes IS DISTINCT FROM substring(fecha, 1, 7)
          OR ciclo_financiero IS NULL
          OR ciclo_financiero IS DISTINCT FROM CASE
            WHEN substring(fecha, 9, 2)::integer >= 29
              THEN to_char((fecha::date + INTERVAL '1 month'), 'YYYY-MM')
            ELSE substring(fecha, 1, 7)
          END
      `)
      await tx.unsafe('ALTER TABLE gastos ALTER COLUMN ciclo_financiero SET NOT NULL')
      await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_gastos_ciclo_financiero ON gastos(ciclo_financiero)')
    }

    const [{ presupuesto_mes_existe: presupuestoMesExiste }] = await tx`
      SELECT to_regclass('public.presupuesto_mes') IS NOT NULL AS presupuesto_mes_existe
    `
    const [{ presupuesto_ciclo_existe: presupuestoCicloExiste }] = await tx`
      SELECT to_regclass('public.presupuesto_ciclo') IS NOT NULL AS presupuesto_ciclo_existe
    `

    if (presupuestoMesExiste && !presupuestoCicloExiste) {
      await tx.unsafe('ALTER TABLE presupuesto_mes RENAME TO presupuesto_ciclo')
      await tx.unsafe('ALTER TABLE presupuesto_ciclo RENAME COLUMN mes TO ciclo')
      await tx.unsafe('ALTER TABLE presupuesto_ingreso RENAME COLUMN mes TO ciclo')
      await tx.unsafe('ALTER TABLE presupuesto_categoria RENAME COLUMN mes TO ciclo')
      await tx.unsafe('ALTER TABLE presupuesto_fondo RENAME COLUMN mes TO ciclo')
    }
  })

  if (!gastosExiste) return

  const [{ inconsistencias }] = await sql`
    SELECT COUNT(*)::integer AS inconsistencias
    FROM gastos
    WHERE
      mes IS DISTINCT FROM substring(fecha, 1, 7)
      OR ciclo_financiero IS DISTINCT FROM CASE
        WHEN substring(fecha, 9, 2)::integer >= 29
          THEN to_char((fecha::date + INTERVAL '1 month'), 'YYYY-MM')
        ELSE substring(fecha, 1, 7)
      END
  `
  if (inconsistencias !== 0) {
    throw new Error(`La verificación detectó ${inconsistencias} transacciones con período incorrecto`)
  }
}

if (import.meta.main) {
  try {
    await migrateFinancialCycles()
    console.log('[migrate:ciclos] ✓ Migración financiera completada y verificada')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
