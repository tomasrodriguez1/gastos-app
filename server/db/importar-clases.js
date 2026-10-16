// Import one-shot (re-ejecutable) de clases desde un export de Notion. Formato del archivo en
// docs/context/data_model_context.md ("Import desde Notion").
//
//   bun run import:clases <archivo.csv|.json> [--dry-run] [--col-dictada "<columna>"] [--actualizar-precios]
//
// Escribe en la base de DATABASE_URL. Idempotente por notion_id: correrlo dos veces no duplica.
import sql from './client.js'
import { migrateIngresos } from './migrate-ingresos.js'
import { migrateClases } from './migrate-clases.js'
import { leerArchivo, importarClases } from '../clases/importar.js'

function argumentos(argv) {
  const opciones = { dryRun: false, actualizarPrecios: false, colDictada: undefined, archivo: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') opciones.dryRun = true
    else if (a === '--actualizar-precios') opciones.actualizarPrecios = true
    else if (a === '--col-dictada') opciones.colDictada = argv[++i]
    else if (a.startsWith('--col-dictada=')) opciones.colDictada = a.slice('--col-dictada='.length)
    else if (!opciones.archivo) opciones.archivo = a
  }
  return opciones
}

if (import.meta.main) {
  const opciones = argumentos(process.argv.slice(2))
  if (!opciones.archivo) {
    console.error('Uso: bun run import:clases <archivo.csv|.json> [--dry-run] [--col-dictada "<columna>"] [--actualizar-precios]')
    process.exit(1)
  }
  try {
    const texto = await Bun.file(opciones.archivo).text()
    const filas = leerArchivo(texto, opciones.archivo)
    await migrateIngresos()
    await migrateClases()
    const reporte = await importarClases(filas, sql, opciones)
    console.log(JSON.stringify(reporte, null, 2))
    console.log(reporte.dry_run
      ? '[import:clases] Simulación: no se escribió nada.'
      : `[import:clases] ✓ ${reporte.clases_nuevas} clases nuevas, ${reporte.clases_existentes} ya existían, ${reporte.errores.length} filas con error.`)
    if (reporte.errores.length) process.exitCode = 2
  } finally {
    await sql.end({ timeout: 5 })
  }
}
