// /api/ingresos — UI de /ingresos, /presupuesto y Dashboard, detrás del gate global. Capa fina
// sobre server/ingresos.js (CRUD y catálogo) y server/ingresosCiclo.js (aprobar, resumen).

import { Hono } from 'hono'
import sql from '../db/client.js'
import {
  buscarIngresosSimilares, crearFuente, crearIngreso, editarFuente, editarIngreso, eliminarIngreso,
  listarFuentes, listarIngresos,
} from '../ingresos.js'
import { aprobarIngreso, descartarPendiente, listarPendientes, resumenIngresosCiclo } from '../ingresosCiclo.js'

function responder(c, resultado, clave, status = 200) {
  if (resultado.error) return c.json({ error: resultado.error, code: resultado.code }, resultado.status)
  return c.json(clave ? resultado[clave] : resultado, status)
}

const cuerpo = (c) => c.req.json().catch(() => ({}))

export function createIngresoRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/', async (c) => {
    const q = c.req.query()
    return c.json(await listarIngresos({ ciclo: q.ciclo || undefined, estado: q.estado || undefined }, db))
  })
  router.get('/pendientes', async (c) => c.json(await listarPendientes(db)))
  router.get('/resumen', async (c) => responder(c, await resumenIngresosCiclo(c.req.query('ciclo') || undefined, {}, db)))
  router.get('/similares', async (c) => {
    const q = c.req.query()
    return c.json(await buscarIngresosSimilares({ fuente: q.fuente, monto: q.monto, fecha: q.fecha }, db))
  })

  router.get('/fuentes', async (c) => c.json(await listarFuentes({}, db)))
  router.post('/fuentes', async (c) => responder(c, await crearFuente(await cuerpo(c), db), 'fuente', 201))
  router.patch('/fuentes/:id', async (c) => responder(c, await editarFuente(c.req.param('id'), await cuerpo(c), db), 'fuente'))

  router.post('/', async (c) => {
    // Desde la UI siempre es manual y confirmado: 'chat'/'mcp' (pendientes) los ponen la IA y
    // 'clases' un pago de clases. Se toman campos explícitos, no el body entero.
    const { fecha, fuente, monto, nota, fondo } = await cuerpo(c)
    return responder(c, await crearIngreso({ fecha, fuente, monto, nota, fondo, origen: 'manual' }, db), 'ingreso', 201)
  })
  router.patch('/:id', async (c) => responder(c, await editarIngreso(c.req.param('id'), await cuerpo(c), db), 'ingreso'))
  router.delete('/:id', async (c) => responder(c, await eliminarIngreso(c.req.param('id'), db)))
  router.post('/:id/confirmar', async (c) => responder(c, await aprobarIngreso(c.req.param('id'), db)))
  router.post('/:id/descartar', async (c) => responder(c, await descartarPendiente(c.req.param('id'), db)))

  return router
}

export const ingresoRouter = createIngresoRouter()
