import { describe, expect, test } from 'bun:test'
import { cierreDelPeriodo, crearResumenTarjeta, createTarjetaRouter, facturado, importeEnUnidades, monedaGasto } from './tarjeta'

const gasto = (overrides = {}) => ({
  id: crypto.randomUUID(),
  banco: 'Edwards',
  monto: 1000,
  usd: 0,
  split: 0,
  pagado: false,
  conciliado: false,
  plata_en_cuenta: false,
  estado: 'confirmado',
  tipos: [],
  ...overrides,
})

describe('resumen de tarjeta', () => {
  test('separa CLP y USD y mantiene la partición del fondo', () => {
    const resumen = crearResumenTarjeta([
      gasto({ monto: 1000, plata_en_cuenta: true, split: 200 }),
      gasto({ monto: 500, conciliado: true }),
      gasto({ monto: 0, usd: 12.34, banco: 'BICE' }),
      gasto({ monto: 9999, estado: 'descartado' }),
      gasto({ monto: 9999, banco: 'Otro' }),
    ])

    expect(resumen.totales.CLP.por_pagar).toBe(1500)
    expect(resumen.totales.CLP.fondo_actual).toBe(1000)
    expect(resumen.totales.CLP.falta_depositar).toBe(500)
    expect(resumen.totales.CLP.gasto_propio_neto).toBe(1300)
    expect(resumen.totales.CLP.conciliados).toBe(1)
    expect(resumen.totales.USD.por_pagar).toBe(12.34)
    expect(resumen.totales.USD.por_cobrar).toBe(0)
  })

  test('clasifica mediante override manual y deja el resto en SIN CLASIFICAR', () => {
    const resumen = crearResumenTarjeta([
      gasto({ presupuesto_manual: { grupo: 'COMIDA', subcategoria: 'Restaurantes' } }),
      gasto({ monto: 250 }),
    ])
    expect(resumen.totales.CLP.categorias.map(c => c.grupo).sort()).toEqual(['COMIDA', 'SIN CLASIFICAR'])
  })

  test('normaliza importes a unidades enteras por moneda', () => {
    expect(monedaGasto(gasto({ monto: 0, usd: 10.129 }))).toBe('USD')
    expect(importeEnUnidades(gasto({ monto: 0, usd: 10.129 }), 'USD')).toBe(1013)
    expect(importeEnUnidades(gasto({ monto: 1000.4 }), 'CLP')).toBe(1000)
  })

  test('separa facturado/no facturado según el ciclo configurado por banco', () => {
    // dia_cierre = 1: el día 1 del mes anterior ya cerró (facturado); el día 1
    // del mes siguiente todavía no llega (no facturado) — robusto sin importar
    // en qué día del mes corra el test.
    const hoy = new Date()
    const primerDia = fecha => `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-01`
    const mesAnterior = primerDia(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1)))
    const mesSiguiente = primerDia(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1)))

    const resumen = crearResumenTarjeta([
      gasto({ fecha: mesAnterior }), // cierre ya pasado -> facturado
      gasto({ fecha: mesSiguiente }), // cierre todavía no llega -> no facturado
      gasto({ fecha: mesAnterior, banco: 'BICE' }), // BICE sin ciclo configurado
    ], [], { Edwards: 1 })

    const edwards = resumen.bancos.find(b => b.banco === 'Edwards').monedas.CLP
    expect(edwards.facturados).toBe(1)
    expect(edwards.no_facturados).toBe(1)
    expect(edwards.monto_facturado).toBe(1000)
    expect(edwards.monto_no_facturado).toBe(1000)

    const bice = resumen.bancos.find(b => b.banco === 'BICE').monedas.CLP
    expect(bice.facturados).toBe(0)
    expect(bice.no_facturados).toBe(0)
  })
})

describe('ciclo de facturación', () => {
  test('cierreDelPeriodo cae en el mismo mes si la fecha es antes o igual al día de cierre', () => {
    expect(cierreDelPeriodo('2026-03-10', 15)).toBe('2026-03-15')
    expect(cierreDelPeriodo('2026-03-15', 15)).toBe('2026-03-15')
  })

  test('cierreDelPeriodo cae en el mes siguiente si la fecha es posterior al día de cierre', () => {
    expect(cierreDelPeriodo('2026-03-20', 15)).toBe('2026-04-15')
  })

  test('cierreDelPeriodo hace rollover de año en diciembre', () => {
    expect(cierreDelPeriodo('2026-12-20', 15)).toBe('2027-01-15')
  })

  test('facturado compara el cierre del período contra la fecha de hoy', () => {
    expect(facturado('2026-03-10', 15, '2026-03-20')).toBe(true) // cierre 03-15 ya pasó
    expect(facturado('2026-03-20', 15, '2026-03-25')).toBe(false) // cierre 04-15 no ha llegado
    expect(facturado('2026-03-20', 15, '2026-04-15')).toBe(true) // cierre 04-15 ya llegó
  })

  test('sin día de cierre configurado devuelve null', () => {
    expect(facturado('2026-03-10', undefined)).toBeNull()
    expect(facturado('2026-03-10', null)).toBeNull()
  })
})

function dbCiclosFalsa(filasIniciales = []) {
  const filas = filasIniciales.map(fila => ({ ...fila }))
  const db = async (strings, ...values) => {
    const consulta = strings.join('?')
    if (consulta.includes('SELECT banco, dia_cierre FROM tarjeta_ciclo')) return filas
    if (consulta.includes('INSERT INTO tarjeta_ciclo')) {
      const [banco, diaCierre] = values
      const existente = filas.find(f => f.banco === banco)
      if (existente) existente.dia_cierre = diaCierre
      else filas.push({ banco, dia_cierre: diaCierre })
      return []
    }
    throw new Error(`Consulta no contemplada en test: ${consulta}`)
  }
  return { db, filas }
}

function put(router, ruta, body) {
  return router.request(ruta, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('endpoints de ciclo de facturación', () => {
  test('GET /ciclos devuelve los bancos configurados', async () => {
    const { db } = dbCiclosFalsa([{ banco: 'Edwards', dia_cierre: 15 }])
    const router = createTarjetaRouter({ db })
    const respuesta = await router.request('/ciclos')
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual([{ banco: 'Edwards', dia_cierre: 15 }])
  })

  test('PUT /ciclos/:banco hace upsert del día de cierre', async () => {
    const { db, filas } = dbCiclosFalsa()
    const router = createTarjetaRouter({ db })
    const respuesta = await put(router, '/ciclos/Edwards', { dia_cierre: 20 })
    expect(respuesta.status).toBe(200)
    expect(filas).toEqual([{ banco: 'Edwards', dia_cierre: 20 }])
  })

  test('PUT /ciclos/:banco rechaza banco o día de cierre inválidos', async () => {
    const { db } = dbCiclosFalsa()
    const router = createTarjetaRouter({ db })
    expect((await put(router, '/ciclos/Otro', { dia_cierre: 15 })).status).toBe(400)
    expect((await put(router, '/ciclos/Edwards', { dia_cierre: 29 })).status).toBe(400)
    expect((await put(router, '/ciclos/Edwards', { dia_cierre: 0 })).status).toBe(400)
  })
})

function dbFalsa(filasIniciales) {
  const filas = filasIniciales.map(fila => ({ ...fila }))
  const db = async (strings, ...values) => {
    const consulta = strings.join('?')
    if (consulta.includes('FROM regla_mapeo')) return []
    if (consulta.includes("banco IN ('Edwards', 'BICE')")) return filas
    if (consulta.includes('SELECT * FROM gastos WHERE id = ANY')) {
      return filas.filter(fila => values[0].includes(fila.id))
    }
    if (consulta.includes('SET conciliado = TRUE')) {
      filas.filter(fila => values[0].includes(fila.id)).forEach(fila => { fila.conciliado = true })
      return []
    }
    if (consulta.includes('SET conciliado = FALSE')) {
      filas.filter(fila => values[0].includes(fila.id)).forEach(fila => { fila.conciliado = false })
      return []
    }
    if (consulta.includes('SET pagado = TRUE')) {
      filas.filter(fila => values[0].includes(fila.id)).forEach(fila => { fila.pagado = true })
      return []
    }
    throw new Error(`Consulta no contemplada en test: ${consulta}`)
  }
  db.begin = callback => callback(db)
  return { db, filas }
}

function post(router, ruta, body) {
  return router.request(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('operaciones transaccionales de tarjeta', () => {
  test('un descuadre responde 409 y no concilia', async () => {
    const { db, filas } = dbFalsa([gasto({ id: 'g-1', monto: 1000 })])
    const router = createTarjetaRouter({ db })
    const respuesta = await post(router, '/conciliar', {
      banco: 'Edwards', moneda: 'CLP', total_estado: 900, gasto_ids: ['g-1'],
    })
    expect(respuesta.status).toBe(409)
    expect((await respuesta.json()).diferencia).toBe(-100)
    expect(filas[0].conciliado).toBe(false)
  })

  test('concilia y luego paga el mismo conjunto si ambos totales cuadran', async () => {
    const { db, filas } = dbFalsa([
      gasto({ id: 'g-1', monto: 1000 }),
      gasto({ id: 'g-2', monto: 500 }),
    ])
    const router = createTarjetaRouter({ db })
    const base = { banco: 'Edwards', moneda: 'CLP', gasto_ids: ['g-1', 'g-2'] }
    expect((await post(router, '/conciliar', { ...base, total_estado: 1500 })).status).toBe(200)
    expect(filas.every(fila => fila.conciliado)).toBe(true)
    expect((await post(router, '/pagar', { ...base, total_pagado: 1500 })).status).toBe(200)
    expect(filas.every(fila => fila.pagado)).toBe(true)
  })

  test('rechaza pagar sin conciliación previa y desconciliar un movimiento pagado', async () => {
    const { db } = dbFalsa([gasto({ id: 'g-1', monto: 1000 })])
    const router = createTarjetaRouter({ db })
    const base = { banco: 'Edwards', moneda: 'CLP', gasto_ids: ['g-1'] }
    expect((await post(router, '/pagar', { ...base, total_pagado: 1000 })).status).toBe(409)

    const pagado = dbFalsa([gasto({ id: 'g-2', conciliado: true, pagado: true })])
    const routerPagado = createTarjetaRouter({ db: pagado.db })
    expect((await post(routerPagado, '/desconciliar', { banco: 'Edwards', moneda: 'CLP', gasto_ids: ['g-2'] })).status).toBe(409)
  })
})
