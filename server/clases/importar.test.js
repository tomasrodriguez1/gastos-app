import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import postgres from 'postgres'
import {
  parsearCSV, objetosDesdeCSV, leerArchivo, detectarColumnaDictada, normalizarFecha, normalizarHora,
  normalizarMonto, normalizarHoras, normalizarFila, importarClases,
} from './importar.js'
import { resumenClases, eliminarClase } from './clases.js'
import { migrateIngresos } from '../db/migrate-ingresos.js'
import { migrateClases } from '../db/migrate-clases.js'

// Réplica de la vista "Pagos" de octubre 2026: 11 clases presenciales de $25.000 y 1 h,
// "No cobrado", 9 con el checkbox (sin encabezado) marcado. Algunas fechas traen el "1:00 AM"
// basura de Notion.
const OCTUBRE = [
  'Nombre,Fecha,Hora,Modalidad,Status,Price,Horas,,$ till now',
  'Cristóbal Mena,"October 1, 2026 1:00 AM",19:00,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Luciano Mena,"October 1, 2026",18:00,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Julieta Chinetti,"October 2, 2026 1:00 AM",12:30,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Rafaela Moraga,"October 3, 2026",19:00,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Cristóbal Mena,"October 6, 2026",19:00,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Luciano Mena,"October 7, 2026 1:00 AM",18:00,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Julieta Chinetti,"October 8, 2026",12:30,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Rafaela Moraga,"October 10, 2026",19:00,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Cristóbal Mena,"October 13, 2026",19:00,Presencial,No cobrado,"$25,000",1,Yes,"$25,000"',
  'Luciano Mena,"October 14, 2026",18:00,Presencial,No cobrado,"$25,000",1,No,$0',
  'Julieta Chinetti,"October 20, 2026",12:30,Presencial,No cobrado,"$25,000",1,No,$0',
].join('\n')

describe('parser y normalización', () => {
  test('CSV con comillas, comas, BOM, CRLF y saltos dentro de campos', () => {
    expect(parsearCSV('\uFEFFa,b\r\n"x, y","con ""comillas""\nen dos líneas"\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'con "comillas"\nen dos líneas'],
    ])
    expect(parsearCSV('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  })

  test('fechas: solo el día de calendario', () => {
    expect(normalizarFecha('October 6, 2026 1:00 AM')).toBe('2026-10-06')
    expect(normalizarFecha('October 6, 2026 1:00 AM → October 6, 2026 2:00 AM')).toBe('2026-10-06')
    expect(normalizarFecha('2026-10-06T01:00:00.000-03:00')).toBe('2026-10-06')
    expect(normalizarFecha('6 de octubre de 2026')).toBe('2026-10-06')
    expect(normalizarFecha('06/10/2026')).toBe('2026-10-06')
    expect(normalizarFecha('2026/10/06')).toBe('2026-10-06')
    expect(normalizarFecha('February 30, 2026')).toBeNull()
    expect(normalizarFecha('')).toBeNull()
  })

  test('hora, monto', () => {
    expect(normalizarHora('19:00')).toBe('19:00')
    expect(normalizarHora('7:00 PM')).toBe('19:00')
    expect(normalizarHora('12:30 PM')).toBe('12:30')
    expect(normalizarHora('12:00 AM')).toBe('00:00')
    expect(normalizarHora('9:05')).toBe('09:05')
    expect(normalizarHora('25:00')).toBeNull()
    expect(normalizarMonto('CLP\u00a022,500')).toBe(22500)
    expect(normalizarHoras('1:30')).toBe(1.5)
    expect(normalizarHoras('1 (2)')).toBe(1)
    expect(normalizarHoras('1,5')).toBe(1.5)
    expect(normalizarHoras('0.5')).toBe(0.5)
    expect(normalizarHoras('1 ')).toBe(1)
    expect(normalizarHoras('')).toBeNull()
    expect(normalizarFecha('September 23, 2026 1:00 AM (GMT-3)')).toBe('2026-09-23')
    expect(normalizarMonto('$25,000')).toBe(25000)
    expect(normalizarMonto('$25.000')).toBe(25000)
    expect(normalizarMonto('CLP 18000')).toBe(18000)
    expect(normalizarMonto('')).toBeNull()
  })

  test('detecta el checkbox sin encabezado', () => {
    const filas = objetosDesdeCSV(OCTUBRE)
    expect(detectarColumnaDictada(filas)).toBe('')
    const renombrado = filas.map(({ '': hecho, ...resto }) => ({ ...resto, Dada: hecho }))
    expect(detectarColumnaDictada(renombrado)).toBe('Dada')
    expect(() => detectarColumnaDictada(renombrado, 'Otra')).toThrow()
  })

  test('reglas de estado y cobro', () => {
    const base = { Nombre: 'Baltazar Martinić', Fecha: '2026-09-01', Hora: '18:00', Modalidad: 'Online', Price: '9000', Horas: '0,5' }
    const pagadaSinCheck = normalizarFila({ ...base, Status: 'Pagado', '': 'No' }, { colDictada: '' }).clase
    expect(pagadaSinCheck).toMatchObject({ estado: 'dictada', cobro: 'pagado', duracion_minutos: 30, precio_hora: 18000, monto: 9000, modalidad: 'online' })
    // Fecha pasada sin checkbox y sin cobrar → programada (no se da por dictada).
    expect(normalizarFila({ ...base, Status: 'No cobrado', '': 'No' }, { colDictada: '' }).clase).toMatchObject({ estado: 'programada', cobro: 'pendiente' })
    const rara = normalizarFila({ ...base, Status: 'Transferido', '': 'Yes' }, { colDictada: '' })
    expect(rara.clase).toMatchObject({ estado: 'dictada', cobro: 'pendiente', notion_status: 'Transferido' })
    expect(rara.statusRaro).toBe('Transferido')
    expect(normalizarFila({ ...base, Status: '' }).clase.notion_id).toBe('csv:Baltazar Martinić|2026-09-01|18:00')
    expect(normalizarFila({ ...base, id: 'abc-123' }).clase.notion_id).toBe('abc-123')
    expect(normalizarFila({ ...base, Fecha: 'ayer' }).error).toMatch(/Fecha/)
    expect(normalizarFila({ ...base, Nombre: '' }).error).toMatch(/Nombre/)
  })

  test('JSON: array de filas con las mismas columnas', () => {
    expect(leerArchivo('[{"Nombre":"X"}]', 'export.json')).toEqual([{ Nombre: 'X' }])
    expect(() => leerArchivo('{"a":1}', 'x.json')).toThrow()
  })
})

const URL_TEST = process.env.CLASES_TEST_DATABASE_URL
const usarDb = Boolean(URL_TEST) && URL_TEST !== process.env.DATABASE_URL

describe.skipIf(!usarDb)('import contra Postgres', () => {
  let db

  beforeAll(async () => {
    db = postgres(URL_TEST, { max: 2, onnotice: () => {} })
    await migrateIngresos(db)
    await migrateClases(db)
    await db`TRUNCATE pago_clase, pago, clase, alumno, familia, ingreso, clase_import_descartada RESTART IDENTITY CASCADE`
  })

  afterAll(async () => {
    await db?.end({ timeout: 5 })
  })

  test('vista de octubre: 9 dictadas, deuda 225.000; dry-run no escribe; reimport no duplica', async () => {
    const filas = leerArchivo(OCTUBRE, 'pagos.csv')

    const simulado = await importarClases(filas, db, { dryRun: true })
    expect(simulado).toMatchObject({ clases_nuevas: 11, dry_run: true })
    expect((await db`SELECT COUNT(*)::int AS n FROM clase`)[0].n).toBe(0)

    const r = await importarClases(filas, db)
    expect(r).toMatchObject({ filas: 11, columna_dictada: '', clases_nuevas: 11, clases_existentes: 0, errores: [] })
    expect(r.alumnos_creados.map(a => a.nombre).sort()).toEqual(['Cristóbal Mena', 'Julieta Chinetti', 'Luciano Mena', 'Rafaela Moraga'])

    const resumen = await resumenClases({ desde: '2026-10-01', hasta: '2026-10-31' }, db)
    expect(resumen.clases_dictadas).toBe(9)
    expect(resumen.monto_dictado).toBe(225000)
    expect(resumen.deuda_total).toBe(225000)
    expect(resumen.clases_programadas).toBe(2)
    expect((await db`SELECT COUNT(*)::int AS n FROM ingreso`)[0].n).toBe(0)

    const otraVez = await importarClases(filas, db)
    expect(otraVez).toMatchObject({ clases_nuevas: 0, clases_existentes: 11, alumnos_creados: [] })
    expect((await db`SELECT COUNT(*)::int AS n FROM clase`)[0].n).toBe(11)

    // Una clase importada que se elimina en la app no vuelve al reimportar.
    const [una] = await db`SELECT id FROM clase WHERE estado = 'programada' ORDER BY id LIMIT 1`
    expect((await eliminarClase(una.id, db)).ok).toBe(true)
    const tercera = await importarClases(filas, db)
    expect(tercera).toMatchObject({ clases_nuevas: 0, clases_existentes: 10, eliminadas_en_app: 1 })
  })

  test('Pagado entra cobrado sin pago ni ingreso; precio default = tarifa más reciente', async () => {
    const csv = [
      'Nombre,Fecha,Hora,Modalidad,Status,Price,Horas,Hecha',
      'Baltazar Martinić,2026-08-01,18:00,Online,Pagado,20000,1,Yes',
      'Baltazar Martinić,2026-09-01,18:00,Online,Pagado,27000,1.5,Yes',
    ].join('\n')
    const r = await importarClases(leerArchivo(csv, 'b.csv'), db)
    expect(r.alumnos_creados).toEqual([{ nombre: 'Baltazar Martinić', precio_hora_default: 18000 }])
    const clases = await db`SELECT estado, cobro FROM clase c JOIN alumno a ON a.id = c.alumno_id WHERE a.nombre = 'Baltazar Martinić'`
    expect(clases.every(c => c.estado === 'dictada' && c.cobro === 'pagado')).toBe(true)
    expect((await db`SELECT COUNT(*)::int AS n FROM pago`)[0].n).toBe(0)
    expect((await db`SELECT COUNT(*)::int AS n FROM ingreso`)[0].n).toBe(0)
  })
})
