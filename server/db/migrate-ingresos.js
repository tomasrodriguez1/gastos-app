import sql from './client.js'

// Ingresos reales (fecha, fuente, monto), separados de presupuesto_ingreso
// (que es solo la previsión por ciclo, reemplazada cada PUT). Sin UNIQUE: a
// diferencia de reserva_saldo, un ingreso puede repetirse el mismo día/fuente
// (dos pagos reales) sin que sea un error. Idempotente — corre en cada
// arranque, igual que migrate-reservas.js.
//
// origen 'clases' = lo creó un pago de clases particulares (server/clases/);
// ese ingreso no se edita ni borra suelto, se saca deshaciendo el pago.
// origen 'chat' / 'mcp' = lo registró una IA: nace estado='pendiente' y no cuenta como ingreso
// real hasta que un humano lo aprueba (DEC-020). 'manual' y 'clases' (pago registrado desde la UI)
// nacen 'confirmado'.
//
// fuente_ingreso es el catálogo de fuentes (nombre canónico, tipo, día esperado). ingreso.fuente
// y presupuesto_ingreso.fuente siguen siendo texto con ese nombre canónico (sin FK) para no
// romper el historial; el dominio valida contra el catálogo.
export const FUENTES_INICIALES = [
  ['Sueldo Zalantos', 'fijo', false, 1],
  ['Clases particulares', 'variable', true, 2],
  ['Proyectos propios', 'variable', false, 3],
  ['Mesada', 'fijo', false, 4],
  ['Otros', 'variable', false, 5],
  ['Uso de fondos', 'fondos', false, 6],
]

// Nombres que tenía el previsto antes del catálogo.
const RENOMBRES_PREVISTO = [
  ['Zalantos', 'Sueldo Zalantos'],
  ['Clases Particulares', 'Clases particulares'],
]

export async function migrateIngresos(db = sql) {
  await db.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS ingreso (
        id               SERIAL PRIMARY KEY,
        fecha            TEXT NOT NULL CHECK (fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        ciclo_financiero TEXT NOT NULL,
        fuente           TEXT NOT NULL,
        monto            NUMERIC NOT NULL,
        nota             TEXT,
        origen           TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'chat', 'clases', 'mcp')),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_ingreso_ciclo ON ingreso(ciclo_financiero)')
    // Tablas creadas antes de 'clases': se reemplaza el CHECK (nombre por defecto de PG).
    await tx.unsafe('ALTER TABLE ingreso DROP CONSTRAINT IF EXISTS ingreso_origen_check')
    await tx.unsafe(`ALTER TABLE ingreso ADD CONSTRAINT ingreso_origen_check CHECK (origen IN ('manual', 'chat', 'clases', 'mcp'))`)
    await tx.unsafe(`ALTER TABLE ingreso ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmado'`)
    await tx.unsafe('ALTER TABLE ingreso DROP CONSTRAINT IF EXISTS ingreso_estado_check')
    await tx.unsafe(`ALTER TABLE ingreso ADD CONSTRAINT ingreso_estado_check CHECK (estado IN ('pendiente', 'confirmado'))`)
    await tx.unsafe('ALTER TABLE ingreso ADD COLUMN IF NOT EXISTS fondo TEXT')
    await tx.unsafe('CREATE INDEX IF NOT EXISTS idx_ingreso_estado ON ingreso(estado)')

    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS fuente_ingreso (
        id           SERIAL PRIMARY KEY,
        nombre       TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
        tipo         TEXT NOT NULL DEFAULT 'variable' CHECK (tipo IN ('fijo', 'variable', 'fondos')),
        automatica   BOOLEAN NOT NULL DEFAULT false,
        dia_esperado INTEGER CHECK (dia_esperado BETWEEN 1 AND 31),
        activa       BOOLEAN NOT NULL DEFAULT true,
        orden        INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await tx.unsafe('CREATE UNIQUE INDEX IF NOT EXISTS idx_fuente_ingreso_nombre_lower ON fuente_ingreso (lower(nombre))')
    // Seed: solo inserta lo que falta, nunca pisa lo que el usuario cambió.
    for (const [nombre, tipo, automatica, orden] of FUENTES_INICIALES) {
      await tx`
        INSERT INTO fuente_ingreso (nombre, tipo, automatica, orden)
        VALUES (${nombre}, ${tipo}, ${automatica}, ${orden})
        ON CONFLICT DO NOTHING
      `
    }

    // El previsto del presupuesto usa los mismos nombres que el catálogo (montos intactos). Se
    // salta un ciclo si ya existe una fila con el nombre nuevo (UNIQUE ciclo+fuente).
    const [{ existe }] = await tx`SELECT to_regclass('public.presupuesto_ingreso') IS NOT NULL AS existe`
    if (existe) {
      for (const [viejo, nuevo] of RENOMBRES_PREVISTO) {
        await tx`
          UPDATE presupuesto_ingreso p SET fuente = ${nuevo}
          WHERE p.fuente = ${viejo}
            AND NOT EXISTS (SELECT 1 FROM presupuesto_ingreso q WHERE q.ciclo = p.ciclo AND q.fuente = ${nuevo})
        `
      }
    }
  })
}

if (import.meta.main) {
  try {
    await migrateIngresos()
    console.log('[migrate:ingresos] ✓ Tablas ingreso y fuente_ingreso listas')
  } finally {
    await sql.end({ timeout: 5 })
  }
}
