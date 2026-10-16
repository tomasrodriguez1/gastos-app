// Tools MCP de ingresos (DEC-020). Mismas convenciones que tools.js: Zod estricto, sin SQL
// (delegan en server/ingresos.js y server/ingresosCiclo.js vía deps), errores con ErrorTool.
//
// registrar_ingreso es una escritura "con humano en el loop", igual que crear_gasto: el ingreso
// nace estado='pendiente' (origen 'mcp') y no cuenta como ingreso real hasta que alguien lo
// aprueba en /ingresos. No hay tool para aprobar, editar ni borrar ingresos.

import { z } from 'zod'
import { ErrorTool } from './errores.js'
import { buscarIngresosSimilares, crearIngreso } from '../ingresos.js'
import { listarPendientes, resumenIngresosCiclo } from '../ingresosCiclo.js'
import { hoyLocal, fechaValida } from '../clases/clases.js'

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'debe ser YYYY-MM-DD')
const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'debe ser YYYY-MM')

const NOTA_INGRESOS =
  'Ingresos reales en pesos chilenos (CLP, enteros), por ciclo financiero YYYY-MM (del 29 del mes ' +
  'anterior al 28 del mes nominal). Distinto del ingreso previsto del presupuesto, que es solo un plan.'

const registrarIngreso = {
  name: 'registrar_ingreso',
  description: [
    'Registra UN ingreso real y lo deja PENDIENTE de aprobación humana en /ingresos, igual que',
    'crear_gasto con los gastos: NO cuenta como ingreso hasta que una persona lo apruebe. No digas',
    'que quedó confirmado.',
    'Usala cuando el usuario pide anotar plata que le llegó (sueldo, mesada, un proyecto, o plata',
    'sacada de un fondo). `fuente` tiene que ser del catálogo (resumen_ingresos las lista; sin',
    'distinguir mayúsculas): Sueldo Zalantos, Proyectos propios, Mesada, Otros o Uso de fondos',
    '(con `fondo` = de qué fondo sacó). Clases particulares NO se registra acá: es un pago de clases',
    '(registrar_pago). No sirve para editar, aprobar ni borrar ingresos.',
    'Fecha YYYY-MM-DD, no futura. Si ya hay uno parecido (misma fuente, monto ±10 % y fecha ±5 días)',
    'NO inserta y devuelve code "duplicado" con los candidatos: mostralos y reintentá con',
    'ignorar_duplicado=true solo si el usuario confirma que es otro ingreso.',
    NOTA_INGRESOS,
  ].join(' '),
  annotations: { title: 'Registrar ingreso pendiente', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  schema: z.strictObject({
    fuente: z.string().trim().min(1).describe('Fuente del catálogo, ej. "Mesada"'),
    monto: z.number().int('en pesos chilenos: entero').positive().describe('Monto en CLP'),
    fecha: fechaSchema.describe('Fecha en que llegó, no futura'),
    nota: z.string().trim().max(300).optional(),
    fondo: z.string().trim().min(1).max(120).optional().describe('Solo con la fuente "Uso de fondos": de qué fondo o reserva se sacó'),
    ignorar_duplicado: z.boolean().default(false).describe('true solo si el usuario confirmó que no es un duplicado'),
  }),
  async handler(input, deps) {
    const hoy = hoyLocal(deps.ahora())
    if (!fechaValida(input.fecha)) throw new ErrorTool('validacion', `fecha: fecha inexistente (${input.fecha})`)
    if (input.fecha > hoy) throw new ErrorTool('validacion', `fecha ${input.fecha} es futura (hoy en el servidor es ${hoy})`)

    if (!input.ignorar_duplicado) {
      const candidatos = await deps.buscarIngresosSimilares({ fuente: input.fuente, monto: input.monto, fecha: input.fecha })
      if (candidatos.length) {
        throw new ErrorTool(
          'duplicado',
          `No se creó: hay ${candidatos.length} ingreso(s) parecido(s). Mostráselos al usuario; reintentá con ignorar_duplicado=true solo si confirma que es otro.`,
          { candidatos },
        )
      }
    }

    const r = await deps.crearIngreso({
      fecha: input.fecha,
      fuente: input.fuente,
      monto: input.monto,
      nota: input.nota,
      fondo: input.fondo,
      origen: 'mcp',
    })
    if (r.error) throw new ErrorTool(r.code || 'validacion', r.error, r.validas ? { fuentes_validas: r.validas } : undefined)
    return {
      data: {
        ...r.ingreso,
        mensaje: 'Quedó pendiente de aprobación en /ingresos. Todavía no cuenta como ingreso real.',
      },
      meta: { origen: 'mcp' },
    }
  },
}

const resumenIngresos = {
  name: 'resumen_ingresos',
  description: [
    'Ingresos de un ciclo financiero por fuente: previsto, real (confirmado), por aprobar y esperado,',
    'con el estado de cada una (llegó, por aprobar, pendiente o atrasada si es fija y pasó su día',
    'esperado). Para Clases particulares trae además lo que falta por cobrar y los pagos por',
    'confirmar: sus ingresos son los de las clases del MES ANTERIOR al ciclo (las clases de octubre',
    'son ingreso del ciclo de noviembre), y `mes_clases` indica ese mes. El `real` de Clases ya',
    'incluye `real_automatico`: las clases de ese mes ya cobradas que no tienen un pago registrado',
    '(importadas como "Pagado") se asumen como ingreso solas, sin registrar nada. `totales.fondos` es plata sacada de fondos (suma al saldo, no es ingreso nuevo).',
    '`pendientes` son los ingresos esperando aprobación humana. ciclo YYYY-MM opcional, default el',
    'ciclo actual. Solo lectura.',
    NOTA_INGRESOS,
  ].join(' '),
  annotations: { title: 'Resumen de ingresos', readOnlyHint: true, openWorldHint: false },
  schema: z.strictObject({
    ciclo: periodoSchema.optional().describe('Ciclo financiero YYYY-MM. Default: ciclo actual'),
  }),
  async handler(input, deps) {
    const hoy = hoyLocal(deps.ahora())
    const ciclo = input.ciclo || undefined
    const resumen = await deps.resumenIngresosCiclo(ciclo, { hoy })
    if (resumen.error) throw new ErrorTool(resumen.code || 'validacion', resumen.error)
    const pendientes = await deps.listarPendientes()
    return { data: { ...resumen, pendientes }, meta: { ciclo_default: !input.ciclo } }
  },
}

export const TOOLS_INGRESOS = [registrarIngreso, resumenIngresos]

export const depsIngresos = {
  buscarIngresosSimilares,
  crearIngreso,
  resumenIngresosCiclo,
  listarPendientes,
}
