import { Hono } from 'hono'
import sql from './db/client.js'
import { verifyIngestaToken } from './auth.js'
import { parseEdwardsCompra } from './ingesta/parseEdwardsCompra.js'
import * as groqDefault from './ingesta/groq.js'
import { obtenerCicloFinanciero } from '../src/utils/ciclos.js'
import { cargarCatalogos } from './catalogos.js'
import { buscarComercio } from './comercios.js'
import { crearGastoPendiente } from './gastos/crear.js'

const BANCOS_POR_DOMINIO = [{ dominio: 'bancoedwards.cl', banco: 'Edwards' }]

function detectarBanco(from) {
  if (!from) return ''
  const match = BANCOS_POR_DOMINIO.find(b => from.toLowerCase().includes(b.dominio))
  return match?.banco || ''
}

function fechaDesdeInternalDate(internalDate) {
  const ms = Number(internalDate)
  if (!Number.isFinite(ms)) return new Date().toISOString().slice(0, 10)
  return new Date(ms).toISOString().slice(0, 10)
}

async function procesarMensaje(msg, catalogos, ia) {
  const { id, snippet, From, Subject, internalDate } = msg || {}
  if (!id) return { ok: false, error: 'Falta id' }

  const existente = await sql`SELECT id, estado FROM gastos WHERE fuente_id = ${id} LIMIT 1`
  if (existente.length > 0) {
    return { id, ok: true, duplicado: true, gastoId: existente[0].id, estado: existente[0].estado }
  }

  const banco = detectarBanco(From)

  let campos = Subject === 'Compra con Tarjeta de Crédito' ? parseEdwardsCompra(snippet) : null
  if (!campos) campos = await ia.extraerCampos(snippet)

  let estado = 'pendiente'
  let fecha, motivo, monto, usd
  if (campos) {
    ;({ fecha, motivo, monto = 0, usd = 0 } = campos)
    try {
      obtenerCicloFinanciero(fecha)
    } catch {
      estado = 'error_parseo'
    }
  } else {
    estado = 'error_parseo'
  }

  if (estado === 'error_parseo') {
    fecha = fechaDesdeInternalDate(internalDate)
    motivo = motivo || Subject || 'Sin asunto'
    monto = 0
    usd = 0
  }

  // Cascada de clasificación: memoria de comercios (gratis, instantánea) antes
  // que el LLM. Solo se intenta si el gasto va a quedar pendiente de revisión
  // — un error_parseo no tiene motivo confiable para buscar ni clasificar.
  let tipos = []
  let contexto = ''
  let presupuestoManual = null
  if (estado === 'pendiente') {
    const memoria = await buscarComercio(motivo)
    if (memoria) {
      tipos = memoria.tipos
      contexto = memoria.contexto
      presupuestoManual = memoria.presupuesto_manual
    } else {
      const clasificacion = await ia.clasificarGasto({
        motivo,
        banco,
        tiposDisponibles: catalogos.tipos,
        contextosDisponibles: catalogos.contextos,
      })
      if (clasificacion) {
        tipos = clasificacion.tipos
        contexto = clasificacion.contexto
      }
    }
  }

  const { gastoId } = await crearGastoPendiente({
    fecha,
    motivo,
    monto,
    usd,
    banco,
    tipos,
    contexto,
    presupuesto_manual: presupuestoManual,
    estado,
    origen: 'mail',
    fuente_id: id,
    payload_raw: msg,
  })

  return { id, ok: true, gastoId, estado }
}

// `ia` es inyectable para poder testear la orquestación del endpoint sin llamar a Groq
// de verdad — ver server/ingesta.test.js. En producción siempre usa el módulo real.
export function createIngestaRouter({ ia = groqDefault } = {}) {
  const router = new Hono()

  router.post('/', async (c) => {
    const authHeader = c.req.header('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!verifyIngestaToken(token)) return c.json({ error: 'No autorizado' }, 401)

    let body
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Body inválido' }, 400)
    }

    // n8n con "Specify Body: Using Fields Below" envuelve el mensaje en un campo
    // (p.ej. { json: {...} }) — se desenvuelve acá para no depender de cómo esté
    // armado el nodo HTTP Request.
    const mensajes = (Array.isArray(body) ? body : [body]).map(m => m?.json ?? m)
    const catalogos = await cargarCatalogos()

    const resultados = []
    for (const msg of mensajes) {
      try {
        resultados.push(await procesarMensaje(msg, catalogos, ia))
      } catch (error) {
        resultados.push({ id: msg?.id ?? null, ok: false, error: error.message })
      }
    }

    return c.json({ ok: true, resultados })
  })

  return router
}

export const ingestaRouter = createIngestaRouter()
