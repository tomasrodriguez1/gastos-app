// Servidor MCP remoto (Streamable HTTP) en el mismo proceso Hono, path /mcp.
// Mismo proceso a propósito: las tools llaman a ejecutarCrearGasto,
// resumenCiclo y cargarCatalogos directo, sin un segundo acceso a la DB.
//
// Auth: Bearer MCP_TOKEN, comparación timing-safe, mismo patrón que
// INGESTA_TOKEN. Token propio (no INGESTA_TOKEN ni ACCESS_TOKEN). Sin token
// configurado o sin Bearer correcto → 401 siempre, también en desarrollo:
// por eso se monta antes del gate global y queda exento de él (ver
// server/index.js y createAuthMiddleware), igual que /api/ingesta.
//
// Stateless: un Server + transporte por request, respuesta JSON (sin SSE).
// No hay sesiones que guardar y ninguna tool emite progreso.

import { Hono } from 'hono'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { timingSafeEqualString } from '../auth.js'
import { definicionesTools, ejecutarTool, depsPorDefecto } from './tools.js'

const MAX_BODY_BYTES = 64 * 1024

function tokenBearer(c) {
  const authHeader = c.req.header('Authorization') || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
}

function crearServidorMcp(deps) {
  const server = new Server(
    { name: 'gastos-app', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Gastos personales en pesos chilenos (CLP). Solo lectura salvo crear_gasto, que deja el gasto ' +
        'pendiente en la bandeja para aprobación humana. El presupuesto va por ciclo financiero YYYY-MM ' +
        '(del 29 del mes anterior al 28 del mes nominal), no por mes calendario.',
    },
  )
  const herramientas = definicionesTools()
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: herramientas }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const respuesta = await ejecutarTool(request.params.name, request.params.arguments, deps)
    return {
      content: [{ type: 'text', text: JSON.stringify(respuesta) }],
      structuredContent: respuesta,
      isError: !respuesta.ok,
    }
  })
  return server
}

export function createMcpRouter({ token = process.env.MCP_TOKEN, deps = depsPorDefecto } = {}) {
  const router = new Hono()

  router.use('*', async (c, next) => {
    const provisto = tokenBearer(c)
    if (!token || !provisto || !timingSafeEqualString(provisto, token)) {
      c.header('WWW-Authenticate', 'Bearer')
      return c.json({ ok: false, error: 'No autorizado', code: 'no_autorizado' }, 401)
    }
    return next()
  })

  router.post('/', async (c) => {
    const server = crearServidorMcp(deps)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_BODY_BYTES,
    })
    try {
      await server.connect(transport)
      return await transport.handleRequest(c.req.raw)
    } finally {
      await server.close()
    }
  })

  // Stateless: sin stream SSE (GET) ni sesiones que cerrar (DELETE).
  router.on(['GET', 'DELETE'], '/', (c) => {
    c.header('Allow', 'POST')
    return c.json({ ok: false, error: 'Método no permitido: usá POST', code: 'validacion' }, 405)
  })

  return router
}
