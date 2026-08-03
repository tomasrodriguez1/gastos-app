import { Hono } from 'hono'
import sql from './db/client.js'
import { verifyIngestaToken } from './auth.js'
import { parseEdwardsCompra } from './ingesta/parseEdwardsCompra.js'
import * as groqDefault from './ingesta/groq.js'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../src/utils/ciclos.js'

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

async function cargarCatalogos() {
  const [tipos, contextos] = await Promise.all([
    sql`SELECT nombre FROM catalogo_tipo ORDER BY orden`,
    sql`SELECT nombre FROM catalogo_contexto ORDER BY orden`,
  ])
  return { tipos: tipos.map(t => t.nombre), contextos: contextos.map(c => c.nombre) }
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

  const mes = obtenerMesCalendario(fecha)
  const cicloFinanciero = obtenerCicloFinanciero(fecha)

  let tipos = []
  let contexto = ''
  if (estado === 'pendiente') {
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

  const gastoId = crypto.randomUUID()
  await sql`
    INSERT INTO gastos (
      id, fecha, mes, ciclo_financiero, motivo, banco, tipos, contexto,
      monto, monto_real, usd, es_manual, estado, origen, fuente_id, payload_raw, updated_at
    ) VALUES (
      ${gastoId}, ${fecha}, ${mes}, ${cicloFinanciero}, ${motivo}, ${banco}, ${tipos}, ${contexto},
      ${monto}, ${monto}, ${usd}, false, ${estado}, 'mail', ${id}, ${msg}, NOW()
    )
  `

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
