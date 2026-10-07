// Las 6 tools del servidor MCP. Capa fina: validan el input (antes de tocar la
// DB) y delegan en funciones que ya usa la app — ejecutarCrearGasto (mismo
// camino que el chat de /agente), resumenCiclo, cargarCatalogos y el read
// service de server/consultas/gastos.js. Sin SQL acá.
//
// Única escritura: crear_gasto, que deja el gasto en estado 'pendiente' en la
// bandeja (/bandeja, /log). No hay tools para confirmar, editar ni borrar
// gastos, ni para escribir presupuesto, fondos, ingresos o catálogos.
//
// Todas responden { ok: true, data, meta } o { ok: false, error, code } con
// code ∈ validacion | no_autorizado | duplicado | no_encontrado | interno.

import { z } from 'zod'
import { cargarCatalogos } from '../catalogos.js'
import { ejecutarCrearGasto } from '../agente.js'
import { obtenerGastoPorId } from '../gastos/actualizar.js'
import { resumenCiclo } from '../consultas/ciclo.js'
import { buscarGastos, resumirGastos, MAX_GRUPOS } from '../consultas/gastos.js'
import {
  obtenerCicloActual,
  obtenerCicloAnterior,
  obtenerCicloFinanciero,
  obtenerRangoCiclo,
} from '../../src/utils/ciclos.js'

export class ErrorTool extends Error {
  constructor(code, message, data) {
    super(message)
    this.code = code
    this.data = data
  }
}

const validacion = (mensaje) => new ErrorTool('validacion', mensaje)

// ─── Validaciones compartidas ────────────────────────────────────────────────

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'debe ser YYYY-MM-DD')
const periodoSchema = z.string().regex(PERIODO_RE, 'debe ser YYYY-MM')
const montoFiltroSchema = z.number().min(0, 'no puede ser negativo')

// Misma regla que validarFecha (src/utils/ciclos.js), que no se exporta:
// obtenerCicloFinanciero la aplica y lanza si la fecha no existe (2026-02-30).
function cicloDeFecha(campo, fecha) {
  try {
    return obtenerCicloFinanciero(fecha)
  } catch {
    throw validacion(`${campo}: fecha inexistente (${fecha})`)
  }
}

// Fecha local del proceso Bun, igual que obtenerCicloActual.
export function fechaLocal(ahora) {
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-')
}

function validarRango(desdeCampo, desde, hastaCampo, hasta) {
  if (desde) cicloDeFecha(desdeCampo, desde)
  if (hasta) cicloDeFecha(hastaCampo, hasta)
  if (desde && hasta && desde > hasta) {
    throw validacion(`${desdeCampo} (${desde}) es posterior a ${hastaCampo} (${hasta})`)
  }
}

function validarMontos(min, max) {
  if (min != null && max != null && min > max) {
    throw validacion(`monto_min (${min}) es mayor que monto_max (${max})`)
  }
}

function porNombre(lista, valor) {
  const buscado = (valor || '').trim().toLowerCase()
  if (!buscado) return null
  return lista.find(n => n.toLowerCase() === buscado) || null
}

const NOTA_FECHAS =
  'Fechas en YYYY-MM-DD según la fecha local del servidor; resolvé "hoy", "ayer", ' +
  '"esta semana" o "septiembre" a fechas concretas antes de llamar. Ojo: "este mes" en sentido ' +
  'presupuestario es el CICLO financiero YYYY-MM, que va del día 29 del mes anterior al 28 del ' +
  'mes nominal (los días 29–31 ya pertenecen al ciclo siguiente). Usá `ciclo` para presupuesto ' +
  'y `fecha_desde`/`fecha_hasta` o `mes` para mes calendario o rangos sueltos.'

const NOTA_MONTOS =
  'Importes en pesos chilenos (CLP, enteros). `monto` es el cargo nominal (lo que salió de la ' +
  'tarjeta o cuenta). `monto_ciclo` es lo que impacta el sobre del ciclo: descuenta el split ' +
  '(parte que paga un tercero), respeta overrides manuales y vale 0 si el gasto lo financió un ' +
  'fondo de ahorro o está fuera del presupuesto. Gastos solo en dólares (`usd` > 0 sin CLP) no ' +
  'tienen tipo de cambio y quedan fuera de los totales.'

const filtrosShape = {
  fecha_desde: fechaSchema.optional().describe('Desde esta fecha inclusive (YYYY-MM-DD), sobre la fecha del gasto'),
  fecha_hasta: fechaSchema.optional().describe('Hasta esta fecha inclusive (YYYY-MM-DD)'),
  ciclo: periodoSchema.optional().describe('Ciclo financiero YYYY-MM (29 del mes anterior → 28 del mes nominal)'),
  mes: periodoSchema.optional().describe('Mes calendario YYYY-MM (día 1 al último del mes)'),
  banco: z.string().trim().min(1).optional().describe('Banco o medio de pago, nombre exacto de listar_catalogos (sin distinguir mayúsculas)'),
  texto: z.string().trim().min(1).optional().describe('Texto contenido en el comercio/motivo (ej. "uber")'),
  grupo: z.string().trim().min(1).optional().describe('Grupo presupuestario resuelto, coincidencia parcial sin distinguir mayúsculas (ej. "transporte")'),
  estado: z.enum(['confirmado', 'pendiente', 'error_parseo']).optional()
    .describe('Por defecto todos menos descartados. pendiente/error_parseo = en la bandeja esperando revisión humana'),
}

function validarFiltros(input) {
  validarRango('fecha_desde', input.fecha_desde, 'fecha_hasta', input.fecha_hasta)
}

// ─── 1. crear_gasto ──────────────────────────────────────────────────────────

const crearGasto = {
  name: 'crear_gasto',
  description: [
    'Registra UN gasto nuevo y lo deja en la bandeja de revisión (estado "pendiente"), igual que los',
    'que llegan por mail. NO lo confirma: una persona lo aprueba después en /bandeja de la app. No',
    'digas que quedó confirmado ni que ya cuenta como revisado.',
    'Usala cuando el usuario pide anotar o registrar un gasto. No sirve para editar, borrar ni',
    'confirmar gastos existentes (no hay tool para eso).',
    'Campos: fecha YYYY-MM-DD (fecha local del servidor; "hoy" = hoy, no se aceptan fechas futuras);',
    'motivo = nombre del comercio o descripción corta; exactamente uno de `monto` (pesos chilenos,',
    'entero) o `usd` (dólares) debe ser mayor que 0, el otro en 0; `banco` es obligatorio y tiene que',
    'ser un nombre de listar_catalogos().bancos (ej. una tarjeta o cuenta del catálogo). No inventes',
    'bancos: si el usuario dice "transferencia" o "efectivo" y no está en el catálogo, la tool',
    'devuelve error con la lista válida. `tipos` y `contexto` son opcionales y solo valen nombres del',
    'catálogo (lo que no exista se descarta); si no los mandás se completan con la memoria de',
    'comercios, y si el comercio es nuevo queda sin clasificar para que la persona lo clasifique.',
    'Si hay un posible duplicado (mismo comercio/monto en fechas cercanas) NO inserta y devuelve',
    'code "duplicado" con los candidatos: mostralos y reintentá con ignorar_duplicado=true solo si el',
    'usuario confirma que es otro gasto.',
  ].join(' '),
  annotations: { title: 'Crear gasto pendiente', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  schema: z.strictObject({
    fecha: fechaSchema.describe('Fecha del gasto YYYY-MM-DD, no futura'),
    motivo: z.string().trim().min(1, 'no puede estar vacío').max(200).describe('Comercio o descripción corta (ej. "Sushi Ichiban")'),
    monto: z.number().min(0).default(0).describe('Pesos chilenos (CLP), entero. 0 si el gasto fue en dólares'),
    usd: z.number().min(0).default(0).describe('Dólares, con decimales. 0 si el gasto fue en pesos'),
    banco: z.string().trim().min(1, 'es obligatorio').describe('Nombre exacto de listar_catalogos().bancos'),
    tipos: z.array(z.string()).max(10).default([]).describe('Opcional. Nombres de listar_catalogos().tipos'),
    contexto: z.string().default('').describe('Opcional. Un nombre de listar_catalogos().contextos'),
    ignorar_duplicado: z.boolean().default(false).describe('true solo si el usuario confirmó que no es un duplicado'),
  }),
  async handler(input, deps) {
    if (input.fecha > fechaLocal(deps.ahora())) {
      throw validacion(`fecha ${input.fecha} es futura (hoy en el servidor es ${fechaLocal(deps.ahora())})`)
    }
    const cicloFinanciero = cicloDeFecha('fecha', input.fecha)
    const monto = input.monto || 0
    const usd = input.usd || 0
    if ((monto > 0) === (usd > 0)) {
      throw validacion('exactamente uno de monto (CLP) o usd debe ser mayor que 0')
    }
    if (monto > 0 && !Number.isInteger(monto)) {
      throw validacion('monto es en pesos chilenos: tiene que ser entero')
    }

    const catalogos = await deps.cargarCatalogos()
    const banco = porNombre(catalogos.bancos, input.banco)
    if (!banco) {
      throw validacion(`banco "${input.banco}" no existe en el catálogo. Bancos válidos: ${catalogos.bancos.join(', ')}`)
    }
    const tipos = []
    const tiposDescartados = []
    for (const t of input.tipos) {
      const canonico = porNombre(catalogos.tipos, t)
      if (canonico) { if (!tipos.includes(canonico)) tipos.push(canonico) } else tiposDescartados.push(t)
    }
    const contexto = porNombre(catalogos.contextos, input.contexto) || ''
    const contextoDescartado = input.contexto && !contexto ? input.contexto : null

    const motivo = input.motivo.trim()
    const resultado = await deps.ejecutarCrearGasto(catalogos, {
      fecha: input.fecha,
      motivo,
      monto,
      usd,
      banco,
      tipos,
      contexto,
      ignorar_duplicado: input.ignorar_duplicado,
    }, { origen: 'mcp' })

    if (resultado.bloqueado) {
      const candidatos = resultado.candidatos.map(c => ({
        id: c.gastoId,
        fecha: c.fecha,
        motivo: c.motivo,
        monto: c.monto,
        usd: c.usd,
        banco: c.banco,
        estado: c.estado,
      }))
      throw new ErrorTool(
        'duplicado',
        `No se creó: hay ${candidatos.length} posible(s) duplicado(s). Mostráselos al usuario; reintentá con ignorar_duplicado=true solo si confirma que es otro gasto.`,
        { candidatos },
      )
    }

    // Se relee la fila para devolver lo que quedó guardado (tipos/contexto
    // pueden venir de la memoria de comercios).
    const guardado = await deps.obtenerGasto(resultado.gastoId)
    return {
      data: {
        id: resultado.gastoId,
        estado: 'pendiente',
        fecha: input.fecha,
        motivo,
        monto,
        usd,
        banco,
        tipos: guardado?.tipos ?? tipos,
        contexto: guardado?.contexto ?? contexto,
        ciclo_financiero: guardado?.ciclo_financiero ?? cicloFinanciero,
        mensaje: 'Quedó en la bandeja (/bandeja) como pendiente, esperando aprobación humana. Todavía no está confirmado.',
      },
      meta: {
        origen: 'mcp',
        tipos_descartados: tiposDescartados,
        contexto_descartado: contextoDescartado,
      },
    }
  },
}

// ─── 2. buscar_gastos ────────────────────────────────────────────────────────

const buscarGastosTool = {
  name: 'buscar_gastos',
  description: [
    'Lista gastos individuales con filtros combinables y paginación. Usala para "últimos gastos",',
    '"gastos de <banco>", "compras en Uber", "compras sobre $100000", "qué gasté ayer". Para totales,',
    'promedios o porcentajes usá resumir_gastos (no sumes vos las filas: la lista viene paginada).',
    '"Los 10 últimos ingresados" = orden "creado_desc", limite 10.',
    NOTA_FECHAS,
    NOTA_MONTOS,
    '`monto_min`/`monto_max` filtran sobre `monto` nominal CLP.',
    'Cada fila trae grupo/subcategoría presupuestaria resueltos (null si no tiene: confirmado sin',
    'regla o fuera del presupuesto; "SIN CLASIFICAR" si está pendiente sin categoría).',
    'meta.truncado=true significa que hay más resultados: pedí la siguiente página con offset.',
  ].join(' '),
  annotations: { title: 'Buscar gastos', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    ...filtrosShape,
    monto_min: montoFiltroSchema.optional().describe('Monto nominal CLP mínimo, inclusive'),
    monto_max: montoFiltroSchema.optional().describe('Monto nominal CLP máximo, inclusive'),
    orden: z.enum(['fecha_desc', 'fecha_asc', 'monto_desc', 'creado_desc']).default('fecha_desc')
      .describe('fecha_desc (default), fecha_asc, monto_desc, o creado_desc = últimos ingresados a la app'),
    limite: z.number().int().min(1).max(50).default(20).describe('Filas por página, 1–50 (default 20)'),
    offset: z.number().int().min(0).default(0).describe('Filas a saltar para paginar (default 0)'),
  }),
  async handler(input, deps) {
    validarFiltros(input)
    validarMontos(input.monto_min, input.monto_max)
    const { filas, meta } = await deps.buscarGastos(input)
    return { data: filas, meta }
  },
}

// ─── 3. resumir_gastos ───────────────────────────────────────────────────────

const resumirGastosTool = {
  name: 'resumir_gastos',
  description: [
    'Totales agregados en el servidor: cuánto se gastó, cuántos gastos, promedio, mínimo, máximo, y',
    'opcionalmente el desglose por grupo, subcategoría, banco, día, mes o ciclo con su porcentaje.',
    'Usala para "¿cuánto gasté esta semana?", "¿en qué categoría gasto más?", "% en transporte",',
    '"¿cuánto con un banco vs otro?" (agrupar_por banco). Para listar gastos uno por uno usá',
    'buscar_gastos; para "cómo voy contra el presupuesto" usá resumen_presupuesto.',
    NOTA_FECHAS,
    NOTA_MONTOS,
    'Incluye lo mismo que el dashboard: excluye descartados, gastos marcados fuera del presupuesto y',
    'USD puro. `total_ciclo` = suma de monto_ciclo; `total_nominal` = suma de monto CLP de esas mismas',
    'filas (para "cuánto salió de la cuenta"). `cantidad` cuenta todas las filas incluidas, aunque su',
    'monto_ciclo sea 0 (p.ej. financiadas por un fondo de ahorro). Pendientes sin categoría van a',
    '"SIN CLASIFICAR" y sí suman; confirmados sin regla de mapeo van a "SIN MAPEO". `porcentaje` es',
    '0–100 sobre total_ciclo. Máximo 30 grupos; el resto se suma en "otros". Sin grupos si',
    'agrupar_por es "ninguno" (default).',
  ].join(' '),
  annotations: { title: 'Resumir gastos', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    ...filtrosShape,
    agrupar_por: z.enum(['ninguno', 'grupo', 'subcategoria', 'banco', 'dia', 'mes', 'ciclo']).default('ninguno')
      .describe('Dimensión del desglose. grupo/subcategoria = categoría presupuestaria resuelta'),
  }),
  async handler(input, deps) {
    validarFiltros(input)
    const { agrupar_por, ...filtros } = input
    const r = await deps.resumirGastos({ ...filtros, agrupar_por })
    const { grupos, grupos_totales, ...totales } = r
    return {
      data: grupos ? { ...totales, grupos } : totales,
      meta: { agrupar_por, ...(grupos ? { grupos_totales, truncado: grupos_totales > MAX_GRUPOS } : {}) },
    }
  },
}

// ─── 4. comparar_periodos ────────────────────────────────────────────────────

const compararPeriodos = {
  name: 'comparar_periodos',
  description: [
    'Compara el gasto de dos períodos (a = base, b = comparado) y devuelve la diferencia y un',
    'desglose por grupo presupuestario. Solo números, sin juicio.',
    'Modo "ciclos" (default): compara dos ciclos financieros con la misma cuenta que el dashboard',
    '(gastado del presupuesto). Si omitís ciclo_a/ciclo_b compara el ciclo anterior (a) con el actual',
    '(b): eso responde "¿estoy gastando más que el mes pasado?". Usalo también para "septiembre vs',
    'octubre" cuando se habla del presupuesto (ciclo_a 2026-09, ciclo_b 2026-10).',
    'Modo "rangos": dos rangos de fechas arbitrarios (fecha_desde_a..fecha_hasta_a vs',
    'fecha_desde_b..fecha_hasta_b, inclusive), para semanas o meses calendario.',
    'Filtros opcionales `grupo` (parcial) y `banco` (nombre del catálogo), aplicados a ambos lados.',
    NOTA_FECHAS,
    '`total_ciclo` es la suma de monto_ciclo (CLP, ver resumir_gastos). diferencia_absoluta = b − a;',
    'diferencia_porcentual = (b − a) / a × 100 con un decimal, null si a es 0.',
  ].join(' '),
  annotations: { title: 'Comparar períodos', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    modo: z.enum(['ciclos', 'rangos']).default('ciclos'),
    ciclo_a: periodoSchema.optional().describe('Solo modo ciclos. Default: ciclo anterior a ciclo_b'),
    ciclo_b: periodoSchema.optional().describe('Solo modo ciclos. Default: ciclo actual'),
    fecha_desde_a: fechaSchema.optional().describe('Solo modo rangos, obligatorio'),
    fecha_hasta_a: fechaSchema.optional().describe('Solo modo rangos, obligatorio'),
    fecha_desde_b: fechaSchema.optional().describe('Solo modo rangos, obligatorio'),
    fecha_hasta_b: fechaSchema.optional().describe('Solo modo rangos, obligatorio'),
    grupo: filtrosShape.grupo,
    banco: filtrosShape.banco,
  }),
  async handler(input, deps) {
    const { modo, grupo, banco } = input
    const filtro = { ...(grupo && { grupo }), ...(banco && { banco }) }
    const hayFiltro = Boolean(grupo || banco)
    const camposRango = ['fecha_desde_a', 'fecha_hasta_a', 'fecha_desde_b', 'fecha_hasta_b']
    let lados

    if (modo === 'ciclos') {
      const usados = camposRango.filter(c => input[c])
      if (usados.length) throw validacion(`modo ciclos no acepta ${usados.join(', ')}; usá modo "rangos"`)
      const cicloB = input.ciclo_b || obtenerCicloActual(deps.ahora())
      const cicloA = input.ciclo_a || obtenerCicloAnterior(cicloB)
      lados = await Promise.all([cicloA, cicloB].map(async (ciclo) => {
        const [resumen, agregado] = await Promise.all([
          deps.resumenCiclo({ ciclo }),
          deps.resumirGastos({ ciclo, ...filtro, agrupar_por: 'grupo', maxGrupos: 0 }),
        ])
        return {
          etiqueta: ciclo,
          desde: resumen.rango.desde,
          hasta: resumen.rango.hasta,
          // Sin filtro, el total es exactamente el "gastado" del dashboard.
          total_ciclo: hayFiltro ? agregado.total_ciclo : resumen.gastado,
          cantidad: agregado.cantidad,
          grupos: agregado.grupos,
        }
      }))
    } else {
      if (input.ciclo_a || input.ciclo_b) throw validacion('modo rangos no acepta ciclo_a/ciclo_b; usá modo "ciclos"')
      const faltan = camposRango.filter(c => !input[c])
      if (faltan.length) throw validacion(`modo rangos requiere ${faltan.join(', ')}`)
      validarRango('fecha_desde_a', input.fecha_desde_a, 'fecha_hasta_a', input.fecha_hasta_a)
      validarRango('fecha_desde_b', input.fecha_desde_b, 'fecha_hasta_b', input.fecha_hasta_b)
      lados = await Promise.all([
        [input.fecha_desde_a, input.fecha_hasta_a],
        [input.fecha_desde_b, input.fecha_hasta_b],
      ].map(async ([desde, hasta]) => {
        const agregado = await deps.resumirGastos({
          fecha_desde: desde, fecha_hasta: hasta, ...filtro, agrupar_por: 'grupo', maxGrupos: 0,
        })
        return {
          etiqueta: `${desde}..${hasta}`,
          desde,
          hasta,
          total_ciclo: agregado.total_ciclo,
          cantidad: agregado.cantidad,
          grupos: agregado.grupos,
        }
      }))
    }

    const [a, b] = lados
    const porClave = new Map()
    for (const [lado, campo] of [[a, 'total_a'], [b, 'total_b']]) {
      for (const g of lado.grupos || []) {
        const fila = porClave.get(g.clave) || { clave: g.clave, total_a: 0, total_b: 0 }
        fila[campo] = g.total_ciclo
        porClave.set(g.clave, fila)
      }
    }
    const desglose = [...porClave.values()]
      .map(f => ({ ...f, diferencia: f.total_b - f.total_a }))
      .sort((x, y) => Math.max(y.total_a, y.total_b) - Math.max(x.total_a, x.total_b) || x.clave.localeCompare(y.clave))
    const resumenLado = ({ etiqueta, desde, hasta, total_ciclo, cantidad }) => ({ etiqueta, desde, hasta, total_ciclo, cantidad })

    return {
      data: {
        a: resumenLado(a),
        b: resumenLado(b),
        diferencia_absoluta: b.total_ciclo - a.total_ciclo,
        diferencia_porcentual: a.total_ciclo
          ? Math.round(((b.total_ciclo - a.total_ciclo) / a.total_ciclo) * 1000) / 10
          : null,
        desglose,
      },
      meta: { modo, filtro },
    }
  },
}

// ─── 5. resumen_presupuesto ──────────────────────────────────────────────────

const resumenPresupuesto = {
  name: 'resumen_presupuesto',
  description: [
    'Estado del presupuesto de un ciclo financiero: ingresos previstos, previsto, gastado, restante y',
    'semáforo por grupo (verde/amarillo/rojo/naranja/gris), igual que el dashboard. Es la tool para',
    '"¿cuánto llevo gastado este mes?", "¿cuánto me queda del presupuesto?", "¿qué categorías están',
    'en rojo?". Solo lectura: no crea ni edita presupuesto.',
    'ciclo YYYY-MM opcional, default el ciclo actual (del 29 del mes anterior al 28 del mes nominal,',
    'según la fecha local del servidor). `gastado` es la suma de monto_ciclo (no la suma cruda de',
    'monto): descuenta split, excluye USD puro y lo financiado por fondos de ahorro, e incluye',
    'pendientes de la bandeja (los sin categoría van en `sin_clasificar`). Si hay_presupuesto es',
    'false ese ciclo no tiene presupuesto cargado: previsto/ingresos valen 0 pero gastado es real.',
    '`dia` es el día del ciclo (1..duracion).',
  ].join(' '),
  annotations: { title: 'Resumen de presupuesto', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    ciclo: periodoSchema.optional().describe('Ciclo financiero YYYY-MM. Default: ciclo actual'),
  }),
  async handler(input, deps) {
    const ciclo = input.ciclo || obtenerCicloActual(deps.ahora())
    const r = await deps.resumenCiclo({ ciclo })
    return {
      data: {
        ciclo: r.ciclo,
        rango: r.rango || obtenerRangoCiclo(r.ciclo),
        dia: r.dia,
        duracion: r.duracion,
        ingresos: r.ingresos,
        previsto: r.previsto,
        gastado: r.gastado,
        restante: r.restante,
        sin_clasificar: r.sin_clasificar,
        hay_presupuesto: r.hay_presupuesto,
        semaforos: r.semaforos,
        en_rojo: r.en_rojo,
      },
      meta: { ciclo_default: !input.ciclo },
    }
  },
}

// ─── 6. listar_catalogos ─────────────────────────────────────────────────────

const listarCatalogos = {
  name: 'listar_catalogos',
  description: [
    'Devuelve los nombres válidos de bancos/medios de pago, tipos de gasto, contextos y grupos',
    'presupuestarios con sus subcategorías. Llamala antes de crear_gasto si no estás seguro del',
    'nombre exacto del banco o de un tipo (ej. el usuario dice "con la Edwards" o "transferencia"),',
    'o antes de filtrar por banco/grupo. Solo lectura, sin parámetros.',
  ].join(' '),
  annotations: { title: 'Listar catálogos', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({}),
  async handler(_input, deps) {
    const c = await deps.cargarCatalogos()
    return {
      data: {
        bancos: c.bancos,
        tipos: c.tipos,
        contextos: c.contextos,
        grupos: c.grupos.map(g => ({ nombre: g.nombre, subcategorias: g.subcategorias.map(s => s.nombre) })),
      },
    }
  },
}

export const TOOLS = [
  crearGasto,
  buscarGastosTool,
  resumirGastosTool,
  compararPeriodos,
  resumenPresupuesto,
  listarCatalogos,
]

export const depsPorDefecto = {
  cargarCatalogos,
  ejecutarCrearGasto,
  obtenerGasto: obtenerGastoPorId,
  buscarGastos,
  resumirGastos,
  resumenCiclo,
  ahora: () => new Date(),
}

function mensajeZod(error) {
  return error.issues
    .map(i => `${i.path.length ? i.path.join('.') : 'input'}: ${i.message}`)
    .join('; ')
}

// Corre una tool con validación propia (no la del SDK) para que todo error
// salga con la misma forma { ok: false, error, code }.
export async function ejecutarTool(nombre, args, deps = depsPorDefecto) {
  const tool = TOOLS.find(t => t.name === nombre)
  if (!tool) return { ok: false, error: `Tool desconocida: ${nombre}`, code: 'no_encontrado' }

  const parsed = tool.schema.safeParse(args ?? {})
  if (!parsed.success) return { ok: false, error: mensajeZod(parsed.error), code: 'validacion' }

  try {
    const { data, meta = {} } = await tool.handler(parsed.data, deps)
    return { ok: true, data, meta }
  } catch (err) {
    if (err instanceof ErrorTool) {
      return { ok: false, error: err.message, code: err.code, ...(err.data && { data: err.data }) }
    }
    console.error(`[mcp] ${nombre} falló:`, err?.message || err)
    return { ok: false, error: 'Error interno al ejecutar la tool', code: 'interno' }
  }
}

export function definicionesTools() {
  return TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.schema, { io: 'input' }),
    annotations: t.annotations,
  }))
}
