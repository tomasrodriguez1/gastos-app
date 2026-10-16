import { describe, expect, test, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import {
  crearIngreso, editarIngreso, eliminarIngreso, listarIngresos, confirmarIngreso, descartarIngreso,
  buscarIngresosSimilares, listarFuentes, crearFuente, editarFuente,
} from './ingresos.js'
import { aprobarIngreso, descartarPendiente, listarPendientes, resumenIngresosCiclo, fechaEsperadaCiclo } from './ingresosCiclo.js'
import { createIngresoRouter } from './routes/ingresos.js'
import { crearAlumno, agendarClase, marcarDictada, registrarPago, resumenClases } from './clases/clases.js'
import { migrateIngresos } from './db/migrate-ingresos.js'
import { migrateClases } from './db/migrate-clases.js'

// Validaciones que cortan antes de tocar la DB: un db que falla si se usa.
const dbProhibida = Object.assign(async () => { throw new Error('no debería consultar la DB') }, {
  begin: async () => { throw new Error('no debería abrir transacción') },
})

describe('crearIngreso: validaciones previas (sin DB)', () => {
  const base = { fecha: '2026-08-10', fuente: 'Mesada', monto: 100000 }
  test('falta fuente, monto inválido, fecha inválida y origen inválido → 400', async () => {
    expect((await crearIngreso({ ...base, fuente: '  ' }, dbProhibida)).status).toBe(400)
    expect((await crearIngreso({ ...base, monto: 0 }, dbProhibida)).status).toBe(400)
    expect((await crearIngreso({ ...base, monto: 'x' }, dbProhibida)).status).toBe(400)
    expect((await crearIngreso({ ...base, fecha: '2026-02-30' }, dbProhibida)).status).toBe(400)
    expect((await crearIngreso({ ...base, origen: 'mail' }, dbProhibida)).status).toBe(400)
  })
})

describe('fechaEsperadaCiclo', () => {
  test('días 29–31 caen en el mes anterior; el resto en el mes del ciclo', () => {
    expect(fechaEsperadaCiclo('2026-10', 5)).toBe('2026-10-05')
    expect(fechaEsperadaCiclo('2026-10', 28)).toBe('2026-10-28')
    expect(fechaEsperadaCiclo('2026-10', 30)).toBe('2026-09-30')
    expect(fechaEsperadaCiclo('2026-03', 30)).toBe('2026-03-28') // el día no existe en el ciclo: cae al cierre
  })
})

// ─── Contra Postgres ─────────────────────────────────────────────────────────
// Necesita una base descartable: CLASES_TEST_DATABASE_URL=postgres://… bun test server/ingresos.test.js
// Borra y recrea las tablas de ingresos, clases y presupuesto en esa base. Nunca corre contra DATABASE_URL.

const URL_TEST = process.env.CLASES_TEST_DATABASE_URL
const usarDb = Boolean(URL_TEST) && URL_TEST !== process.env.DATABASE_URL

describe.skipIf(!usarDb)('ingresos contra Postgres', () => {
  let db
  const HOY = '2026-10-16'

  // Solo las dos tablas de presupuesto que usa el resumen (el schema completo depende de otras migraciones).
  const crearBase = async () => {
    await db`
      CREATE TABLE IF NOT EXISTS presupuesto_ciclo (
        ciclo TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await db`
      CREATE TABLE IF NOT EXISTS presupuesto_ingreso (
        id SERIAL PRIMARY KEY, ciclo TEXT NOT NULL REFERENCES presupuesto_ciclo(ciclo) ON DELETE CASCADE,
        fuente TEXT NOT NULL, monto NUMERIC NOT NULL DEFAULT 0, UNIQUE(ciclo, fuente)
      )
    `
  }

  beforeAll(async () => {
    db = postgres(URL_TEST, { max: 4, onnotice: () => {} })
    await db`DROP TABLE IF EXISTS pago_clase, pago, clase, alumno, familia, ingreso, fuente_ingreso, clase_import_descartada CASCADE`
    await crearBase()
    await migrateIngresos(db)
    await migrateClases(db)
  })

  afterAll(async () => {
    await db?.end({ timeout: 5 })
  })

  beforeEach(async () => {
    await db`TRUNCATE pago_clase, pago, clase, alumno, familia, ingreso, presupuesto_ciclo, clase_import_descartada RESTART IDENTITY CASCADE`
    // El catálogo vuelve a su estado de seed.
    await db`DELETE FROM fuente_ingreso`
    await migrateIngresos(db)
  })

  async function previsto(ciclo, filas) {
    await db`INSERT INTO presupuesto_ciclo (ciclo) VALUES (${ciclo}) ON CONFLICT DO NOTHING`
    for (const [fuente, monto] of Object.entries(filas)) {
      await db`INSERT INTO presupuesto_ingreso (ciclo, fuente, monto) VALUES (${ciclo}, ${fuente}, ${monto})`
    }
  }
  const fuenteId = async (nombre) => (await db`SELECT id FROM fuente_ingreso WHERE nombre = ${nombre}`)[0].id

  describe('migración y catálogo', () => {
    test('seed de las 6 fuentes, idempotente y sin pisar cambios', async () => {
      const fuentes = await listarFuentes({}, db)
      expect(fuentes.map(f => [f.nombre, f.tipo, f.automatica])).toEqual([
        ['Sueldo Zalantos', 'fijo', false],
        ['Clases particulares', 'variable', true],
        ['Proyectos propios', 'variable', false],
        ['Mesada', 'fijo', false],
        ['Otros', 'variable', false],
        ['Uso de fondos', 'fondos', false],
      ])
      await editarFuente(await fuenteId('Mesada'), { dia_esperado: 3 }, db)
      await migrateIngresos(db)
      await migrateIngresos(db)
      expect(await listarFuentes({}, db)).toHaveLength(6)
      expect((await listarFuentes({}, db)).find(f => f.nombre === 'Mesada').dia_esperado).toBe(3)
    })

    test('renombra el previsto al catálogo sin tocar montos ni chocar con un nombre ya existente', async () => {
      await previsto('2026-09', { Zalantos: 1480000, 'Clases Particulares': 500000, Mesada: 115000, Otros: 509679 })
      await previsto('2026-10', { Zalantos: 1480000, 'Sueldo Zalantos': 1500000 })
      await migrateIngresos(db)
      await migrateIngresos(db)
      const sep = await db`SELECT fuente, monto::int FROM presupuesto_ingreso WHERE ciclo = '2026-09' ORDER BY fuente`
      expect(sep).toEqual([
        { fuente: 'Clases particulares', monto: 500000 },
        { fuente: 'Mesada', monto: 115000 },
        { fuente: 'Otros', monto: 509679 },
        { fuente: 'Sueldo Zalantos', monto: 1480000 },
      ])
      // En octubre ya existía "Sueldo Zalantos": "Zalantos" se deja como está (UNIQUE ciclo+fuente).
      const oct = await db`SELECT fuente, monto::int FROM presupuesto_ingreso WHERE ciclo = '2026-10' ORDER BY fuente`
      expect(oct).toEqual([{ fuente: 'Sueldo Zalantos', monto: 1500000 }, { fuente: 'Zalantos', monto: 1480000 }])
    })

    test('crear y editar fuentes: nombre único, día solo en fijas, renombrar propaga, automática protegida', async () => {
      const { fuente } = await crearFuente({ nombre: 'Arriendo', tipo: 'fijo', dia_esperado: 5 }, db)
      expect(fuente).toMatchObject({ nombre: 'Arriendo', tipo: 'fijo', dia_esperado: 5, activa: true })
      expect((await crearFuente({ nombre: 'arriendo' }, db)).status).toBe(409)
      expect((await crearFuente({ nombre: 'X', tipo: 'variable', dia_esperado: 5 }, db)).status).toBe(400)
      expect((await crearFuente({ nombre: 'Y', tipo: 'fijo', dia_esperado: 40 }, db)).status).toBe(400)
      expect((await crearFuente({ nombre: 'Z', tipo: 'otro' }, db)).status).toBe(400)

      // Deja de ser fija → el día se limpia solo.
      expect((await editarFuente(fuente.id, { tipo: 'variable' }, db)).fuente.dia_esperado).toBeNull()

      await previsto('2026-10', { Arriendo: 300000 })
      await crearIngreso({ fecha: '2026-10-05', fuente: 'Arriendo', monto: 300000 }, db)
      const r = await editarFuente(fuente.id, { nombre: 'Arriendo depto' }, db)
      expect(r.fuente.nombre).toBe('Arriendo depto')
      expect((await listarIngresos({}, db))[0].fuente).toBe('Arriendo depto')
      expect((await db`SELECT fuente FROM presupuesto_ingreso WHERE ciclo = '2026-10'`)[0].fuente).toBe('Arriendo depto')
      expect((await editarFuente(fuente.id, { nombre: 'Mesada' }, db)).status).toBe(409)

      const clasesId = await fuenteId('Clases particulares')
      expect((await editarFuente(clasesId, { nombre: 'Clases' }, db)).status).toBe(409)
      expect((await editarFuente(clasesId, { activa: false }, db)).status).toBe(409)
      expect((await editarFuente(9999, { nombre: 'x' }, db)).status).toBe(404)
    })
  })

  describe('crearIngreso', () => {
    test('estado según origen: manual y clases confirmado; chat y mcp pendiente', async () => {
      const mk = (origen, fuente = 'Mesada') => crearIngreso({ fecha: '2026-10-05', fuente, monto: 115000, origen }, db)
      expect((await mk('manual')).ingreso).toMatchObject({ origen: 'manual', estado: 'confirmado' })
      expect((await mk('chat')).ingreso).toMatchObject({ origen: 'chat', estado: 'pendiente' })
      expect((await mk('mcp')).ingreso).toMatchObject({ origen: 'mcp', estado: 'pendiente' })
      expect((await mk('clases', 'Clases particulares')).ingreso).toMatchObject({ origen: 'clases', estado: 'confirmado' })
    })

    test('guarda el nombre canónico (sin distinguir mayúsculas) y calcula el ciclo (día 29 → siguiente)', async () => {
      const r = await crearIngreso({ fecha: '2026-09-29', fuente: ' sueldo zalantos ', monto: 1480000 }, db)
      expect(r.ingreso).toMatchObject({ fuente: 'Sueldo Zalantos', ciclo_financiero: '2026-10' })
    })

    test('fuente fuera del catálogo, desactivada o automática se rechazan', async () => {
      const fuera = await crearIngreso({ fecha: '2026-10-05', fuente: 'Lotería', monto: 1000 }, db)
      expect(fuera).toMatchObject({ status: 400, code: 'validacion' })
      expect(fuera.validas).toEqual(['Sueldo Zalantos', 'Proyectos propios', 'Mesada', 'Otros', 'Uso de fondos'])

      for (const origen of ['manual', 'chat', 'mcp']) {
        const auto = await crearIngreso({ fecha: '2026-10-05', fuente: 'Clases particulares', monto: 1000, origen }, db)
        expect(auto.status).toBe(400)
        expect(auto.error).toContain('pago de clases')
      }

      await editarFuente(await fuenteId('Otros'), { activa: false }, db)
      expect((await crearIngreso({ fecha: '2026-10-05', fuente: 'Otros', monto: 1000 }, db)).error).toContain('desactivada')
    })

    test('el ciclo se puede indicar solo en ingresos de clases (DEC-021)', async () => {
      const base = { fecha: '2026-10-20', monto: 1000 }
      const ok = await crearIngreso({ ...base, fuente: 'Clases particulares', origen: 'clases', ciclo: '2026-11' }, db)
      expect(ok.ingreso).toMatchObject({ fecha: '2026-10-20', ciclo_financiero: '2026-11' })
      expect((await crearIngreso({ ...base, fuente: 'Mesada', ciclo: '2026-11' }, db)).status).toBe(400)
      expect((await crearIngreso({ ...base, fuente: 'Clases particulares', origen: 'clases', ciclo: '2026-13' }, db)).status).toBe(400)
      expect((await crearIngreso({ ...base, fuente: 'Mesada', origen: 'mcp', ciclo: '2026-11' }, db)).status).toBe(400)
    })

    test('"fondo" solo con la fuente de tipo fondos', async () => {
      const ok = await crearIngreso({ fecha: '2026-10-05', fuente: 'Uso de fondos', monto: 50000, fondo: 'Vacaciones' }, db)
      expect(ok.ingreso).toMatchObject({ fuente: 'Uso de fondos', fondo: 'Vacaciones' })
      expect((await crearIngreso({ fecha: '2026-10-05', fuente: 'Mesada', monto: 5, fondo: 'Vacaciones' }, db)).status).toBe(400)
    })
  })

  describe('similares', () => {
    test('misma fuente, monto ±10 % y fecha ±5 días', async () => {
      await crearIngreso({ fecha: '2026-10-05', fuente: 'Proyectos propios', monto: 300000 }, db)
      const buscar = (args) => buscarIngresosSimilares({ fuente: 'proyectos propios', monto: 300000, fecha: '2026-10-05', ...args }, db)
      expect(await buscar({})).toHaveLength(1)
      expect(await buscar({ monto: 325000, fecha: '2026-10-10' })).toHaveLength(1)
      expect(await buscar({ monto: 340000 })).toHaveLength(0)
      expect(await buscar({ fecha: '2026-10-11' })).toHaveLength(0)
      expect(await buscar({ fuente: 'Mesada' })).toHaveLength(0)
      expect(await buscarIngresosSimilares({}, db)).toEqual([])
    })
  })

  describe('aprobar, descartar y editar', () => {
    test('confirmar un pendiente; dos veces → 409; descartar solo pendientes', async () => {
      const { ingreso } = await crearIngreso({ fecha: '2026-10-05', fuente: 'Proyectos propios', monto: 300000, origen: 'mcp' }, db)
      expect((await listarIngresos({ estado: 'pendiente' }, db))).toHaveLength(1)
      expect((await confirmarIngreso(ingreso.id, db)).ingreso.estado).toBe('confirmado')
      expect((await confirmarIngreso(ingreso.id, db)).status).toBe(409)
      expect((await descartarIngreso(ingreso.id, db)).status).toBe(409)
      expect((await confirmarIngreso(999, db)).status).toBe(404)

      const { ingreso: otro } = await crearIngreso({ fecha: '2026-10-06', fuente: 'Otros', monto: 1000, origen: 'chat' }, db)
      expect((await descartarIngreso(otro.id, db)).ok).toBe(true)
      expect(await listarIngresos({}, db)).toHaveLength(1)
    })

    test('editar un pendiente conserva su estado y valida la fuente; los de clases no se editan', async () => {
      const { ingreso } = await crearIngreso({ fecha: '2026-10-05', fuente: 'Otros', monto: 1000, origen: 'chat' }, db)
      const r = await editarIngreso(ingreso.id, { fuente: 'mesada', monto: 115000, fecha: '2026-10-30' }, db)
      expect(r.ingreso).toMatchObject({ fuente: 'Mesada', monto: 115000, estado: 'pendiente', ciclo_financiero: '2026-11' })
      expect((await editarIngreso(ingreso.id, { fuente: 'Lotería' }, db)).status).toBe(400)
      expect((await editarIngreso(ingreso.id, { fuente: 'Clases particulares' }, db)).status).toBe(400)
      expect((await editarIngreso(ingreso.id, { monto: 0 }, db)).status).toBe(400)
      expect((await editarIngreso(999, { monto: 5 }, db)).status).toBe(404)

      const { ingreso: deClases } = await crearIngreso({ fecha: '2026-10-05', fuente: 'Clases particulares', monto: 1000, origen: 'clases' }, db)
      expect((await editarIngreso(deClases.id, { monto: 5 }, db)).status).toBe(409)
      expect((await eliminarIngreso(deClases.id, db)).status).toBe(409)
      expect((await confirmarIngreso(deClases.id, db)).status).toBe(409)
      expect((await descartarIngreso(deClases.id, db)).status).toBe(409)
    })

    test('un ingreso de clases pendiente se aprueba y se descarta a través de su pago', async () => {
      const { alumno } = await crearAlumno({ nombre: 'Cristobal Mena', precio_hora_default: 20000 }, db)
      const clase = async (fecha) => {
        const r = await agendarClase({ alumno_id: alumno.id, fecha, hora_inicio: '19:00' }, db)
        await marcarDictada(r.clase.id, db)
        return r.clase.id
      }
      const [c1, c2] = [await clase('2026-10-01'), await clase('2026-10-02')]

      const p1 = await registrarPago({ claseIds: [c1], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      const p2 = await registrarPago({ claseIds: [c2], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      const pend = await listarPendientes(db)
      expect(pend).toHaveLength(2)
      expect(pend[0]).toMatchObject({ origen: 'clases', cobrado_a: 'Cristobal Mena', clases: 1, estado: 'pendiente' })

      expect((await aprobarIngreso(p1.ingreso.id, db)).ingreso.estado).toBe('confirmado')
      expect((await db`SELECT cobro FROM clase WHERE id = ${c1}`)[0].cobro).toBe('pagado')
      expect((await aprobarIngreso(p1.ingreso.id, db)).status).toBe(409)

      expect((await descartarPendiente(p2.ingreso.id, db)).ok).toBe(true)
      expect(await db`SELECT id FROM pago WHERE id = ${p2.pago.id}`).toHaveLength(0)
      expect((await db`SELECT cobro FROM clase WHERE id = ${c2}`)[0].cobro).toBe('pendiente')
      // Un pago ya confirmado no se descarta por acá.
      expect((await descartarPendiente(p1.ingreso.id, db)).status).toBe(409)
      expect((await aprobarIngreso(0, db)).status).toBe(400)
      expect((await aprobarIngreso(999, db)).status).toBe(404)
    })
  })

  describe('resumenIngresosCiclo', () => {
    test('previsto vs real por fuente, esperado, estados y totales', async () => {
      await editarFuente(await fuenteId('Sueldo Zalantos'), { dia_esperado: 5 }, db)
      await editarFuente(await fuenteId('Mesada'), { dia_esperado: 1 }, db)
      await previsto('2026-10', { 'Sueldo Zalantos': 1480000, 'Clases particulares': 500000, Mesada: 115000, Otros: 509679 })

      await crearIngreso({ fecha: '2026-10-01', fuente: 'Mesada', monto: 115000 }, db)
      await crearIngreso({ fecha: '2026-10-10', fuente: 'Proyectos propios', monto: 300000, origen: 'mcp' }, db)
      await crearIngreso({ fecha: '2026-10-12', fuente: 'Uso de fondos', monto: 50000, fondo: 'Vacaciones' }, db)
      await db`INSERT INTO ingreso (fecha, ciclo_financiero, fuente, monto, origen) VALUES ('2026-10-02', '2026-10', 'Legacy', 7000, 'manual')`

      const { alumno } = await crearAlumno({ nombre: 'Luciano Mena', precio_hora_default: 20000 }, db)
      const r = await agendarClase({ alumno_id: alumno.id, fecha: '2026-10-08', hora_inicio: '18:00' }, db)
      await marcarDictada(r.clase.id, db)

      const res = await resumenIngresosCiclo('2026-10', { hoy: HOY }, db)
      const f = Object.fromEntries(res.fuentes.map(x => [x.nombre, x]))

      expect(f['Sueldo Zalantos']).toMatchObject({ previsto: 1480000, real: 0, esperado: 1480000, estado: 'atrasado' })
      expect(f.Mesada).toMatchObject({ previsto: 115000, real: 115000, estado: 'llego' })
      expect(f['Proyectos propios']).toMatchObject({ real: 0, por_aprobar: 300000, esperado: 300000, estado: 'por_aprobar' })
      expect(f.Otros).toMatchObject({ previsto: 509679, esperado: 509679, estado: 'pendiente' })
      // La clase es del 8 de octubre: es ingreso del ciclo de NOVIEMBRE (DEC-021), no de octubre.
      expect(f['Clases particulares']).toMatchObject({ previsto: 500000, real: 0, por_cobrar: 0, por_confirmar: 0, esperado: 0, mes_clases: '2026-09' })
      expect(f['Uso de fondos']).toMatchObject({ tipo: 'fondos', real: 50000, esperado: 50000 })
      expect(f.Legacy).toMatchObject({ fuera_catalogo: true, real: 7000 })

      // Uso de fondos va aparte: no suma a lo real ni a lo esperado de ingresos.
      expect(res.totales).toEqual({
        previsto: 1480000 + 500000 + 115000 + 509679,
        real: 115000 + 7000,
        esperado: 1480000 + 115000 + 300000 + 509679 + 7000,
        por_aprobar: 300000,
        fondos: 50000,
      })
      expect(res.rango).toEqual({ desde: '2026-09-29', hasta: '2026-10-28' })

      // En el ciclo de noviembre sí: lo que deben las clases de octubre.
      const nov = await resumenIngresosCiclo('2026-11', { hoy: HOY }, db)
      expect(nov.fuentes.find(x => x.nombre === 'Clases particulares')).toMatchObject({ por_cobrar: 20000, esperado: 20000, mes_clases: '2026-10' })
      expect(nov.totales.esperado).toBe(20000)
    })

    test('antes del día esperado no está atrasado; la deuda de clases va al ciclo siguiente a las clases; ciclo inválido', async () => {
      await editarFuente(await fuenteId('Sueldo Zalantos'), { dia_esperado: 25 }, db)
      const { alumno } = await crearAlumno({ nombre: 'Rafaela Moraga', precio_hora_default: 20000 }, db)
      const r = await agendarClase({ alumno_id: alumno.id, fecha: '2026-10-08', hora_inicio: '18:00' }, db)
      await marcarDictada(r.clase.id, db)

      const actual = await resumenIngresosCiclo('2026-10', { hoy: HOY }, db)
      expect(actual.fuentes.find(x => x.nombre === 'Sueldo Zalantos').estado).toBe('pendiente')
      // Las clases dictadas en octubre todavía no son plata esperada de octubre sino de noviembre.
      expect(actual.fuentes.find(x => x.nombre === 'Clases particulares').por_cobrar).toBe(0)
      expect((await resumenIngresosCiclo('2026-11', { hoy: HOY }, db)).fuentes.find(x => x.nombre === 'Clases particulares').por_cobrar).toBe(20000)

      const pasado = await resumenIngresosCiclo('2026-08', { hoy: HOY }, db)
      expect(pasado.fuentes.find(x => x.nombre === 'Sueldo Zalantos').estado).toBe('atrasado')
      expect(pasado.fuentes.find(x => x.nombre === 'Clases particulares')).toMatchObject({ por_cobrar: 0, esperado: 0 })
      expect((await resumenIngresosCiclo('2026-13', { hoy: HOY }, db)).status).toBe(400)
    })

    test('un pago de clases por confirmar aparece como por_confirmar y no como real', async () => {
      const { alumno } = await crearAlumno({ nombre: 'Julieta Chinetti', precio_hora_default: 20000 }, db)
      const a = await agendarClase({ alumno_id: alumno.id, fecha: '2026-10-08', hora_inicio: '18:00' }, db)
      await marcarDictada(a.clase.id, db)
      await registrarPago({ claseIds: [a.clase.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)

      // Clase del 8 de octubre pagada el 16: el ingreso (pendiente) es del ciclo de noviembre.
      const res = await resumenIngresosCiclo('2026-11', { hoy: HOY }, db)
      const c = res.fuentes.find(x => x.nombre === 'Clases particulares')
      expect(c).toMatchObject({ real: 0, por_aprobar: 20000, por_confirmar: 20000, por_cobrar: 20000, esperado: 20000, estado: 'por_aprobar' })
      expect(res.totales.real).toBe(0)
      expect(res.totales.por_aprobar).toBe(20000)
      expect((await resumenIngresosCiclo('2026-10', { hoy: HOY }, db)).totales.por_aprobar).toBe(0)
      // La clase sigue en la deuda mientras el pago está por confirmar.
      expect((await resumenClases({}, db)).deuda_total).toBe(20000)
    })
  })

  describe('router /api/ingresos', () => {
    const pedir = (router, path, method = 'GET', body) => router.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    })

    test('POST crea siempre manual y confirmado, ignorando origen/estado del body', async () => {
      const router = createIngresoRouter({ db })
      const res = await pedir(router, '/', 'POST', { fecha: '2026-10-05', fuente: 'Mesada', monto: 115000, origen: 'clases', estado: 'pendiente' })
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ origen: 'manual', estado: 'confirmado', fuente: 'Mesada' })

      const mal = await pedir(router, '/', 'POST', { fecha: '2026-10-05', fuente: 'Clases particulares', monto: 5 })
      expect(mal.status).toBe(400)
      expect(await mal.json()).toMatchObject({ code: 'validacion' })
    })

    test('pendientes, confirmar, descartar, resumen, similares y fuentes', async () => {
      const router = createIngresoRouter({ db })
      const { ingreso } = await crearIngreso({ fecha: '2026-10-05', fuente: 'Proyectos propios', monto: 300000, origen: 'mcp' }, db)
      const { ingreso: otro } = await crearIngreso({ fecha: '2026-10-06', fuente: 'Otros', monto: 1000, origen: 'chat' }, db)

      expect((await (await pedir(router, '/pendientes')).json()).map(i => i.id)).toEqual([otro.id, ingreso.id])
      expect(await (await pedir(router, `/${ingreso.id}/confirmar`, 'POST')).json()).toMatchObject({ ingreso: { estado: 'confirmado' } })
      expect((await pedir(router, `/${ingreso.id}/confirmar`, 'POST')).status).toBe(409)
      expect((await pedir(router, `/${otro.id}/descartar`, 'POST')).status).toBe(200)
      expect((await pedir(router, '/?estado=pendiente')).status).toBe(200)

      const resumen = await (await pedir(router, '/resumen?ciclo=2026-10')).json()
      expect(resumen.totales.real).toBe(300000)
      expect((await pedir(router, '/resumen?ciclo=mal')).status).toBe(400)
      expect((await (await pedir(router, '/similares?fuente=Proyectos propios&monto=300000&fecha=2026-10-07')).json())).toHaveLength(1)

      const fuentes = await (await pedir(router, '/fuentes')).json()
      expect(fuentes).toHaveLength(6)
      const nueva = await pedir(router, '/fuentes', 'POST', { nombre: 'Arriendo', tipo: 'fijo', dia_esperado: 5 })
      expect(nueva.status).toBe(201)
      expect((await pedir(router, `/fuentes/${(await nueva.json()).id}`, 'PATCH', { activa: false })).status).toBe(200)
    })
  })
})
