import { describe, test, expect, mock, afterEach } from 'bun:test'
import { Hono } from 'hono'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMcpRouter } from './index.js'
import { depsPorDefecto } from './tools.js'
import { agregarFilas } from '../consultas/gastos.js'

// Dependencias inyectadas (mismo criterio que createIngestaRouter({ ia })):
// acá se prueba la capa MCP — auth, validación, forma de respuesta, defaults —
// sin escribir en la DB. El camino real a Postgres está en
// server/consultas/gastos.test.js y en el test de integración de abajo.

const TOKEN = 'mcp-test-token'
const AHORA = new Date(2026, 9, 6, 12, 0, 0) // 2026-10-06 local → ciclo 2026-10

const CATALOGOS = {
  bancos: ['Edwards', 'BICE', 'Efectivo'],
  tipos: ['Comida', 'Transporte'],
  contextos: ['Personal', 'Polola'],
  grupos: [{ id: 7, nombre: 'COMIDA', subcategorias: [{ id: 70, nombre: 'Restaurantes' }] }],
}

function resumenFalso(ciclo, gastado, extra = {}) {
  return {
    ciclo,
    rango: { desde: `${ciclo}-01`, hasta: `${ciclo}-28` },
    dia: 8,
    duracion: 30,
    ingresos: 0,
    previsto: 0,
    gastado,
    restante: -gastado,
    sin_clasificar: 0,
    semaforos: [],
    en_rojo: [],
    hay_presupuesto: false,
    ...extra,
  }
}

const deps = {
  cargarCatalogos: mock(async () => CATALOGOS),
  ejecutarCrearGasto: mock(async () => ({ gastoId: 'nuevo-id', estado: 'pendiente' })),
  obtenerGasto: mock(async () => ({ tipos: ['Comida'], contexto: '', ciclo_financiero: '2026-10' })),
  buscarGastos: mock(async ({ limite, offset }) => ({
    filas: [],
    meta: { total: 60, devueltos: limite, offset, limite, truncado: offset + limite < 60 },
  })),
  resumirGastos: mock(async ({ agrupar_por }) => agregarFilas([], { agrupar_por })),
  resumenCiclo: mock(async ({ ciclo }) => resumenFalso(ciclo, 1000)),
  ahora: () => AHORA,
}

afterEach(() => {
  for (const fn of Object.values(deps)) fn.mockClear?.()
})

function appCon({ token = TOKEN, d = deps } = {}) {
  const app = new Hono()
  app.route('/mcp', createMcpRouter({ token, deps: d }))
  return app
}

async function conectar(app = appCon(), bearer = TOKEN) {
  const client = new Client({ name: 'test', version: '0' })
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => app.fetch(new Request(url, init)),
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
  })
  await client.connect(transport)
  return client
}

async function llamar(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args })
  return JSON.parse(res.content[0].text)
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
}

function postCrudo(app, headers = {}) {
  return app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(INIT),
  })
}

describe('auth /mcp', () => {
  test('sin Bearer → 401 aunque NODE_ENV no sea production', async () => {
    expect(process.env.NODE_ENV).not.toBe('production')
    const res = await postCrudo(appCon())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'No autorizado', code: 'no_autorizado' })
  })

  test('Bearer incorrecto → 401', async () => {
    const res = await postCrudo(appCon(), { Authorization: 'Bearer otro-token' })
    expect(res.status).toBe(401)
  })

  test('sin MCP_TOKEN configurado → 401 incluso con un Bearer cualquiera', async () => {
    const app = appCon({ token: undefined })
    expect((await postCrudo(app, { Authorization: 'Bearer ' })).status).toBe(401)
    expect((await postCrudo(app, { Authorization: 'Bearer undefined' })).status).toBe(401)
  })

  test('no acepta otros tokens de la app', async () => {
    const res = await postCrudo(appCon({ token: TOKEN }), { Authorization: `Bearer ${process.env.INGESTA_TOKEN || 'x'}` })
    expect(res.status).toBe(401)
  })

  test('el gate global deja /mcp a cargo de su propio token', async () => {
    const { createAuthMiddleware } = await import('../auth.js')
    const app = new Hono()
    app.use('*', createAuthMiddleware('access-token'))
    app.route('/mcp', createMcpRouter({ token: TOKEN, deps }))
    const res = await app.request('/mcp?t=access-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(INIT),
    })
    expect(res.status).toBe(401)
  })

  test('GET → 405 (stateless, sin SSE)', async () => {
    const res = await appCon().request('/mcp', { headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(res.status).toBe(405)
  })
})

describe('descubrimiento', () => {
  test('expone exactamente las 6 tools, sin escrituras extra', async () => {
    const client = await conectar()
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'buscar_gastos', 'comparar_periodos', 'crear_gasto', 'listar_catalogos', 'resumen_presupuesto', 'resumir_gastos',
    ])
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object')
      expect(t.description.length).toBeGreaterThan(80)
      expect(t.annotations.readOnlyHint).toBe(t.name !== 'crear_gasto')
    }
    await client.close()
  })

  test('tool desconocida → no_encontrado', async () => {
    const client = await conectar()
    expect(await llamar(client, 'editar_gasto', { id: 'x' })).toMatchObject({ ok: false, code: 'no_encontrado' })
    await client.close()
  })
})

describe('crear_gasto', () => {
  const base = { fecha: '2026-10-06', motivo: 'Sushi', monto: 23500, usd: 0, banco: 'edwards' }

  test('éxito: banco canónico, origen mcp, estado pendiente', async () => {
    const client = await conectar()
    const r = await llamar(client, 'crear_gasto', { ...base, tipos: ['comida', 'Inventado'], contexto: 'nadie' })
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({
      id: 'nuevo-id', estado: 'pendiente', banco: 'Edwards', monto: 23500, usd: 0,
      ciclo_financiero: '2026-10', tipos: ['Comida'],
    })
    expect(r.data.mensaje).toContain('pendiente')
    expect(r.data.mensaje).not.toMatch(/quedó confirmado/i)
    expect(r.meta).toMatchObject({ origen: 'mcp', tipos_descartados: ['Inventado'], contexto_descartado: 'nadie' })

    const [catalogos, input, opciones] = deps.ejecutarCrearGasto.mock.calls[0]
    expect(catalogos).toBe(CATALOGOS)
    expect(input).toMatchObject({ banco: 'Edwards', tipos: ['Comida'], contexto: '', ignorar_duplicado: false })
    expect(opciones).toEqual({ origen: 'mcp' })
    await client.close()
  })

  test('banco inválido → validacion con la lista, sin insertar', async () => {
    const client = await conectar()
    const r = await llamar(client, 'crear_gasto', { ...base, banco: 'Transferencia' })
    expect(r).toMatchObject({ ok: false, code: 'validacion' })
    expect(r.error).toContain('Edwards, BICE, Efectivo')
    expect(deps.ejecutarCrearGasto).not.toHaveBeenCalled()
    await client.close()
  })

  test('monto y usd ambiguos: ambos > 0 o ambos 0', async () => {
    const client = await conectar()
    expect(await llamar(client, 'crear_gasto', { ...base, usd: 10 })).toMatchObject({ ok: false, code: 'validacion' })
    expect(await llamar(client, 'crear_gasto', { ...base, monto: 0 })).toMatchObject({ ok: false, code: 'validacion' })
    expect(deps.cargarCatalogos).not.toHaveBeenCalled()
    expect(deps.ejecutarCrearGasto).not.toHaveBeenCalled()
    await client.close()
  })

  test('solo USD es válido', async () => {
    const client = await conectar()
    const r = await llamar(client, 'crear_gasto', { ...base, monto: 0, usd: 12.5 })
    expect(r.ok).toBe(true)
    expect(deps.ejecutarCrearGasto.mock.calls[0][1]).toMatchObject({ monto: 0, usd: 12.5 })
    await client.close()
  })

  test('fecha futura, inexistente o campos fuera de contrato → validacion', async () => {
    const client = await conectar()
    expect(await llamar(client, 'crear_gasto', { ...base, fecha: '2026-10-07' })).toMatchObject({ ok: false, code: 'validacion' })
    expect(await llamar(client, 'crear_gasto', { ...base, fecha: '2026-02-30' })).toMatchObject({ ok: false, code: 'validacion' })
    expect(await llamar(client, 'crear_gasto', { ...base, motivo: '   ' })).toMatchObject({ ok: false, code: 'validacion' })
    for (const extra of [{ estado: 'confirmado' }, { grupo: 'COMIDA' }, { ciclo: '2026-10' }, { es_manual: true }]) {
      expect(await llamar(client, 'crear_gasto', { ...base, ...extra })).toMatchObject({ ok: false, code: 'validacion' })
    }
    expect(deps.ejecutarCrearGasto).not.toHaveBeenCalled()
    await client.close()
  })

  test('duplicado bloqueado → code duplicado con candidatos', async () => {
    deps.ejecutarCrearGasto.mockImplementationOnce(async () => ({
      bloqueado: true,
      candidatos: [{
        gastoId: 'viejo', fecha: '2026-10-05', motivo: 'Sushi', monto: 23500, usd: 0,
        banco: 'Edwards', estado: 'confirmado', origen: 'mail', confianza: 'alta', razon: 'x',
      }],
    }))
    const client = await conectar()
    const r = await llamar(client, 'crear_gasto', base)
    expect(r).toMatchObject({ ok: false, code: 'duplicado' })
    expect(r.data.candidatos).toEqual([{
      id: 'viejo', fecha: '2026-10-05', motivo: 'Sushi', monto: 23500, usd: 0, banco: 'Edwards', estado: 'confirmado',
    }])
    expect(deps.obtenerGasto).not.toHaveBeenCalled()
    await client.close()
  })

  test('error inesperado → interno, sin stack', async () => {
    deps.ejecutarCrearGasto.mockImplementationOnce(async () => { throw new Error('connection refused at 10.0.0.1') })
    const client = await conectar()
    const r = await llamar(client, 'crear_gasto', base)
    expect(r).toEqual({ ok: false, error: 'Error interno al ejecutar la tool', code: 'interno' })
    await client.close()
  })
})

describe('buscar_gastos', () => {
  test('defaults de paginación y meta.truncado', async () => {
    const client = await conectar()
    const r = await llamar(client, 'buscar_gastos', {})
    expect(r.meta).toEqual({ total: 60, devueltos: 20, offset: 0, limite: 20, truncado: true })
    expect(deps.buscarGastos.mock.calls[0][0]).toMatchObject({ orden: 'fecha_desc', limite: 20, offset: 0 })
    await client.close()
  })

  test('limite > 50, rangos invertidos y montos invertidos → validacion', async () => {
    const client = await conectar()
    expect(await llamar(client, 'buscar_gastos', { limite: 51 })).toMatchObject({ code: 'validacion' })
    expect(await llamar(client, 'buscar_gastos', { fecha_desde: '2026-10-05', fecha_hasta: '2026-10-01' })).toMatchObject({ code: 'validacion' })
    expect(await llamar(client, 'buscar_gastos', { monto_min: 10, monto_max: 5 })).toMatchObject({ code: 'validacion' })
    expect(await llamar(client, 'buscar_gastos', { ciclo: '2026-13' })).toMatchObject({ code: 'validacion' })
    expect(await llamar(client, 'buscar_gastos', { estado: 'descartado' })).toMatchObject({ code: 'validacion' })
    expect(deps.buscarGastos).not.toHaveBeenCalled()
    await client.close()
  })
})

describe('resumir_gastos', () => {
  test('USD puro fuera del total; porcentajes por grupo', async () => {
    const filas = [
      { incluido: true, monto: 10000, monto_ciclo: 10000, grupo: 'COMIDA', banco: 'Edwards' },
      { incluido: true, monto: 30000, monto_ciclo: 30000, grupo: 'TRANSPORTE', banco: 'BICE' },
      { incluido: false, monto: 0, usd: 80, monto_ciclo: 0, grupo: null, banco: 'Edwards' }, // USD puro
    ]
    deps.resumirGastos.mockImplementationOnce(async ({ agrupar_por }) => agregarFilas(filas, { agrupar_por }))
    const client = await conectar()
    const r = await llamar(client, 'resumir_gastos', { agrupar_por: 'grupo' })
    expect(r.data).toMatchObject({ total_ciclo: 40000, total_nominal: 40000, cantidad: 2, promedio: 20000, minimo: 10000, maximo: 30000 })
    expect(r.data.grupos).toEqual([
      { clave: 'TRANSPORTE', total_ciclo: 30000, cantidad: 1, porcentaje: 75 },
      { clave: 'COMIDA', total_ciclo: 10000, cantidad: 1, porcentaje: 25 },
    ])
    expect(r.meta).toMatchObject({ agrupar_por: 'grupo', truncado: false })
    await client.close()
  })

  test('agrupar_por motivo no existe', async () => {
    const client = await conectar()
    expect(await llamar(client, 'resumir_gastos', { agrupar_por: 'motivo' })).toMatchObject({ code: 'validacion' })
    await client.close()
  })
})

describe('comparar_periodos', () => {
  test('modo ciclos por defecto: anterior vs actual, total = gastado de resumenCiclo', async () => {
    deps.resumenCiclo.mockImplementation(async ({ ciclo }) => resumenFalso(ciclo, ciclo === '2026-10' ? 150000 : 100000))
    deps.resumirGastos.mockImplementation(async ({ ciclo }) => ({
      ...agregarFilas([], {}),
      cantidad: 3,
      grupos: [{ clave: 'COMIDA', total_ciclo: ciclo === '2026-10' ? 150000 : 100000, cantidad: 3 }],
    }))
    const client = await conectar()
    const r = await llamar(client, 'comparar_periodos', {})
    expect(r.data.a).toMatchObject({ etiqueta: '2026-09', total_ciclo: 100000, cantidad: 3 })
    expect(r.data.b).toMatchObject({ etiqueta: '2026-10', total_ciclo: 150000 })
    expect(r.data.diferencia_absoluta).toBe(50000)
    expect(r.data.diferencia_porcentual).toBe(50)
    expect(r.data.desglose).toEqual([{ clave: 'COMIDA', total_a: 100000, total_b: 150000, diferencia: 50000 }])
    deps.resumenCiclo.mockReset()
    deps.resumenCiclo.mockImplementation(async ({ ciclo }) => resumenFalso(ciclo, 1000))
    deps.resumirGastos.mockReset()
    deps.resumirGastos.mockImplementation(async ({ agrupar_por }) => agregarFilas([], { agrupar_por }))
    await client.close()
  })

  test('modo rangos: a en 0 → diferencia_porcentual null; requiere las 4 fechas', async () => {
    const client = await conectar()
    expect(await llamar(client, 'comparar_periodos', { modo: 'rangos', fecha_desde_a: '2026-09-01' })).toMatchObject({ code: 'validacion' })
    expect(await llamar(client, 'comparar_periodos', { ciclo_a: '2026-09', fecha_desde_a: '2026-09-01' })).toMatchObject({ code: 'validacion' })
    const r = await llamar(client, 'comparar_periodos', {
      modo: 'rangos',
      fecha_desde_a: '2026-09-01', fecha_hasta_a: '2026-09-30',
      fecha_desde_b: '2026-10-01', fecha_hasta_b: '2026-10-06',
      banco: 'BICE',
    })
    expect(r.ok).toBe(true)
    expect(r.data.diferencia_porcentual).toBeNull()
    expect(deps.resumirGastos.mock.calls[0][0]).toMatchObject({ fecha_desde: '2026-09-01', fecha_hasta: '2026-09-30', banco: 'BICE' })
    expect(deps.resumenCiclo).not.toHaveBeenCalled()
    await client.close()
  })
})

describe('resumen_presupuesto', () => {
  test('ciclo default = ciclo actual local; conserva hay_presupuesto=false', async () => {
    const client = await conectar()
    const r = await llamar(client, 'resumen_presupuesto', {})
    expect(deps.resumenCiclo.mock.calls[0][0]).toEqual({ ciclo: '2026-10' })
    expect(r.data).toMatchObject({ ciclo: '2026-10', hay_presupuesto: false, gastado: 1000, previsto: 0 })
    expect(r.meta).toEqual({ ciclo_default: true })
    await client.close()
  })

  test('día 29 ya es el ciclo siguiente', async () => {
    const client = await conectar(appCon({ d: { ...deps, ahora: () => new Date(2026, 9, 29, 9) } }))
    await llamar(client, 'resumen_presupuesto', {})
    expect(deps.resumenCiclo.mock.calls[0][0]).toEqual({ ciclo: '2026-11' })
    await client.close()
  })
})

describe('listar_catalogos', () => {
  test('solo nombres, sin ids internos', async () => {
    const client = await conectar()
    const r = await llamar(client, 'listar_catalogos')
    expect(r.data).toEqual({
      bancos: ['Edwards', 'BICE', 'Efectivo'],
      tipos: ['Comida', 'Transporte'],
      contextos: ['Personal', 'Polola'],
      grupos: [{ nombre: 'COMIDA', subcategorias: ['Restaurantes'] }],
    })
    await client.close()
  })
})

// ─── Integración con la DB real: mismo camino de insert que el chat ─────────

describe('crear_gasto contra Postgres', () => {
  test('inserta por ejecutarCrearGasto con origen mcp y bloquea el duplicado', async () => {
    const { default: sql } = await import('../db/client.js')
    const [banco] = await sql`SELECT nombre FROM catalogo_banco ORDER BY orden LIMIT 1`
    if (!banco) return // catálogo vacío: nada que probar
    // Limpia residuos de corridas cortadas: buscarSimilares los vería como duplicados.
    await sql`DELETE FROM gastos WHERE motivo LIKE 'Test MCP crear %' AND fecha LIKE '2099-%'`
    const motivo = `Test MCP crear ${crypto.randomUUID().slice(0, 8)}`
    const monto = 10000 + Math.floor(Math.random() * 80000)
    const real = { ...depsPorDefecto, ahora: () => new Date(2099, 11, 31, 12) }
    const client = await conectar(appCon({ d: real }))
    try {
      const args = { fecha: '2099-07-10', motivo, monto, banco: banco.nombre.toUpperCase() }
      const r = await llamar(client, 'crear_gasto', args)
      expect(r.ok).toBe(true)
      expect(r.data.ciclo_financiero).toBe('2099-07')
      const [fila] = await sql`SELECT estado, origen, es_manual, banco FROM gastos WHERE id = ${r.data.id}`
      expect(fila).toEqual({ estado: 'pendiente', origen: 'mcp', es_manual: false, banco: banco.nombre })

      const dup = await llamar(client, 'crear_gasto', args)
      expect(dup.code).toBe('duplicado')
      expect(dup.data.candidatos.map(c => c.id)).toContain(r.data.id)
      const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM gastos WHERE motivo = ${motivo}`
      expect(n).toBe(1)
    } finally {
      await sql`DELETE FROM gastos WHERE motivo = ${motivo}`
      await client.close()
    }
  }, 30000)
})
