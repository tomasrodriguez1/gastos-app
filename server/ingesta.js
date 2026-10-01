import { Hono } from 'hono'
import sql from './db/client.js'
import { verifyIngestaToken } from './auth.js'
import { parseEdwardsCompra } from './ingesta/parseEdwardsCompra.js'
import * as groqDefault from './ingesta/groq.js'
import { clasificarConAgente as clasificarConAgenteDefault } from './ingesta/agente.js'
import { obtenerCicloFinanciero } from '../src/utils/ciclos.js'
import { cargarCatalogos } from './catalogos.js'
import { buscarComercio } from './comercios.js'
import { crearGastoPendiente } from './gastos/crear.js'
import { normalizarComercio } from '../src/utils/comercio.js'

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

  // Cascada de clasificación, solo si el gasto va a quedar pendiente — un
  // error_parseo no tiene motivo confiable.
  let tipos = []
  let contexto = ''
  let presupuestoManual = null
  if (estado === 'pendiente') {
    ;({ tipos, contexto, presupuestoManual } = await clasificarGastoIngesta({
      motivo, banco, monto, usd, fecha, catalogos, ia,
    }))
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

// Memoria primero (gratis). Si el comercio es nuevo, clasifica el modelo del
// agente; si no hay key, falla o devuelve vacío, Groq. Si tampoco hay
// clasificación, el gasto entra igual, sin tipos.
async function clasificarGastoIngesta({ motivo, banco, monto, usd = 0, fecha, catalogos, ia }) {
  const memoria = await buscarComercio(motivo)
  if (memoria) {
    return {
      tipos: memoria.tipos,
      contexto: memoria.contexto,
      presupuestoManual: memoria.presupuesto_manual,
    }
  }

  const clasificacionAgente = ia.clasificarConAgente
    ? await ia.clasificarConAgente({ motivo, banco, monto, usd, fecha, catalogos })
    : null
  const clasificacion = clasificacionAgente || await ia.clasificarGasto({
    motivo,
    banco,
    tiposDisponibles: catalogos.tipos,
    contextosDisponibles: catalogos.contextos,
  })

  return {
    tipos: clasificacion?.tipos || [],
    contexto: clasificacion?.contexto || '',
    presupuestoManual: null,
  }
}

const BANCO_TELEFONO = 'BICE'

function fechaHoyChile(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(ahora)
}

function parseMontoClp(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw)
  if (typeof raw !== 'string') return null
  const limpio = raw.trim().replace(/[^\d.,]/g, '')
  if (!limpio) return null
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(/\./g, '')
  const valor = Number(normalizado)
  if (!Number.isFinite(valor) || valor <= 0) return null
  return Math.round(valor)
}

// Atajos (iOS) manda el JSON del modelo on-device en un campo `data`, a veces
// como objeto y a veces como texto. También se acepta comercio/monto en la raíz.
function leerCompraTelefono(body) {
  let payload = body?.json ?? body
  let data = payload?.data ?? payload
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const comercio = typeof data.comercio === 'string' ? data.comercio.trim() : ''
  const monto = parseMontoClp(data.monto)
  if (!comercio || monto == null) return null
  return { comercio, monto }
}

function fuenteIdTelefono({ fecha, comercio, monto }) {
  const clave = normalizarComercio(comercio) || comercio.trim().toLowerCase()
  return `telefono:${BANCO_TELEFONO}:${fecha}:${clave}:${monto}`
}

async function procesarTelefono(body, catalogos, ia) {
  const compra = leerCompraTelefono(body)
  if (!compra) return { ok: false, error: 'Faltan comercio o monto', status: 400 }

  const fecha = fechaHoyChile()
  const banco = BANCO_TELEFONO
  const fuenteId = fuenteIdTelefono({ fecha, comercio: compra.comercio, monto: compra.monto })

  const existente = await sql`SELECT id, estado FROM gastos WHERE fuente_id = ${fuenteId} LIMIT 1`
  if (existente.length > 0) {
    return {
      ok: true,
      duplicado: true,
      gastoId: existente[0].id,
      estado: existente[0].estado,
      fuente_id: fuenteId,
    }
  }

  const { tipos, contexto, presupuestoManual } = await clasificarGastoIngesta({
    motivo: compra.comercio,
    banco,
    monto: compra.monto,
    fecha,
    catalogos,
    ia,
  })

  const { gastoId } = await crearGastoPendiente({
    fecha,
    motivo: compra.comercio,
    monto: compra.monto,
    usd: 0,
    banco,
    tipos,
    contexto,
    presupuesto_manual: presupuestoManual,
    estado: 'pendiente',
    origen: 'telefono',
    fuente_id: fuenteId,
    payload_raw: body,
  })

  return { ok: true, gastoId, estado: 'pendiente', duplicado: false, fuente_id: fuenteId }
}

const iaDefault = {
  extraerCampos: groqDefault.extraerCampos,
  clasificarGasto: groqDefault.clasificarGasto,
  clasificarConAgente: clasificarConAgenteDefault,
}

// `ia` es inyectable para poder testear la orquestación del endpoint sin llamar
// a OpenAI ni a Groq de verdad — ver server/ingesta.test.js. En producción
// siempre usa el módulo real.
function tokenIngesta(c) {
  const authHeader = c.req.header('Authorization') || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
}

export function createIngestaRouter({ ia = iaDefault } = {}) {
  const router = new Hono()

  router.post('/telefono', async (c) => {
    if (!verifyIngestaToken(tokenIngesta(c))) return c.json({ error: 'No autorizado' }, 401)

    let body
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Body inválido' }, 400)
    }

    try {
      const catalogos = await cargarCatalogos()
      const { status = 200, ...respuesta } = await procesarTelefono(body, catalogos, ia)
      return c.json(respuesta, status)
    } catch (error) {
      return c.json({ ok: false, error: error.message }, 500)
    }
  })

  router.post('/', async (c) => {
    if (!verifyIngestaToken(tokenIngesta(c))) return c.json({ error: 'No autorizado' }, 401)

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
