// Las 9 tools MCP de clases particulares (DEC-019). Mismas convenciones que tools.js: Zod
// estricto, sin SQL (delegan en server/clases/clases.js vía deps), errores con ErrorTool.
//
// Pueden crear alumnos y clases y cambiar estados: mover, marcar dictada, cancelar y registrar
// un pago (que crea el `ingreso` de "Clases particulares"). No pueden borrar alumnos, clases ni
// pagos, reabrir una clase pagada ni deshacer un pago (eso es solo desde /clases), editar un
// ingreso a mano, escribir presupuesto ni tocar gastos.

import { z } from 'zod'
import { ErrorTool } from './errores.js'
import {
  listarAlumnos, buscarClases, resumenClases, crearAlumno, agendarClase, moverClase,
  marcarDictada, cancelarClase, registrarPago, hoyLocal, PRECIO_HORA_NORMAL,
} from '../clases/clases.js'

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'debe ser YYYY-MM-DD')
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'debe ser HH:MM en 24 h (ej. "19:00")')
const horasSchema = z.number().positive().max(10)
  .refine(h => Number.isInteger(h * 4), 'en múltiplos de 0,25 h (15 min)')
const precioHoraSchema = z.number().int('entero CLP').min(0)
const claseIdSchema = z.number().int().positive()
const modalidadSchema = z.enum(['presencial', 'online'])

// Resultado de server/clases → data, o ErrorTool con el mismo code.
function resultado(r) {
  if (r?.error) throw new ErrorTool(r.code || 'validacion', r.error, r.clase_id ? { clase_id: r.clase_id } : undefined)
  return r
}

const minutos = (horas) => Math.round(horas * 60)

const NOTA_CLASES =
  'Clases particulares en pesos chilenos (CLP, enteros). Cada clase tiene estado (programada | ' +
  'dictada | cancelada) y cobro (pendiente | pagado). `monto` = precio_hora × horas, congelado en la ' +
  'clase. Fechas YYYY-MM-DD y horas HH:MM según la hora local del servidor (Chile).'

// ─── Lectura ─────────────────────────────────────────────────────────────────

const listarAlumnosTool = {
  name: 'listar_alumnos',
  description: [
    'Lista los alumnos de clases particulares con su precio por hora por defecto y si están activos.',
    'Usala para resolver el nombre exacto de un alumno antes de agendar. Solo lectura.',
  ].join(' '),
  annotations: { title: 'Listar alumnos', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    incluir_inactivos: z.boolean().default(true).describe('false para ver solo los activos'),
  }),
  async handler(input, deps) {
    const alumnos = await deps.listarAlumnos({ incluirInactivos: input.incluir_inactivos })
    return { data: alumnos, meta: { total: alumnos.length } }
  },
}

const buscarClasesTool = {
  name: 'buscar_clases',
  description: [
    'Lista clases particulares con filtros combinables y paginación, ordenadas por fecha y hora.',
    'Para sincronizar un calendario usá `actualizada_desde` (fecha-hora ISO): devuelve las clases',
    'creadas o cambiadas desde ese momento, incluidas las canceladas.',
    NOTA_CLASES,
    'meta.truncado=true significa que hay más resultados: pedí la siguiente página con offset.',
  ].join(' '),
  annotations: { title: 'Buscar clases', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    alumno: z.string().trim().min(1).optional().describe('Parte del nombre del alumno, sin distinguir mayúsculas (ej. "mena")'),
    alumno_id: claseIdSchema.optional(),
    desde: fechaSchema.optional().describe('Fecha de la clase desde, inclusive'),
    hasta: fechaSchema.optional().describe('Fecha de la clase hasta, inclusive'),
    estado: z.enum(['programada', 'dictada', 'cancelada']).optional(),
    cobro: z.enum(['pendiente', 'pagado']).optional(),
    actualizada_desde: z.string().trim().min(1).optional().describe('Fecha-hora ISO 8601 (ej. "2026-10-16T09:00:00-03:00")'),
    limite: z.number().int().min(1).max(100).default(50).describe('Filas por página, 1–100 (default 50)'),
    offset: z.number().int().min(0).default(0),
  }),
  async handler(input, deps) {
    const { filas, meta } = resultado(await deps.buscarClases(input))
    return { data: filas, meta }
  },
}

const resumenClasesTool = {
  name: 'resumen_clases',
  description: [
    'Resumen de clases en un rango: horas y clases dictadas y programadas (por fecha de la clase),',
    'total cobrado (por fecha del pago) y la deuda actual por alumno con la fecha de su clase impaga',
    'más vieja. La deuda es la suma de clases dictadas y todavía sin cobrar; no depende del rango.',
    'Sin desde/hasta usa el mes calendario actual. Las clases importadas de Notion ya pagadas no',
    'tienen pago registrado y no suman a `cobrado`.',
    NOTA_CLASES,
  ].join(' '),
  annotations: { title: 'Resumen de clases', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
  }),
  async handler(input, deps) {
    let { desde, hasta } = input
    const porDefecto = !desde && !hasta
    if (porDefecto) {
      const hoy = hoyLocal(deps.ahora())
      const [y, m] = hoy.split('-').map(Number)
      desde = `${hoy.slice(0, 7)}-01`
      hasta = `${hoy.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    }
    return { data: resultado(await deps.resumenClases({ desde, hasta })), meta: { rango_default: porDefecto } }
  },
}

// ─── Escritura ───────────────────────────────────────────────────────────────

const crearAlumnoTool = {
  name: 'crear_alumno',
  description: [
    'Da de alta un alumno de clases particulares. Si ya existe uno con ese nombre (sin distinguir',
    'mayúsculas) devuelve ese mismo, sin duplicar ni cambiar su precio, con meta.existente=true; si',
    'estaba desactivado lo reactiva. Usá el nombre tal como lo dice el usuario, sin corregirlo.',
    `precio_hora es el precio por hora por defecto para agendar (default ${PRECIO_HORA_NORMAL}).`,
  ].join(' '),
  annotations: { title: 'Crear alumno', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  schema: z.strictObject({
    nombre: z.string().trim().min(1).max(120),
    precio_hora: z.number().int().positive().default(PRECIO_HORA_NORMAL).describe('CLP por hora, entero'),
  }),
  async handler(input, deps) {
    const r = resultado(await deps.crearAlumno({ nombre: input.nombre, precio_hora_default: input.precio_hora }))
    return { data: r.alumno, meta: { existente: r.existente, reactivado: r.reactivado } }
  },
}

const agendarClaseTool = {
  name: 'agendar_clase',
  description: [
    'Agenda una clase nueva: queda programada y pendiente de cobro. Pasá `alumno` (nombre exacto, de',
    'listar_alumnos) o `alumno_id`; si el alumno no existe, crealo antes con crear_alumno. Sin',
    '`precio_hora` usa el del alumno. Si ya hay una clase del mismo alumno ese día a esa hora',
    'responde code "conflicto" con data.clase_id (no duplica).',
    NOTA_CLASES,
  ].join(' '),
  annotations: { title: 'Agendar clase', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  schema: z.strictObject({
    alumno: z.string().trim().min(1).optional().describe('Nombre exacto del alumno'),
    alumno_id: claseIdSchema.optional(),
    fecha: fechaSchema,
    hora: horaSchema.describe('Hora de inicio'),
    horas: horasSchema.default(1).describe('Duración en horas: 0.5, 1, 1.5, 2…'),
    modalidad: modalidadSchema.default('presencial'),
    precio_hora: precioHoraSchema.optional().describe('CLP por hora; default el del alumno'),
    nota: z.string().trim().max(300).optional(),
  }),
  async handler(input, deps) {
    if (!input.alumno && !input.alumno_id) throw new ErrorTool('validacion', 'Falta alumno o alumno_id')
    const r = resultado(await deps.agendarClase({
      alumno: input.alumno,
      alumno_id: input.alumno_id,
      fecha: input.fecha,
      hora_inicio: input.hora,
      duracion_minutos: minutos(input.horas),
      modalidad: input.modalidad,
      precio_hora: input.precio_hora,
      nota: input.nota,
    }))
    return { data: r.clase }
  },
}

const moverClaseTool = {
  name: 'mover_clase',
  description: [
    'Cambia fecha, hora, duración, modalidad o precio por hora de una clase que sigue programada y',
    'sin cobrar; recalcula el monto. Una clase dictada, cancelada o pagada no se mueve (code',
    '"conflicto").',
  ].join(' '),
  annotations: { title: 'Mover clase', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  schema: z.strictObject({
    clase_id: claseIdSchema,
    fecha: fechaSchema.optional(),
    hora: horaSchema.optional(),
    horas: horasSchema.optional(),
    modalidad: modalidadSchema.optional(),
    precio_hora: precioHoraSchema.optional(),
  }),
  async handler(input, deps) {
    const { clase_id, fecha, hora, horas, modalidad, precio_hora } = input
    if ([fecha, hora, horas, modalidad, precio_hora].every(v => v === undefined)) {
      throw new ErrorTool('validacion', 'No hay cambios: pasá fecha, hora, horas, modalidad o precio_hora')
    }
    const r = resultado(await deps.moverClase(clase_id, {
      fecha,
      hora_inicio: hora,
      duracion_minutos: horas === undefined ? undefined : minutos(horas),
      modalidad,
      precio_hora,
    }))
    return { data: r.clase }
  },
}

const marcarDictadaTool = {
  name: 'marcar_dictada',
  description: 'Marca una clase programada como dictada (ya se hizo). No la cobra: queda pendiente de pago hasta registrar_pago.',
  annotations: { title: 'Marcar clase dictada', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  schema: z.strictObject({ clase_id: claseIdSchema }),
  async handler(input, deps) {
    return { data: resultado(await deps.marcarDictada(input.clase_id)).clase }
  },
}

const cancelarClaseTool = {
  name: 'cancelar_clase',
  description: [
    'Cancela una clase que no está pagada: pasa a estado cancelada (no se borra) y deja de contar',
    'en deuda, horas y pagos. Una clase pagada no se cancela (code "conflicto").',
  ].join(' '),
  annotations: { title: 'Cancelar clase', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  schema: z.strictObject({ clase_id: claseIdSchema }),
  async handler(input, deps) {
    return { data: resultado(await deps.cancelarClase(input.clase_id)).clase }
  },
}

const registrarPagoTool = {
  name: 'registrar_pago',
  description: [
    'Registra que un alumno pagó una o más clases. Todas las clases tienen que ser del mismo alumno,',
    'estar dictadas y sin cobrar; el monto del pago es la suma de sus montos (no hay pagos parciales',
    'ni por adelantado). En una sola operación marca las clases como pagadas y crea un ingreso real',
    '"Clases particulares" con la fecha del pago, que cae en el ciclo financiero de esa fecha.',
    '`monto` es opcional: si lo pasás y no coincide con la suma, no se registra nada.',
    'Un pago no se puede deshacer por acá: confirmá con el usuario las clases y la fecha antes.',
    'Fecha del pago YYYY-MM-DD, no futura.',
  ].join(' '),
  annotations: { title: 'Registrar pago de clases', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  schema: z.strictObject({
    clase_ids: z.array(claseIdSchema).min(1).max(50),
    fecha: fechaSchema.describe('Fecha del pago'),
    monto: z.number().int().positive().optional().describe('Total esperado en CLP, para verificar'),
  }),
  async handler(input, deps) {
    const r = resultado(await deps.registrarPago({
      claseIds: input.clase_ids,
      fecha: input.fecha,
      monto: input.monto,
      hoy: hoyLocal(deps.ahora()),
    }))
    return { data: { pago: r.pago, ingreso: r.ingreso } }
  },
}

export const TOOLS_CLASES = [
  listarAlumnosTool,
  buscarClasesTool,
  resumenClasesTool,
  crearAlumnoTool,
  agendarClaseTool,
  moverClaseTool,
  marcarDictadaTool,
  cancelarClaseTool,
  registrarPagoTool,
]

export const depsClases = {
  listarAlumnos,
  buscarClases,
  resumenClases,
  crearAlumno,
  agendarClase,
  moverClase,
  marcarDictada,
  cancelarClase,
  registrarPago,
}
