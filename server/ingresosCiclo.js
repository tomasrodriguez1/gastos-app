// Lo de ingresos que cruza con clases particulares (por eso no vive en ingresos.js, que clases.js
// importa): aprobar/descartar un ingreso pendiente (el de un pago de clases se aprueba
// confirmando el pago completo), la lista "por aprobar" y el resumen previsto vs real de un ciclo
// que usan el Dashboard, /ingresos y la tool MCP resumen_ingresos. Ver DEC-020.

import sql from './db/client.js'
import { toMonto } from './db/numeric.js'
import {
  FUENTE_CLASES, confirmarIngreso, descartarIngreso, listarFuentes, serializarIngreso,
} from './ingresos.js'
import { confirmarPago, deshacerPago, resumenClases, hoyLocal } from './clases/clases.js'
import { obtenerCicloActual, obtenerRangoCiclo } from '../src/utils/ciclos.js'

const fallo = (status, error, code) => ({ error, status, code })

async function leerIngreso(id, db) {
  const ingresoId = Number(id)
  if (!Number.isInteger(ingresoId) || ingresoId <= 0) return { falla: fallo(400, 'Id inválido', 'validacion') }
  const [ingreso] = await db`SELECT * FROM ingreso WHERE id = ${ingresoId}`
  if (!ingreso) return { falla: fallo(404, 'No encontrado', 'no_encontrado') }
  return { ingreso }
}

async function pagoDeIngreso(ingresoId, db) {
  const [pago] = await db`SELECT id FROM pago WHERE ingreso_id = ${ingresoId}`
  return pago || null
}

// Aprueba un ingreso pendiente. Uno de clases se aprueba confirmando su pago: pago, ingreso y
// clases pagadas cambian juntos.
export async function aprobarIngreso(id, db = sql) {
  const { ingreso, falla } = await leerIngreso(id, db)
  if (falla) return falla
  if (ingreso.origen !== 'clases') return confirmarIngreso(ingreso.id, db)

  const pago = await pagoDeIngreso(ingreso.id, db)
  if (!pago) return fallo(409, 'Este ingreso de clases no tiene pago vinculado', 'conflicto')
  const r = await confirmarPago(pago.id, db)
  if (r.error) return r
  const [row] = await db`SELECT * FROM ingreso WHERE id = ${ingreso.id}`
  return { ingreso: serializarIngreso(row), pago_id: pago.id }
}

// Descarta un ingreso pendiente. Uno de clases se descarta deshaciendo su pago.
export async function descartarPendiente(id, db = sql) {
  const { ingreso, falla } = await leerIngreso(id, db)
  if (falla) return falla
  if (ingreso.origen !== 'clases') return descartarIngreso(ingreso.id, db)
  if (ingreso.estado !== 'pendiente') {
    return fallo(409, 'Solo se descartan ingresos pendientes; un pago ya confirmado se deshace desde /clases', 'conflicto')
  }
  const pago = await pagoDeIngreso(ingreso.id, db)
  if (!pago) return fallo(409, 'Este ingreso de clases no tiene pago vinculado', 'conflicto')
  const r = await deshacerPago(pago.id, db)
  if (r.error) return r
  return { ok: true }
}

// Ingresos pendientes de aprobación, con el detalle del pago si vienen de clases.
export async function listarPendientes(db = sql) {
  const rows = await db`
    SELECT i.*, p.id AS pago_id, a.nombre AS alumno, f.nombre AS familia,
      (SELECT COUNT(*) FROM pago_clase pc WHERE pc.pago_id = p.id)::int AS clases
    FROM ingreso i
    LEFT JOIN pago p ON p.ingreso_id = i.id
    LEFT JOIN alumno a ON a.id = p.alumno_id
    LEFT JOIN familia f ON f.id = p.familia_id
    WHERE i.estado = 'pendiente'
    ORDER BY i.fecha DESC, i.id DESC
  `
  return rows.map(r => ({
    ...serializarIngreso(r),
    pago_id: r.pago_id ?? null,
    cobrado_a: r.pago_id ? (r.alumno || (r.familia ? `Familia ${r.familia}` : null)) : null,
    clases: r.pago_id ? r.clases : null,
  }))
}

// Día esperado (1–31) dentro del ciclo 29→28: del 29 en adelante cae en el mes anterior.
export function fechaEsperadaCiclo(ciclo, dia) {
  const { desde, hasta } = obtenerRangoCiclo(ciclo)
  const candidatos = [desde.slice(0, 7), hasta.slice(0, 7)].map((mes) => {
    const [y, m] = mes.split('-').map(Number)
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
  })
  return candidatos.find(f => f >= desde && f <= hasta) || hasta
}

const clave = (nombre) => String(nombre).trim().toLowerCase()

// Previsto vs real del ciclo por fuente. `real` = ingresos confirmados; `por_aprobar` = pendientes
// (no cuentan todavía). Uso de fondos va aparte de los ingresos: suma al saldo pero no es ingreso
// nuevo. `esperado` = lo que se espera tener al cierre: para clases, lo real más lo que deben
// (solo en el ciclo actual o futuro: la deuda de hoy no es del ciclo pasado); para uso de fondos,
// solo lo real; para el resto, lo mayor entre previsto y real+por aprobar.
export async function resumenIngresosCiclo(ciclo = obtenerCicloActual(), { hoy = hoyLocal() } = {}, db = sql) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ciclo || '')) return fallo(400, 'ciclo debe ser YYYY-MM', 'validacion')

  const [{ existe }] = await db`SELECT to_regclass('public.presupuesto_ingreso') IS NOT NULL AS existe`
  const [fuentes, previstos, reales, clases] = await Promise.all([
    listarFuentes({}, db),
    existe ? db`SELECT fuente, monto FROM presupuesto_ingreso WHERE ciclo = ${ciclo}` : [],
    db`
      SELECT fuente, estado, SUM(monto) AS total, COUNT(*)::int AS n
      FROM ingreso WHERE ciclo_financiero = ${ciclo} GROUP BY fuente, estado
    `,
    resumenClases({}, db),
  ])
  if (clases.error) return clases

  const mapa = new Map()
  const fila = (nombre, base = {}) => {
    const k = clave(nombre)
    if (!mapa.has(k)) {
      mapa.set(k, {
        nombre, tipo: 'variable', automatica: false, dia_esperado: null, activa: true, orden: 999,
        fuera_catalogo: true, previsto: 0, real: 0, por_aprobar: 0, n_real: 0, n_por_aprobar: 0, ...base,
      })
    }
    return mapa.get(k)
  }
  for (const f of fuentes) fila(f.nombre, { ...f, fuera_catalogo: false })
  for (const p of previstos) fila(p.fuente).previsto += toMonto(p.monto)
  for (const r of reales) {
    const f = fila(r.fuente)
    if (r.estado === 'confirmado') { f.real += toMonto(r.total); f.n_real += r.n } else { f.por_aprobar += toMonto(r.total); f.n_por_aprobar += r.n }
  }

  const incluirDeuda = ciclo >= obtenerCicloActual(new Date(`${hoy}T12:00:00`))
  const filas = [...mapa.values()]
    // Una fuente desactivada solo aparece si tiene algo en el ciclo.
    .filter(f => f.activa || f.previsto || f.real || f.por_aprobar)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((f) => {
      const esClases = clave(f.nombre) === clave(FUENTE_CLASES)
      const porCobrar = esClases && incluirDeuda ? clases.deuda_total : 0
      let esperado
      if (f.tipo === 'fondos') esperado = f.real
      else if (esClases) esperado = f.real + porCobrar
      else esperado = Math.max(f.previsto, f.real + f.por_aprobar)

      let estado = 'pendiente'
      if (f.real > 0) estado = 'llego'
      else if (f.por_aprobar > 0) estado = 'por_aprobar'
      else if (f.tipo === 'fijo' && f.dia_esperado && hoy > fechaEsperadaCiclo(ciclo, f.dia_esperado)) estado = 'atrasado'

      return {
        nombre: f.nombre,
        tipo: f.tipo,
        automatica: f.automatica,
        dia_esperado: f.dia_esperado,
        fuera_catalogo: f.fuera_catalogo,
        previsto: f.previsto,
        real: f.real,
        por_aprobar: f.por_aprobar,
        esperado,
        estado,
        ...(esClases ? { por_cobrar: porCobrar, por_confirmar: f.por_aprobar } : {}),
      }
    })

  const ingresos = filas.filter(f => f.tipo !== 'fondos')
  const suma = (lista, k) => lista.reduce((s, f) => s + f[k], 0)
  return {
    ciclo,
    rango: obtenerRangoCiclo(ciclo),
    fuentes: filas,
    totales: {
      previsto: suma(ingresos, 'previsto'),
      real: suma(ingresos, 'real'),
      esperado: suma(ingresos, 'esperado'),
      por_aprobar: suma(filas, 'por_aprobar'),
      fondos: suma(filas.filter(f => f.tipo === 'fondos'), 'real'),
    },
  }
}
