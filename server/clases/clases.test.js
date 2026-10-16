import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import {
  calcularMonto, crearAlumno, editarAlumno, agendarClase, moverClase, marcarDictada, cancelarClase,
  registrarPago, confirmarPago, deshacerPago, eliminarClase, resumenClases, deudaClasesDelMes, ingresoAutomaticoClases, crearFamilia, editarFamilia, eliminarFamilia, listarFamilias, listarAlumnos, buscarClases, ingresosClasesCiclo, listarPagos,
  FUENTE_INGRESO_CLASES,
} from './clases.js'
import { editarIngreso, eliminarIngreso } from '../ingresos.js'
import { migrateIngresos } from '../db/migrate-ingresos.js'
import { migrateClases } from '../db/migrate-clases.js'

// Validaciones que cortan antes de tocar la DB: un db que falla si se usa.
const dbProhibida = Object.assign(async () => { throw new Error('no debería consultar la DB') }, {
  begin: async () => { throw new Error('no debería abrir transacción') },
})

describe('validaciones sin DB', () => {
  test('monto = precio_hora × horas, redondeado', () => {
    expect(calcularMonto(25000, 60)).toBe(25000)
    expect(calcularMonto(25000, 90)).toBe(37500)
    expect(calcularMonto(18000, 30)).toBe(9000)
    expect(calcularMonto(20000, 50)).toBe(16667)
  })

  test('agendar rechaza fecha, hora, duración y modalidad inválidas', async () => {
    const base = { alumno: 'X', fecha: '2026-10-20', hora_inicio: '19:00', duracion_minutos: 60, modalidad: 'presencial' }
    expect((await agendarClase({ ...base, fecha: '2026-02-30' }, dbProhibida)).code).toBe('validacion')
    expect((await agendarClase({ ...base, hora_inicio: '7pm' }, dbProhibida)).code).toBe('validacion')
    expect((await agendarClase({ ...base, hora_inicio: '24:00' }, dbProhibida)).code).toBe('validacion')
    expect((await agendarClase({ ...base, duracion_minutos: 0 }, dbProhibida)).code).toBe('validacion')
    expect((await agendarClase({ ...base, modalidad: 'Zoom' }, dbProhibida)).code).toBe('validacion')
    expect((await agendarClase({ ...base, precio_hora: 2500.5 }, dbProhibida)).code).toBe('validacion')
  })

  test('registrar pago rechaza sin clases, ids inválidos, fecha inválida o futura', async () => {
    const hoy = '2026-10-16'
    expect((await registrarPago({ claseIds: [], fecha: hoy, hoy }, dbProhibida)).code).toBe('validacion')
    expect((await registrarPago({ claseIds: ['a'], fecha: hoy, hoy }, dbProhibida)).code).toBe('validacion')
    expect((await registrarPago({ claseIds: [1], fecha: '2026-13-01', hoy }, dbProhibida)).code).toBe('validacion')
    expect((await registrarPago({ claseIds: [1], fecha: '2026-10-17', hoy }, dbProhibida)).code).toBe('validacion')
  })
})

// ─── Contra Postgres ─────────────────────────────────────────────────────────
// Necesita una base descartable: CLASES_TEST_DATABASE_URL=postgres://… bun test server/clases
// Borra y recrea ingreso/alumno/clase/pago en esa base. Nunca corre contra DATABASE_URL.

const URL_TEST = process.env.CLASES_TEST_DATABASE_URL
const usarDb = Boolean(URL_TEST) && URL_TEST !== process.env.DATABASE_URL

describe.skipIf(!usarDb)('clases contra Postgres', () => {
  let db
  const HOY = '2026-10-16'

  beforeAll(async () => {
    db = postgres(URL_TEST, { max: 4, onnotice: () => {} })
    await db`DROP TABLE IF EXISTS pago_clase, pago, clase, alumno, familia, ingreso, clase_import_descartada CASCADE`
    await migrateIngresos(db)
    await migrateClases(db)
    // Idempotentes: correrlas dos veces no falla.
    await migrateIngresos(db)
    await migrateClases(db)
  })

  afterAll(async () => {
    await db?.end({ timeout: 5 })
  })

  beforeEach(async () => {
    await db`TRUNCATE pago_clase, pago, clase, alumno, familia, ingreso, clase_import_descartada RESTART IDENTITY CASCADE`
  })

  async function alumno(nombre = 'Cristóbal Mena', precio = 25000) {
    return (await crearAlumno({ nombre, precio_hora_default: precio }, db)).alumno
  }

  async function claseDictada(nombre, fecha, extra = {}) {
    const r = await agendarClase({ alumno: nombre, fecha, hora_inicio: '19:00', duracion_minutos: 60, ...extra }, db)
    expect(r.error).toBeUndefined()
    await marcarDictada(r.clase.id, db)
    return r.clase
  }

  // postgres.js devuelve queries perezosas: se await-ean acá para que el rechazo sea un Error.
  async function falla(query) {
    try { await query } catch { return true }
    return false
  }

  const contar = async (tabla) => (await db`SELECT COUNT(*)::int AS n FROM ${db(tabla)}`)[0].n

  test('ingreso acepta origen clases y el CHECK sigue rechazando otros', async () => {
    await db`INSERT INTO ingreso (fecha, ciclo_financiero, fuente, monto, origen) VALUES ('2026-10-01', '2026-10', 'x', 1, 'clases')`
    expect(await falla(db`INSERT INTO ingreso (fecha, ciclo_financiero, fuente, monto, origen) VALUES ('2026-10-01', '2026-10', 'x', 1, 'otro')`)).toBe(true)
  })

  test('crear_alumno con nombre existente devuelve el mismo, sin duplicar; reactiva si estaba inactivo', async () => {
    const a = await alumno('Baltazar Martinić', 18000)
    const otra = await crearAlumno({ nombre: '  baltazar martinić ', precio_hora_default: 99999 }, db)
    expect(otra).toMatchObject({ existente: true, alumno: { id: a.id, precio_hora_default: 18000 } })
    expect(await contar('alumno')).toBe(1)

    await editarAlumno(a.id, { activo: false }, db)
    const reactivado = await crearAlumno({ nombre: 'Baltazar Martinić' }, db)
    expect(reactivado).toMatchObject({ existente: true, reactivado: true, alumno: { activo: true } })
  })

  test('agendar usa el precio del alumno y lo congela; no repite misma hora', async () => {
    const a = await alumno('Baltazar Martinić', 18000)
    const r = await agendarClase({ alumno_id: a.id, fecha: '2026-10-20', hora_inicio: '18:00', duracion_minutos: 90 }, db)
    expect(r.clase).toMatchObject({ precio_hora: 18000, monto: 27000, horas: 1.5, estado: 'programada', cobro: 'pendiente', modalidad: 'presencial' })

    await editarAlumno(a.id, { precio_hora_default: 20000 }, db)
    const [fila] = await db`SELECT precio_hora, monto FROM clase WHERE id = ${r.clase.id}`
    expect(fila).toEqual({ precio_hora: 18000, monto: 27000 })

    const repetida = await agendarClase({ alumno_id: a.id, fecha: '2026-10-20', hora_inicio: '18:00' }, db)
    expect(repetida).toMatchObject({ code: 'conflicto', clase_id: r.clase.id })
    expect((await agendarClase({ alumno: 'Nadie', fecha: '2026-10-20', hora_inicio: '18:00' }, db)).code).toBe('no_encontrado')
  })

  test('agendar rechaza alumno desactivado', async () => {
    const a = await alumno()
    await editarAlumno(a.id, { activo: false }, db)
    expect((await agendarClase({ alumno_id: a.id, fecha: '2026-10-20', hora_inicio: '18:00' }, db)).code).toBe('conflicto')
  })

  test('mover recalcula el monto y solo vale para programada + pendiente', async () => {
    await alumno()
    const { clase } = await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-20', hora_inicio: '19:00' }, db)
    const movida = await moverClase(clase.id, { fecha: '2026-10-21', hora_inicio: '12:30', duracion_minutos: 120, modalidad: 'online', precio_hora: 20000 }, db)
    expect(movida.clase).toMatchObject({ fecha: '2026-10-21', hora_inicio: '12:30', monto: 40000, modalidad: 'online' })

    await marcarDictada(clase.id, db)
    expect((await moverClase(clase.id, { hora_inicio: '13:00' }, db)).code).toBe('conflicto')
  })

  test('marcar dictada: programada → dictada sin tocar el cobro; no sobre cancelada', async () => {
    await alumno()
    const { clase } = await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-20', hora_inicio: '19:00' }, db)
    expect((await marcarDictada(clase.id, db)).clase).toMatchObject({ estado: 'dictada', dictada: true, cobro: 'pendiente' })
    expect((await marcarDictada(clase.id, db)).code).toBe('conflicto')

    const { clase: otra } = await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-22', hora_inicio: '19:00' }, db)
    await cancelarClase(otra.id, db)
    expect((await marcarDictada(otra.id, db)).code).toBe('conflicto')
    expect((await marcarDictada(9999, db)).code).toBe('no_encontrado')
  })

  test('pago feliz: un ingreso en el ciclo del mes siguiente a las clases, clases pagadas, pago_clase por clase', async () => {
    await alumno()
    const c1 = await claseDictada('Cristóbal Mena', '2026-10-01')
    const c2 = await claseDictada('Cristóbal Mena', '2026-10-08')
    const c3 = await claseDictada('Cristóbal Mena', '2026-10-15', { duracion_minutos: 90 })

    // Pagado antes (29 de septiembre, ciclo de octubre): las clases son de octubre, así que el
    // ingreso es del ciclo de noviembre igual (DEC-021).
    const r = await registrarPago({ claseIds: [c3.id, c1.id, c2.id, c1.id], fecha: '2026-09-29', hoy: HOY }, db)
    expect(r.error).toBeUndefined()
    expect(r.pagos).toHaveLength(1)
    expect(r.pago).toMatchObject({ monto: 87500, fecha: '2026-09-29', ciclo_financiero: '2026-11' })
    expect(r.ingreso).toMatchObject({
      fuente: FUENTE_INGRESO_CLASES, monto: 87500, fecha: '2026-09-29', ciclo_financiero: '2026-11', origen: 'clases',
      nota: 'Cristóbal Mena: 2026-10-01, 2026-10-08, 2026-10-15',
    })
    expect(await contar('pago_clase')).toBe(3)
    const cobros = await db`SELECT DISTINCT cobro FROM clase`
    expect(cobros.map(c => c.cobro)).toEqual(['pagado'])
    expect((await ingresosClasesCiclo('2026-11', db))).toMatchObject({ total: 87500, cantidad: 1 })
    expect((await ingresosClasesCiclo('2026-10', db))).toMatchObject({ total: 0, cantidad: 0 })

    const { pagos } = await listarPagos({}, db)
    expect(pagos[0].clases.map(c => c.id)).toEqual([c1.id, c2.id, c3.id])
  })

  describe('ciclo del ingreso: las clases del mes M son ingreso del ciclo M+1 (DEC-021)', () => {
    test('pagar dentro del mismo mes no mueve el ingreso: sigue siendo del ciclo siguiente', async () => {
      await alumno()
      const c = await claseDictada('Cristóbal Mena', '2026-10-01')
      const r = await registrarPago({ claseIds: [c.id], fecha: '2026-10-15', hoy: HOY }, db)
      expect(r.ingreso).toMatchObject({ fecha: '2026-10-15', ciclo_financiero: '2026-11' })
    })

    test('el 29–31 sigue siendo "del mes": una clase del 30 de octubre también es ingreso de noviembre', async () => {
      await alumno()
      const c = await claseDictada('Cristóbal Mena', '2026-10-30')
      expect((await registrarPago({ claseIds: [c.id], fecha: HOY, hoy: HOY }, db)).ingreso.ciclo_financiero).toBe('2026-11')
    })

    test('un cobro con clases de meses distintos crea un pago e ingreso por ciclo, en una sola transacción', async () => {
      await alumno()
      const sep = await claseDictada('Cristóbal Mena', '2026-09-30')
      const oct1 = await claseDictada('Cristóbal Mena', '2026-10-05')
      const oct2 = await claseDictada('Cristóbal Mena', '2026-10-29', { duracion_minutos: 90 })
      const r = await registrarPago({ claseIds: [oct2.id, sep.id, oct1.id], fecha: HOY, monto: 87500, hoy: HOY }, db)

      expect(r.pagos.map(p => [p.ciclo_financiero, p.monto])).toEqual([['2026-10', 25000], ['2026-11', 62500]])
      expect(r.ingresos.map(i => [i.ciclo_financiero, i.monto, i.estado])).toEqual([['2026-10', 25000, 'confirmado'], ['2026-11', 62500, 'confirmado']])
      expect(r.pago.id).toBe(r.pagos[0].id)
      expect(r.ingresos[1].nota).toBe('Cristóbal Mena: 2026-10-05, 2026-10-29')
      expect((await db`SELECT DISTINCT cobro FROM clase`).map(x => x.cobro)).toEqual(['pagado'])
      expect(await contar('pago_clase')).toBe(3)
      expect((await ingresosClasesCiclo('2026-10', db)).total).toBe(25000)
      expect((await ingresosClasesCiclo('2026-11', db)).total).toBe(62500)

      // Cada pago se deshace por separado: el otro queda.
      await deshacerPago(r.pagos[1].id, db)
      expect(await contar('ingreso')).toBe(1)
      expect((await db`SELECT cobro FROM clase WHERE id = ${sep.id}`)[0].cobro).toBe('pagado')
      expect((await db`SELECT cobro FROM clase WHERE id = ${oct1.id}`)[0].cobro).toBe('pendiente')
    })

    test('por confirmar con meses distintos: dos pagos pendientes; cada uno se aprueba por separado', async () => {
      await alumno()
      const sep = await claseDictada('Cristóbal Mena', '2026-09-20')
      const oct = await claseDictada('Cristóbal Mena', '2026-10-05')
      const r = await registrarPago({ claseIds: [sep.id, oct.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      expect(r.pagos.map(p => [p.ciclo_financiero, p.estado])).toEqual([['2026-10', 'pendiente'], ['2026-11', 'pendiente']])
      expect(await confirmarPago(r.pagos[0].id, db)).toMatchObject({ ok: true })
      expect((await db`SELECT cobro FROM clase WHERE id = ${sep.id}`)[0].cobro).toBe('pagado')
      expect((await db`SELECT cobro FROM clase WHERE id = ${oct.id}`)[0].cobro).toBe('pendiente')
    })

    test('una clase de $0 de otro mes se suma al grupo con monto (un pago no puede ser $0)', async () => {
      await alumno()
      const gratis = await claseDictada('Cristóbal Mena', '2026-09-10', { precio_hora: 0 })
      const oct = await claseDictada('Cristóbal Mena', '2026-10-05')
      const r = await registrarPago({ claseIds: [gratis.id, oct.id], fecha: HOY, hoy: HOY }, db)
      expect(r.pagos).toHaveLength(1)
      expect(r.pago).toMatchObject({ monto: 25000, ciclo_financiero: '2026-11' })
      expect(await contar('pago_clase')).toBe(2)
      // Solo clases de $0: nada que cobrar.
      const otra = await claseDictada('Cristóbal Mena', '2026-10-12', { precio_hora: 0 })
      expect((await registrarPago({ claseIds: [otra.id], fecha: HOY, hoy: HOY }, db)).code).toBe('validacion')
    })

    test('ingreso automático: las clases de un mes ya cobradas sin pago registrado se asumen como ingreso', async () => {
      await alumno()
      // Cobradas sin pago registrado (como las importadas de Notion con Status "Pagado").
      const a = await claseDictada('Cristóbal Mena', '2026-09-03')
      const b = await claseDictada('Cristóbal Mena', '2026-09-10', { duracion_minutos: 90 })
      await db`UPDATE clase SET cobro = 'pagado' WHERE id = ANY(${[a.id, b.id]})`
      // No cuentan: pagada con un pago registrado (ya tiene su ingreso), con pago por confirmar, sin
      // cobrar, programada y de otro mes.
      const conPago = await claseDictada('Cristóbal Mena', '2026-09-12')
      await registrarPago({ claseIds: [conPago.id], fecha: HOY, hoy: HOY }, db)
      const porConfirmar = await claseDictada('Cristóbal Mena', '2026-09-14')
      await registrarPago({ claseIds: [porConfirmar.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      await claseDictada('Cristóbal Mena', '2026-09-16')
      await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-09-18', hora_inicio: '19:00' }, db)
      const octubre = await claseDictada('Cristóbal Mena', '2026-10-02')
      await db`UPDATE clase SET cobro = 'pagado' WHERE id = ${octubre.id}`

      expect(await ingresoAutomaticoClases('2026-09', db)).toEqual({ mes: '2026-09', total: 62500, clases: 2 })
      expect(await ingresoAutomaticoClases('2026-10', db)).toEqual({ mes: '2026-10', total: 25000, clases: 1 })
      expect(await ingresoAutomaticoClases('2026-08', db)).toMatchObject({ total: 0, clases: 0 })
      expect((await ingresoAutomaticoClases('mal', db)).code).toBe('validacion')

      // El KPI del ciclo de octubre (clases de septiembre) = pago registrado + automático, sin doble conteo.
      expect(await ingresosClasesCiclo('2026-10', db)).toMatchObject({
        total: 25000 + 62500, registrado: 25000, automatico: 62500, cantidad: 1, clases_automaticas: 2,
      })
    })

    test('deudaClasesDelMes: solo las dictadas sin cobrar de ese mes calendario, con lo ya por confirmar', async () => {
      await alumno()
      await claseDictada('Cristóbal Mena', '2026-09-30')
      const a = await claseDictada('Cristóbal Mena', '2026-10-01')
      await claseDictada('Cristóbal Mena', '2026-10-31')
      await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-20', hora_inicio: '19:00' }, db) // programada: no cuenta
      await registrarPago({ claseIds: [a.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)

      expect(await deudaClasesDelMes('2026-10', db)).toEqual({ mes: '2026-10', deuda: 50000, clases: 2, por_confirmar: 25000 })
      expect(await deudaClasesDelMes('2026-09', db)).toMatchObject({ deuda: 25000, clases: 1, por_confirmar: 0 })
      expect(await deudaClasesDelMes('2026-11', db)).toMatchObject({ deuda: 0, clases: 0 })
      expect((await deudaClasesDelMes('mal', db)).code).toBe('validacion')
    })
  })

  test('rechazos de pago dejan la DB intacta', async () => {
    await alumno('Cristóbal Mena')
    await alumno('Luciano Mena')
    const dictada = await claseDictada('Cristóbal Mena', '2026-10-01')
    const deOtro = await claseDictada('Luciano Mena', '2026-10-01')
    const { clase: programada } = await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-09', hora_inicio: '19:00' }, db)
    const { clase: cancelada } = await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-10', hora_inicio: '19:00' }, db)
    await cancelarClase(cancelada.id, db)

    const casos = [
      [{ claseIds: [dictada.id, programada.id] }, 'conflicto'],
      [{ claseIds: [dictada.id, deOtro.id] }, 'validacion'],
      [{ claseIds: [dictada.id, cancelada.id] }, 'conflicto'],
      [{ claseIds: [dictada.id], monto: 20000 }, 'validacion'],
      [{ claseIds: [dictada.id, 9999] }, 'no_encontrado'],
    ]
    for (const [args, code] of casos) {
      const r = await registrarPago({ ...args, fecha: HOY, hoy: HOY }, db)
      expect(r.code).toBe(code)
    }
    expect(await contar('ingreso')).toBe(0)
    expect(await contar('pago')).toBe(0)

    // Ya pagada → no se paga dos veces.
    expect((await registrarPago({ claseIds: [dictada.id], fecha: HOY, monto: 25000, hoy: HOY }, db)).pago).toBeDefined()
    expect((await registrarPago({ claseIds: [dictada.id], fecha: HOY, hoy: HOY }, db)).code).toBe('conflicto')
    expect(await contar('ingreso')).toBe(1)
  })

  test('si falla a mitad de la transacción no queda ni ingreso ni pago', async () => {
    await alumno()
    const c = await claseDictada('Cristóbal Mena', '2026-10-01')
    // Falla forzada con un trigger: el INSERT de pago_clase revienta después de haber insertado
    // el ingreso y el pago dentro de la misma transacción.
    await db`CREATE OR REPLACE FUNCTION test_falla_pago_clase() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falla forzada'; END $$ LANGUAGE plpgsql`
    await db`CREATE TRIGGER test_falla BEFORE INSERT ON pago_clase FOR EACH ROW EXECUTE FUNCTION test_falla_pago_clase()`
    try {
      for (const porConfirmar of [false, true]) {
        expect(await falla(registrarPago({ claseIds: [c.id], fecha: HOY, porConfirmar, hoy: HOY }, db))).toBe(true)
      }
    } finally {
      await db`DROP TRIGGER IF EXISTS test_falla ON pago_clase`
    }
    expect(await contar('ingreso')).toBe(0)
    expect(await contar('pago')).toBe(0)
    expect(await contar('pago_clase')).toBe(0)
    const [fila] = await db`SELECT cobro FROM clase WHERE id = ${c.id}`
    expect(fila.cobro).toBe('pendiente')
  })

  describe('pago por confirmar (MCP)', () => {
    async function preparar() {
      await alumno('Cristóbal Mena', 20000)
      const c1 = await claseDictada('Cristóbal Mena', '2026-10-01')
      const c2 = await claseDictada('Cristóbal Mena', '2026-10-08')
      return [c1, c2]
    }

    test('crea pago e ingreso pendientes; las clases siguen sin cobrar y en la deuda', async () => {
      const [c1, c2] = await preparar()
      const r = await registrarPago({ claseIds: [c1.id, c2.id], fecha: HOY, monto: 40000, porConfirmar: true, hoy: HOY }, db)
      expect(r.pago).toMatchObject({ estado: 'pendiente', monto: 40000 })
      expect(r.ingreso).toMatchObject({ estado: 'pendiente', origen: 'clases', fuente: FUENTE_INGRESO_CLASES })
      expect((await db`SELECT DISTINCT cobro FROM clase`).map(x => x.cobro)).toEqual(['pendiente'])
      expect(await contar('pago_clase')).toBe(2)

      const res = await resumenClases({}, db)
      expect(res).toMatchObject({ cobrado: 0, pagos: 0, deuda_total: 40000, por_confirmar_total: 40000 })
      expect(res.deuda_por_familia[0]).toMatchObject({ deuda: 40000, por_confirmar: 40000 })
      // Ni cobrado ni ingresos del ciclo lo cuentan todavía.
      expect(await ingresosClasesCiclo('2026-11', db)).toMatchObject({ total: 0, cantidad: 0 })

      const clases = (await buscarClases({}, db)).filas
      expect(clases.every(c => c.pago_estado === 'pendiente' && c.cobro === 'pendiente')).toBe(true)
      expect((await buscarClases({ sin_pago: true }, db)).filas).toHaveLength(0)
      expect((await listarPagos({}, db)).pagos[0]).toMatchObject({ estado: 'pendiente' })
    })

    test('no se puede volver a pagar, cancelar ni eliminar una clase con pago por confirmar', async () => {
      const [c1, c2] = await preparar()
      await registrarPago({ claseIds: [c1.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      for (const porConfirmar of [false, true]) {
        const r = await registrarPago({ claseIds: [c1.id, c2.id], fecha: HOY, porConfirmar, hoy: HOY }, db)
        expect(r.code).toBe('conflicto')
        expect(r.error).toContain('por confirmar')
      }
      expect((await cancelarClase(c1.id, db)).code).toBe('conflicto')
      expect((await eliminarClase(c1.id, db)).code).toBe('conflicto')
      expect(await contar('ingreso')).toBe(1)
      // La otra clase sigue libre.
      expect((await buscarClases({ sin_pago: true }, db)).filas.map(c => c.id)).toEqual([c2.id])
      expect((await cancelarClase(c2.id, db)).clase.estado).toBe('cancelada')
    })

    test('confirmarPago: pago, ingreso y clases cambian juntos; dos veces → conflicto', async () => {
      const [c1, c2] = await preparar()
      const { pago, ingreso } = await registrarPago({ claseIds: [c1.id, c2.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      expect(await confirmarPago(pago.id, db)).toMatchObject({ ok: true, pago_id: pago.id, ingreso_id: ingreso.id })
      expect((await db`SELECT estado FROM pago`)[0].estado).toBe('confirmado')
      expect((await db`SELECT estado FROM ingreso`)[0].estado).toBe('confirmado')
      expect((await db`SELECT DISTINCT cobro FROM clase`).map(x => x.cobro)).toEqual(['pagado'])
      expect(await resumenClases({}, db)).toMatchObject({ cobrado: 40000, pagos: 1, deuda_total: 0, por_confirmar_total: 0 })
      expect(await ingresosClasesCiclo('2026-11', db)).toMatchObject({ total: 40000, cantidad: 1 })
      expect((await confirmarPago(pago.id, db)).code).toBe('conflicto')
      expect((await confirmarPago(999, db)).code).toBe('no_encontrado')
      expect((await confirmarPago('x', db)).code).toBe('validacion')
    })

    test('descartar (deshacerPago) un pago por confirmar lo borra todo y libera las clases', async () => {
      const [c1] = await preparar()
      const { pago } = await registrarPago({ claseIds: [c1.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      expect((await deshacerPago(pago.id, db)).ok).toBe(true)
      expect(await contar('ingreso')).toBe(0)
      expect(await contar('pago')).toBe(0)
      expect((await buscarClases({ sin_pago: true }, db)).filas).toHaveLength(2)
      // Y se puede volver a registrar.
      expect((await registrarPago({ claseIds: [c1.id], fecha: HOY, hoy: HOY }, db)).pago.estado).toBe('confirmado')
    })

    test('confirmarPago rechaza si una clase cambió en el medio', async () => {
      const [c1] = await preparar()
      const { pago } = await registrarPago({ claseIds: [c1.id], fecha: HOY, porConfirmar: true, hoy: HOY }, db)
      await db`UPDATE clase SET estado = 'cancelada' WHERE id = ${c1.id}`
      expect((await confirmarPago(pago.id, db)).code).toBe('conflicto')
      expect((await db`SELECT estado FROM pago`)[0].estado).toBe('pendiente')
    })
  })

  test('dos pagos simultáneos de la misma clase: uno gana, el otro se rechaza', async () => {
    await alumno()
    const c = await claseDictada('Cristóbal Mena', '2026-10-01')
    const resultados = await Promise.all([
      registrarPago({ claseIds: [c.id], fecha: HOY, hoy: HOY }, db),
      registrarPago({ claseIds: [c.id], fecha: HOY, hoy: HOY }, db),
    ])
    expect(resultados.filter(r => r.pago)).toHaveLength(1)
    expect(resultados.filter(r => r.code === 'conflicto')).toHaveLength(1)
    expect(await contar('ingreso')).toBe(1)
  })

  test('deshacer pago: clases a pendiente y se borra el ingreso', async () => {
    await alumno()
    const c1 = await claseDictada('Cristóbal Mena', '2026-10-01')
    const c2 = await claseDictada('Cristóbal Mena', '2026-10-08')
    const { pago, ingreso } = await registrarPago({ claseIds: [c1.id, c2.id], fecha: HOY, hoy: HOY }, db)

    const r = await deshacerPago(pago.id, db)
    expect(r).toMatchObject({ ok: true, ingreso_eliminado: ingreso.id })
    expect(await contar('ingreso')).toBe(0)
    expect(await contar('pago_clase')).toBe(0)
    expect((await db`SELECT DISTINCT cobro FROM clase`).map(x => x.cobro)).toEqual(['pendiente'])
    expect((await deshacerPago(pago.id, db)).code).toBe('no_encontrado')
  })

  test('el ingreso de un pago de clases no se edita ni se borra por /api/ingresos', async () => {
    await alumno()
    const c = await claseDictada('Cristóbal Mena', '2026-10-01')
    const { ingreso } = await registrarPago({ claseIds: [c.id], fecha: HOY, hoy: HOY }, db)
    expect((await editarIngreso(ingreso.id, { monto: 1 }, db)).status).toBe(409)
    expect((await eliminarIngreso(ingreso.id, db)).status).toBe(409)
    // Y la FK lo protege también a nivel DB.
    expect(await falla(db`DELETE FROM ingreso WHERE id = ${ingreso.id}`)).toBe(true)
  })

  test('eliminar: cualquier clase sin cobrar; una pagada no hasta deshacer el pago', async () => {
    await alumno()
    const { clase: programada } = await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-20', hora_inicio: '19:00' }, db)
    expect(await eliminarClase(programada.id, db)).toEqual({ ok: true, id: programada.id })
    expect((await eliminarClase(programada.id, db)).code).toBe('no_encontrado')

    const dictada = await claseDictada('Cristóbal Mena', '2026-10-01')
    const { pago } = await registrarPago({ claseIds: [dictada.id], fecha: HOY, hoy: HOY }, db)
    expect((await eliminarClase(dictada.id, db)).code).toBe('conflicto')
    await deshacerPago(pago.id, db)
    expect((await eliminarClase(dictada.id, db)).ok).toBe(true)
    expect(await contar('clase')).toBe(0)
    // Sin notion_id no deja marca de import.
    expect(await contar('clase_import_descartada')).toBe(0)
  })

  test('cancelar: solo si no está pagada', async () => {
    await alumno()
    const c = await claseDictada('Cristóbal Mena', '2026-10-01')
    await registrarPago({ claseIds: [c.id], fecha: HOY, hoy: HOY }, db)
    expect((await cancelarClase(c.id, db)).code).toBe('conflicto')

    const otra = await claseDictada('Cristóbal Mena', '2026-10-02')
    expect((await cancelarClase(otra.id, db)).clase).toMatchObject({ estado: 'cancelada', cobro: 'pendiente' })
    expect((await cancelarClase(otra.id, db)).code).toBe('conflicto')
  })

  test('deuda = dictada + pendiente, con la impaga más vieja; no cuenta programadas, canceladas ni pagadas', async () => {
    await alumno('Cristóbal Mena')
    await alumno('Rafaela Moraga', 20000)
    const pagada = await claseDictada('Cristóbal Mena', '2026-09-20')
    await registrarPago({ claseIds: [pagada.id], fecha: '2026-09-25', hoy: HOY }, db)
    await claseDictada('Cristóbal Mena', '2026-10-01')
    await claseDictada('Cristóbal Mena', '2026-10-08', { duracion_minutos: 30 })
    await claseDictada('Rafaela Moraga', '2026-10-03')
    await agendarClase({ alumno: 'Cristóbal Mena', fecha: '2026-10-22', hora_inicio: '19:00' }, db)
    const { clase: cancelada } = await agendarClase({ alumno: 'Rafaela Moraga', fecha: '2026-10-05', hora_inicio: '19:00' }, db)
    await cancelarClase(cancelada.id, db)

    const r = await resumenClases({ desde: '2026-10-01', hasta: '2026-10-31' }, db)
    expect(r.deuda_por_alumno).toEqual([
      { alumno_id: 1, alumno: 'Cristóbal Mena', familia_id: null, familia: null, deuda: 37500, por_confirmar: 0, desde: '2026-10-01', clases: 2 },
      { alumno_id: 2, alumno: 'Rafaela Moraga', familia_id: null, familia: null, deuda: 20000, por_confirmar: 0, desde: '2026-10-03', clases: 1 },
    ])
    // Sin familias, cada alumno es su propia cuenta de cobro.
    expect(r.deuda_por_familia.map(c => [c.nombre, c.alumno_id, c.deuda])).toEqual([['Cristóbal Mena', 1, 37500], ['Rafaela Moraga', 2, 20000]])
    expect(r.deuda_total).toBe(57500)
    expect(r).toMatchObject({ horas_dictadas: 2.5, clases_dictadas: 3, monto_dictado: 57500, clases_programadas: 1, cobrado: 0 })
    // Cobrado por fecha de pago (septiembre), no por fecha de clase.
    expect((await resumenClases({ desde: '2026-09-01', hasta: '2026-09-30' }, db)).cobrado).toBe(25000)
  })

  test('familias: alta, apoderado, asignar hermanos, nombre único y borrado solo si está vacía', async () => {
    const c = await alumno('Cristobal Mena')
    const l = await alumno('Luciano Mena')
    const { familia } = await crearFamilia({ nombre: 'Mena', apoderado_nombre: 'Isabel', apoderado_telefono: '+56 9 8765 4321' }, db)
    expect(familia).toMatchObject({ nombre: 'Mena', apoderado_nombre: 'Isabel', alumnos: [] })
    expect((await crearFamilia({ nombre: 'mena' }, db)).code).toBe('conflicto')
    expect((await crearFamilia({ nombre: 'X', apoderado_telefono: 'abc' }, db)).code).toBe('validacion')

    await editarAlumno(c.id, { familia_id: familia.id }, db)
    const { alumno: lu } = await editarAlumno(l.id, { familia_id: familia.id }, db)
    expect(lu).toMatchObject({ familia_id: familia.id, familia: 'Mena', apoderado_nombre: 'Isabel' })
    expect((await listarFamilias(db))[0].alumnos.map(a => a.nombre)).toEqual(['Cristobal Mena', 'Luciano Mena'])
    expect((await listarAlumnos({}, db)).every(a => a.familia === 'Mena')).toBe(true)
    expect((await editarAlumno(l.id, { familia_id: 999 }, db)).code).toBe('no_encontrado')

    expect((await editarFamilia(familia.id, { apoderado_nombre: 'Isabel Pérez' }, db)).familia.apoderado_nombre).toBe('Isabel Pérez')
    expect((await eliminarFamilia(familia.id, db)).code).toBe('conflicto')
    await editarAlumno(c.id, { familia_id: null }, db)
    await editarAlumno(l.id, { familia_id: null }, db)
    expect((await eliminarFamilia(familia.id, db)).ok).toBe(true)
  })

  test('pago de familia: un pago e ingreso por clases de varios hermanos; no mezcla familias', async () => {
    const c = await alumno('Cristobal Mena', 20000)
    const l = await alumno('Luciano Mena', 20000)
    const otro = await alumno('Rafaela Moraga')
    const { familia } = await crearFamilia({ nombre: 'Mena', apoderado_nombre: 'Isabel' }, db)
    const { familia: otraFamilia } = await crearFamilia({ nombre: 'Moraga' }, db)
    await editarAlumno(c.id, { familia_id: familia.id }, db)
    await editarAlumno(l.id, { familia_id: familia.id }, db)
    await editarAlumno(otro.id, { familia_id: otraFamilia.id }, db)
    const c1 = await claseDictada('Cristobal Mena', '2026-10-04')
    const l1 = await claseDictada('Luciano Mena', '2026-10-06')
    const l2 = await claseDictada('Luciano Mena', '2026-10-08')
    const r1 = await claseDictada('Rafaela Moraga', '2026-10-05')

    const resumen = await resumenClases({}, db)
    const mena = resumen.deuda_por_familia.find(x => x.familia_id === familia.id)
    expect(mena).toMatchObject({ nombre: 'Familia Mena', apoderado_nombre: 'Isabel', deuda: 60000, desde: '2026-10-04', clases: 3 })
    expect(mena.alumnos.map(a => [a.alumno, a.deuda])).toEqual([['Cristobal Mena', 20000], ['Luciano Mena', 40000]])

    expect((await registrarPago({ claseIds: [c1.id, r1.id], fecha: HOY, hoy: HOY }, db)).code).toBe('validacion')
    const r = await registrarPago({ claseIds: [c1.id, l1.id, l2.id], fecha: HOY, monto: 60000, hoy: HOY }, db)
    expect(r.pago).toMatchObject({ alumno_id: null, familia_id: familia.id, cobrado_a: 'Familia Mena', monto: 60000 })
    expect(r.ingreso.nota).toBe('Familia Mena — Cristobal Mena: 2026-10-04; Luciano Mena: 2026-10-06, 2026-10-08')
    expect(await contar('ingreso')).toBe(1)
    const { pagos } = await listarPagos({ familia_id: familia.id }, db)
    expect(pagos[0]).toMatchObject({ cobrado_a: 'Familia Mena', clases: [{ alumno: 'Cristobal Mena' }, { alumno: 'Luciano Mena' }, { alumno: 'Luciano Mena' }] })
    expect((await buscarClases({ familia_id: familia.id }, db)).filas).toHaveLength(3)

    // Sin familia, dos alumnos distintos no se pagan juntos.
    await editarAlumno(otro.id, { familia_id: null }, db)
    const sinFamilia = await alumno('Baltazar Martinić')
    const b1 = await claseDictada('Baltazar Martinić', '2026-10-02')
    expect((await registrarPago({ claseIds: [b1.id, r1.id], fecha: HOY, hoy: HOY }, db)).code).toBe('validacion')
    expect(sinFamilia.familia_id).toBeNull()

    // Deshacer un pago de familia devuelve todo.
    await deshacerPago(r.pago.id, db)
    expect(await contar('ingreso')).toBe(0)
  })

  test('buscar clases filtra por alumno, rango, estado, cobro y actualizada_desde, con paginación', async () => {
    await alumno('Cristóbal Mena')
    await alumno('Luciano Mena')
    await alumno('Julieta Chinetti')
    await claseDictada('Cristóbal Mena', '2026-10-01')
    await claseDictada('Luciano Mena', '2026-10-02')
    await agendarClase({ alumno: 'Julieta Chinetti', fecha: '2026-11-02', hora_inicio: '19:00' }, db)

    expect((await buscarClases({ alumno: 'mena' }, db)).filas).toHaveLength(2)
    expect((await buscarClases({ desde: '2026-10-01', hasta: '2026-10-31' }, db)).filas).toHaveLength(2)
    expect((await buscarClases({ estado: 'programada' }, db)).filas.map(c => c.alumno)).toEqual(['Julieta Chinetti'])
    const pag = await buscarClases({ limite: 2 }, db)
    expect(pag.meta).toEqual({ total: 3, devueltos: 2, offset: 0, limite: 2, truncado: true })
    const futuro = new Date(Date.now() + 60_000).toISOString()
    expect((await buscarClases({ actualizada_desde: futuro }, db)).filas).toHaveLength(0)
    expect((await buscarClases({ estado: 'otra' }, db)).code).toBe('validacion')
  })
})
