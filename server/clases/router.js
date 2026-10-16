// /api/clases — UI de /clases, detrás del gate global (passkey / ACCESS_TOKEN). Capa fina sobre
// server/clases/clases.js. A diferencia de las tools MCP, acá sí se puede deshacer un pago.

import { Hono } from 'hono'
import sql from '../db/client.js'
import {
  listarAlumnos, crearAlumno, editarAlumno, listarFamilias, crearFamilia, editarFamilia, eliminarFamilia,
  buscarClases, agendarClase, moverClase, marcarDictada, cancelarClase, eliminarClase,
  registrarPago, confirmarPago, deshacerPago, listarPagos, resumenClases, ingresosClasesCiclo, clasesParaAnalisis,
} from './clases.js'
import { obtenerCicloActual } from '../../src/utils/ciclos.js'

function responder(c, resultado, clave, status = 200) {
  if (resultado.error) return c.json({ error: resultado.error, code: resultado.code }, resultado.status)
  return c.json(clave ? resultado[clave] : resultado, status)
}

async function cuerpo(c) {
  return c.req.json().catch(() => ({}))
}

export function createClasesRouter({ db = sql } = {}) {
  const router = new Hono()

  router.get('/alumnos', async (c) => c.json(await listarAlumnos({}, db)))

  router.post('/alumnos', async (c) => {
    const r = await crearAlumno(await cuerpo(c), db)
    if (r.error) return responder(c, r)
    if (r.existente) return c.json({ error: `Ya existe un alumno llamado "${r.alumno.nombre}"`, code: 'conflicto' }, 409)
    return c.json(r.alumno, 201)
  })

  router.patch('/alumnos/:id', async (c) => responder(c, await editarAlumno(c.req.param('id'), await cuerpo(c), db), 'alumno'))

  router.get('/analisis', async (c) => c.json({ clases: await clasesParaAnalisis(db) }))
  router.get('/familias', async (c) => c.json(await listarFamilias(db)))
  router.post('/familias', async (c) => responder(c, await crearFamilia(await cuerpo(c), db), 'familia', 201))
  router.patch('/familias/:id', async (c) => responder(c, await editarFamilia(c.req.param('id'), await cuerpo(c), db), 'familia'))
  router.delete('/familias/:id', async (c) => responder(c, await eliminarFamilia(c.req.param('id'), db)))

  router.get('/', async (c) => {
    const q = c.req.query()
    return responder(c, await buscarClases({
      alumno_id: q.alumno_id || undefined,
      familia_id: q.familia_id || undefined,
      desde: q.desde || undefined,
      hasta: q.hasta || undefined,
      estado: q.estado || undefined,
      sin_pago: q.sin_pago === '1',
      cobro: q.cobro || undefined,
      limite: q.limite ? Number(q.limite) : 1000,
      offset: q.offset ? Number(q.offset) : 0,
    }, db))
  })

  router.post('/', async (c) => responder(c, await agendarClase(await cuerpo(c), db), 'clase', 201))
  router.patch('/:id', async (c) => responder(c, await moverClase(c.req.param('id'), await cuerpo(c), db), 'clase'))
  router.post('/:id/dictada', async (c) => responder(c, await marcarDictada(c.req.param('id'), db), 'clase'))
  router.delete('/:id', async (c) => responder(c, await eliminarClase(c.req.param('id'), db)))
  router.post('/:id/cancelar', async (c) => responder(c, await cancelarClase(c.req.param('id'), db), 'clase'))

  router.get('/resumen', async (c) => {
    const q = c.req.query()
    const resumen = await resumenClases({ desde: q.desde || undefined, hasta: q.hasta || undefined }, db)
    if (resumen.error) return responder(c, resumen)
    const ingresos = await ingresosClasesCiclo(q.ciclo || obtenerCicloActual(), db)
    if (ingresos.error) return responder(c, ingresos)
    return c.json({ ...resumen, ingresos_ciclo: ingresos })
  })

  router.get('/pagos', async (c) => {
    const q = c.req.query()
    return responder(c, await listarPagos({
      alumno_id: q.alumno_id || undefined,
      familia_id: q.familia_id || undefined,
      desde: q.desde || undefined,
      hasta: q.hasta || undefined,
      limite: q.limite ? Number(q.limite) : 50,
    }, db), 'pagos')
  })

  router.post('/pagos', async (c) => {
    const body = await cuerpo(c)
    return responder(c, await registrarPago({ claseIds: body.clase_ids, fecha: body.fecha, monto: body.monto }, db), null, 201)
  })

  router.post('/pagos/:id/confirmar', async (c) => responder(c, await confirmarPago(c.req.param('id'), db)))
  router.delete('/pagos/:id', async (c) => responder(c, await deshacerPago(c.req.param('id'), db)))

  return router
}

export const clasesRouter = createClasesRouter()
