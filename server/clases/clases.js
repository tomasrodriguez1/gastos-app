// Clases particulares (DEC-019): alumnos, clases y pagos. Módulo propio, separado de gastos y
// presupuesto. Único contacto con las finanzas: registrarPago crea un `ingreso` real
// (fuente "Clases particulares", origen 'clases') en la misma transacción que marca las clases
// pagadas; deshacerPago lo borra. La deuda no se persiste: Σ monto de clases dictadas y
// pendientes de cobro.
//
// Todo el SQL del módulo vive acá (la UI y las tools MCP delegan). Cada función recibe `db`
// para poder correr contra otra conexión en tests y devuelve el resultado o
// { error, status, code } con code ∈ validacion | no_encontrado | conflicto.

import sql from '../db/client.js'
import { crearIngreso } from '../ingresos.js'
import { obtenerCicloFinanciero } from '../../src/utils/ciclos.js'

export const FUENTE_INGRESO_CLASES = 'Clases particulares'
export const MODALIDADES = ['presencial', 'online']
export const ESTADOS = ['programada', 'dictada', 'cancelada']
export const COBROS = ['pendiente', 'pagado']
export const PRECIO_HORA_NORMAL = 25000

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_DURACION_MINUTOS = 600

const fallo = (code, error, extra = {}) => ({
  error,
  code,
  status: code === 'no_encontrado' ? 404 : code === 'conflicto' ? 409 : 400,
  ...extra,
})
const validacion = (error, extra) => fallo('validacion', error, extra)
const conflicto = (error, extra) => fallo('conflicto', error, extra)
const noEncontrado = (error) => fallo('no_encontrado', error)

// Fecha local del proceso (Railway corre en hora de Chile), igual que obtenerCicloActual.
export function hoyLocal(ahora = new Date()) {
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-')
}

export function fechaValida(fecha) {
  try {
    obtenerCicloFinanciero(fecha)
    return true
  } catch {
    return false
  }
}

export const horaValida = (hora) => typeof hora === 'string' && HORA_RE.test(hora)

// monto = precio_hora × horas, entero CLP.
export function calcularMonto(precioHora, duracionMinutos) {
  return Math.round((precioHora * duracionMinutos) / 60)
}

const textoONull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0
const entero = (v) => (v == null ? 0 : Number(v))

function validarPrecio(precio, campo = 'precio_hora') {
  const n = Number(precio)
  if (!Number.isInteger(n) || n < 0) return `${campo} tiene que ser un entero CLP ≥ 0`
  return null
}

function validarDuracion(minutos) {
  const n = Number(minutos)
  if (!Number.isInteger(n) || n <= 0 || n > MAX_DURACION_MINUTOS) {
    return `duración inválida: tiene que ser entre 1 y ${MAX_DURACION_MINUTOS} minutos`
  }
  return null
}

// ─── Serialización ───────────────────────────────────────────────────────────

export function serializarAlumno(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    precio_hora_default: entero(row.precio_hora_default),
    activo: row.activo,
  }
}

export function serializarClase(row) {
  return {
    id: row.id,
    alumno_id: row.alumno_id,
    alumno: row.alumno ?? null,
    fecha: row.fecha,
    hora_inicio: row.hora_inicio,
    duracion_minutos: row.duracion_minutos,
    horas: row.duracion_minutos / 60,
    modalidad: row.modalidad,
    precio_hora: entero(row.precio_hora),
    monto: entero(row.monto),
    estado: row.estado,
    dictada: row.estado === 'dictada',
    cobro: row.cobro,
    pago_id: row.pago_id ?? null,
    nota: row.nota || null,
    notion_status: row.notion_status || null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ?? null,
  }
}

function serializarPago(row) {
  return {
    id: row.id,
    alumno_id: row.alumno_id,
    alumno: row.alumno ?? null,
    fecha: row.fecha,
    monto: entero(row.monto),
    ingreso_id: row.ingreso_id ?? null,
    ciclo_financiero: row.ciclo_financiero ?? null,
    clases: (row.clases || []).filter(c => c && c.id != null),
  }
}

const SELECT_CLASE = (db) => db`
  SELECT c.*, a.nombre AS alumno, pc.pago_id
  FROM clase c
  JOIN alumno a ON a.id = c.alumno_id
  LEFT JOIN pago_clase pc ON pc.clase_id = c.id
`

async function leerClase(id, db) {
  const [row] = await db`${SELECT_CLASE(db)} WHERE c.id = ${Number(id)}`
  return row || null
}

// ─── Alumnos ─────────────────────────────────────────────────────────────────

export async function listarAlumnos({ incluirInactivos = true } = {}, db = sql) {
  const rows = incluirInactivos
    ? await db`SELECT * FROM alumno ORDER BY activo DESC, nombre`
    : await db`SELECT * FROM alumno WHERE activo ORDER BY nombre`
  return rows.map(serializarAlumno)
}

async function buscarAlumnoPorNombre(nombre, db) {
  const [row] = await db`SELECT * FROM alumno WHERE lower(nombre) = lower(${nombre.trim()})`
  return row || null
}

// Resuelve el alumno por id o por nombre exacto (sin distinguir mayúsculas; no normaliza
// acentos ni corrige nombres: "Javiera" y "Julieta" son alumnos distintos).
export async function resolverAlumno({ alumno_id, alumno } = {}, db = sql) {
  if (alumno_id != null) {
    if (!idValido(alumno_id)) return validacion('alumno_id inválido')
    const [row] = await db`SELECT * FROM alumno WHERE id = ${Number(alumno_id)}`
    return row ? { alumno: row } : noEncontrado(`No existe el alumno con id ${alumno_id}`)
  }
  if (typeof alumno === 'string' && alumno.trim()) {
    const row = await buscarAlumnoPorNombre(alumno, db)
    return row ? { alumno: row } : noEncontrado(`No existe el alumno "${alumno.trim()}". Crealo primero.`)
  }
  return validacion('Falta el alumno (alumno_id o nombre)')
}

// Alta idempotente por nombre: si ya existe devuelve ese alumno (existente=true) y, si estaba
// desactivado, lo reactiva. No pisa su precio por hora.
export async function crearAlumno({ nombre, precio_hora_default = PRECIO_HORA_NORMAL } = {}, db = sql) {
  const nombreLimpio = textoONull(nombre)
  if (!nombreLimpio) return validacion('Falta el nombre del alumno')
  if (nombreLimpio.length > 120) return validacion('Nombre demasiado largo')
  const precio = Number(precio_hora_default)
  if (!Number.isInteger(precio) || precio <= 0) return validacion('precio_hora_default tiene que ser un entero CLP > 0')

  const [insertado] = await db`
    INSERT INTO alumno (nombre, precio_hora_default)
    VALUES (${nombreLimpio}, ${precio})
    ON CONFLICT DO NOTHING
    RETURNING *
  `
  if (insertado) return { alumno: serializarAlumno(insertado), existente: false, reactivado: false }

  const existente = await buscarAlumnoPorNombre(nombreLimpio, db)
  if (!existente) return conflicto('No se pudo crear el alumno')
  if (!existente.activo) {
    const [row] = await db`UPDATE alumno SET activo = true, updated_at = NOW() WHERE id = ${existente.id} RETURNING *`
    return { alumno: serializarAlumno(row), existente: true, reactivado: true }
  }
  return { alumno: serializarAlumno(existente), existente: true, reactivado: false }
}

export async function editarAlumno(id, cambios = {}, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  const [actual] = await db`SELECT * FROM alumno WHERE id = ${Number(id)}`
  if (!actual) return noEncontrado('Alumno no encontrado')

  const nombre = cambios.nombre !== undefined ? textoONull(cambios.nombre) : actual.nombre
  if (!nombre) return validacion('El nombre no puede quedar vacío')
  const precio = cambios.precio_hora_default !== undefined ? Number(cambios.precio_hora_default) : actual.precio_hora_default
  if (!Number.isInteger(precio) || precio <= 0) return validacion('precio_hora_default tiene que ser un entero CLP > 0')
  const activo = cambios.activo !== undefined ? Boolean(cambios.activo) : actual.activo

  if (nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
    const otro = await buscarAlumnoPorNombre(nombre, db)
    if (otro) return conflicto(`Ya existe un alumno llamado "${otro.nombre}"`)
  }

  const [row] = await db`
    UPDATE alumno SET nombre = ${nombre}, precio_hora_default = ${precio}, activo = ${activo}, updated_at = NOW()
    WHERE id = ${actual.id}
    RETURNING *
  `
  return { alumno: serializarAlumno(row) }
}

// ─── Clases ──────────────────────────────────────────────────────────────────

export async function buscarClases(filtros = {}, db = sql) {
  const {
    alumno_id, alumno, desde, hasta, estado, cobro, actualizada_desde,
    limite = 100, offset = 0,
  } = filtros
  if (desde && !fechaValida(desde)) return validacion(`desde: fecha inválida (${desde})`)
  if (hasta && !fechaValida(hasta)) return validacion(`hasta: fecha inválida (${hasta})`)
  if (desde && hasta && desde > hasta) return validacion(`desde (${desde}) es posterior a hasta (${hasta})`)
  if (estado && !ESTADOS.includes(estado)) return validacion(`estado debe ser uno de: ${ESTADOS.join(', ')}`)
  if (cobro && !COBROS.includes(cobro)) return validacion(`cobro debe ser uno de: ${COBROS.join(', ')}`)
  let actualizadaDesde = null
  if (actualizada_desde) {
    const d = new Date(actualizada_desde)
    if (Number.isNaN(d.getTime())) return validacion(`actualizada_desde inválida (${actualizada_desde})`)
    actualizadaDesde = d
  }
  if (alumno_id != null && !idValido(alumno_id)) return validacion('alumno_id inválido')
  const lim = Math.min(Math.max(Number(limite) || 100, 1), 1000)
  const off = Math.max(Number(offset) || 0, 0)

  const vacio = db``
  const rows = await db`
    SELECT c.*, a.nombre AS alumno, pc.pago_id, COUNT(*) OVER () AS total
    FROM clase c
    JOIN alumno a ON a.id = c.alumno_id
    LEFT JOIN pago_clase pc ON pc.clase_id = c.id
    WHERE true
      ${alumno_id != null ? db`AND c.alumno_id = ${Number(alumno_id)}` : vacio}
      ${typeof alumno === 'string' && alumno.trim() ? db`AND a.nombre ILIKE ${'%' + alumno.trim() + '%'}` : vacio}
      ${desde ? db`AND c.fecha >= ${desde}` : vacio}
      ${hasta ? db`AND c.fecha <= ${hasta}` : vacio}
      ${estado ? db`AND c.estado = ${estado}` : vacio}
      ${cobro ? db`AND c.cobro = ${cobro}` : vacio}
      ${actualizadaDesde ? db`AND c.updated_at >= ${actualizadaDesde}` : vacio}
    ORDER BY c.fecha, c.hora_inicio, c.id
    LIMIT ${lim} OFFSET ${off}
  `
  const total = rows.length ? Number(rows[0].total) : 0
  return {
    filas: rows.map(serializarClase),
    meta: { total, devueltos: rows.length, offset: off, limite: lim, truncado: off + rows.length < total },
  }
}

export async function obtenerClase(id, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  const row = await leerClase(id, db)
  return row ? { clase: serializarClase(row) } : noEncontrado(`No existe la clase ${id}`)
}

// Nueva clase programada y pendiente de cobro. Precio por hora = el del alumno salvo que se pase
// otro; queda congelado en la clase.
export async function agendarClase(datos = {}, db = sql) {
  const { fecha, hora_inicio, duracion_minutos = 60, modalidad = 'presencial', precio_hora, nota } = datos
  if (!fechaValida(fecha)) return validacion(`Fecha inválida (${fecha ?? 'vacía'}): usá YYYY-MM-DD`)
  if (!horaValida(hora_inicio)) return validacion(`Hora inválida (${hora_inicio ?? 'vacía'}): usá HH:MM, 24 h`)
  const errDuracion = validarDuracion(duracion_minutos)
  if (errDuracion) return validacion(errDuracion)
  if (!MODALIDADES.includes(modalidad)) return validacion(`modalidad debe ser ${MODALIDADES.join(' u ')}`)
  if (precio_hora != null) {
    const errPrecio = validarPrecio(precio_hora)
    if (errPrecio) return validacion(errPrecio)
  }

  const r = await resolverAlumno(datos, db)
  if (r.error) return r
  if (!r.alumno.activo) return conflicto(`El alumno "${r.alumno.nombre}" está desactivado`)

  // Reintentos del agente: la misma clase (alumno, día y hora) no se agenda dos veces.
  const [repetida] = await db`
    SELECT id FROM clase
    WHERE alumno_id = ${r.alumno.id} AND fecha = ${fecha} AND hora_inicio = ${hora_inicio} AND estado <> 'cancelada'
  `
  if (repetida) {
    return conflicto(`Ya hay una clase de ${r.alumno.nombre} el ${fecha} a las ${hora_inicio} (id ${repetida.id})`, { clase_id: repetida.id })
  }

  const precioHora = precio_hora != null ? Number(precio_hora) : r.alumno.precio_hora_default
  const minutos = Number(duracion_minutos)
  const [insertada] = await db`
    INSERT INTO clase (alumno_id, fecha, hora_inicio, duracion_minutos, modalidad, precio_hora, monto, nota)
    VALUES (${r.alumno.id}, ${fecha}, ${hora_inicio}, ${minutos}, ${modalidad}, ${precioHora},
            ${calcularMonto(precioHora, minutos)}, ${textoONull(nota)})
    RETURNING id
  `
  return { clase: serializarClase(await leerClase(insertada.id, db)) }
}

function rechazoPorEstado(clase, accion) {
  if (clase.cobro === 'pagado') return conflicto(`La clase ${clase.id} ya está pagada: no se puede ${accion}`)
  if (clase.estado === 'cancelada') return conflicto(`La clase ${clase.id} está cancelada: no se puede ${accion}`)
  if (clase.estado === 'dictada') return conflicto(`La clase ${clase.id} ya se dictó: no se puede ${accion}`)
  return conflicto(`La clase ${clase.id} no se puede ${accion}`)
}

// Solo una clase programada y sin cobrar: fecha, hora, duración, modalidad, precio por hora y
// nota. Recalcula el monto.
export async function moverClase(id, cambios = {}, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  const actual = await leerClase(id, db)
  if (!actual) return noEncontrado(`No existe la clase ${id}`)
  if (actual.estado !== 'programada' || actual.cobro !== 'pendiente') return rechazoPorEstado(actual, 'mover')

  const fecha = cambios.fecha ?? actual.fecha
  const hora = cambios.hora_inicio ?? actual.hora_inicio
  const minutos = cambios.duracion_minutos != null ? Number(cambios.duracion_minutos) : actual.duracion_minutos
  const modalidad = cambios.modalidad ?? actual.modalidad
  const precioHora = cambios.precio_hora != null ? Number(cambios.precio_hora) : entero(actual.precio_hora)
  const nota = cambios.nota !== undefined ? textoONull(cambios.nota) : actual.nota

  if (!fechaValida(fecha)) return validacion(`Fecha inválida (${fecha})`)
  if (!horaValida(hora)) return validacion(`Hora inválida (${hora}): usá HH:MM, 24 h`)
  const errDuracion = validarDuracion(minutos)
  if (errDuracion) return validacion(errDuracion)
  if (!MODALIDADES.includes(modalidad)) return validacion(`modalidad debe ser ${MODALIDADES.join(' u ')}`)
  const errPrecio = validarPrecio(precioHora)
  if (errPrecio) return validacion(errPrecio)

  // Condición repetida en el UPDATE: si otro request la marcó dictada o la pagó entremedio, no
  // se pisa.
  const [row] = await db`
    UPDATE clase SET
      fecha = ${fecha}, hora_inicio = ${hora}, duracion_minutos = ${minutos}, modalidad = ${modalidad},
      precio_hora = ${precioHora}, monto = ${calcularMonto(precioHora, minutos)}, nota = ${nota},
      updated_at = NOW()
    WHERE id = ${actual.id} AND estado = 'programada' AND cobro = 'pendiente'
    RETURNING id
  `
  if (!row) return conflicto(`La clase ${actual.id} cambió mientras se editaba; volvé a cargarla`)
  return { clase: serializarClase(await leerClase(actual.id, db)) }
}

// programada → dictada. No toca el cobro.
export async function marcarDictada(id, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  const [row] = await db`
    UPDATE clase SET estado = 'dictada', updated_at = NOW()
    WHERE id = ${Number(id)} AND estado = 'programada'
    RETURNING id
  `
  const actual = await leerClase(id, db)
  if (!actual) return noEncontrado(`No existe la clase ${id}`)
  if (!row) {
    if (actual.estado === 'dictada') return conflicto(`La clase ${actual.id} ya estaba dictada`)
    return conflicto(`La clase ${actual.id} está cancelada: no se puede marcar dictada`)
  }
  return { clase: serializarClase(actual) }
}

// → cancelada, solo si no está pagada. No se borra.
export async function cancelarClase(id, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  const [row] = await db`
    UPDATE clase SET estado = 'cancelada', updated_at = NOW()
    WHERE id = ${Number(id)} AND cobro = 'pendiente' AND estado <> 'cancelada'
    RETURNING id
  `
  const actual = await leerClase(id, db)
  if (!actual) return noEncontrado(`No existe la clase ${id}`)
  if (!row) {
    if (actual.cobro === 'pagado') return conflicto(`La clase ${actual.id} ya está pagada: no se puede cancelar`)
    return conflicto(`La clase ${actual.id} ya estaba cancelada`)
  }
  return { clase: serializarClase(actual) }
}

// Borra una clase sin cobrar (cualquier estado). Una pagada no se borra: primero se deshace el
// pago. Si vino del import, su notion_id queda en clase_import_descartada para que reimportar no
// la reviva. Solo desde la UI: no hay tool MCP que borre.
export async function eliminarClase(id, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  return db.begin(async (tx) => {
    const [actual] = await tx`SELECT * FROM clase WHERE id = ${Number(id)} FOR UPDATE`
    if (!actual) return noEncontrado(`No existe la clase ${id}`)
    if (actual.cobro === 'pagado') {
      return conflicto(`La clase ${actual.id} está pagada: deshacé el pago antes de eliminarla`)
    }
    await tx`DELETE FROM clase WHERE id = ${actual.id}`
    if (actual.notion_id) {
      await tx`INSERT INTO clase_import_descartada (notion_id) VALUES (${actual.notion_id}) ON CONFLICT DO NOTHING`
    }
    return { ok: true, id: actual.id }
  })
}

// ─── Pagos ───────────────────────────────────────────────────────────────────

function notaPago(nombre, clases) {
  const fechas = clases.map(c => c.fecha).sort()
  return `${nombre}: ${fechas.join(', ')}`
}

// Un pago cubre N clases dictadas y pendientes del mismo alumno; monto = Σ clase.monto (sin
// parciales). En una transacción: ingreso → pago → pago_clase → clases pagadas. Si algo falla
// no queda nada escrito. `monto` es opcional: si viene y no coincide con la suma, se rechaza.
export async function registrarPago({ claseIds, fecha, monto, hoy = hoyLocal() } = {}, db = sql) {
  const lista = Array.isArray(claseIds) ? claseIds : []
  if (lista.length === 0) return validacion('Faltan las clases a pagar')
  if (!lista.every(idValido)) return validacion('Ids de clase inválidos')
  const ids = [...new Set(lista.map(Number))]
  if (!fechaValida(fecha)) return validacion(`Fecha de pago inválida (${fecha ?? 'vacía'}): usá YYYY-MM-DD`)
  if (fecha > hoy) return validacion(`La fecha de pago ${fecha} es futura (hoy es ${hoy})`)

  return db.begin(async (tx) => {
    const rows = await tx`
      SELECT c.*, a.nombre AS alumno
      FROM clase c JOIN alumno a ON a.id = c.alumno_id
      WHERE c.id = ANY(${ids})
      ORDER BY c.fecha, c.hora_inicio
      FOR UPDATE OF c
    `
    const encontradas = new Set(rows.map(r => r.id))
    const faltan = ids.filter(id => !encontradas.has(id))
    if (faltan.length) return noEncontrado(`No existen las clases: ${faltan.join(', ')}`)

    const alumnos = new Set(rows.map(r => r.alumno_id))
    if (alumnos.size > 1) {
      return validacion(`Un pago es de un solo alumno; estas clases son de ${[...new Set(rows.map(r => r.alumno))].join(', ')}`)
    }
    const noPagables = rows.filter(r => r.estado !== 'dictada' || r.cobro !== 'pendiente')
    if (noPagables.length) {
      const detalle = noPagables.map(r => `${r.id} (${r.cobro === 'pagado' ? 'ya pagada' : r.estado})`).join(', ')
      return conflicto(`Solo se pagan clases dictadas y sin cobrar. No se pueden pagar: ${detalle}`)
    }

    const total = rows.reduce((s, r) => s + entero(r.monto), 0)
    if (monto != null && Number(monto) !== total) {
      return validacion(`El monto (${monto}) no coincide con la suma de las clases (${total}); no hay pagos parciales`)
    }
    if (total <= 0) return validacion('Las clases suman $0: no hay nada que cobrar')

    const { alumno, alumno_id: alumnoId } = rows[0]
    const ingreso = await crearIngreso({
      fecha,
      fuente: FUENTE_INGRESO_CLASES,
      monto: total,
      nota: notaPago(alumno, rows),
      origen: 'clases',
    }, tx)
    // crearIngreso ya validó todo lo que podía fallar; si igual devuelve error, se aborta la
    // transacción para no dejar el pago a medias.
    if (ingreso.error) throw new Error(`No se pudo crear el ingreso: ${ingreso.error}`)

    const [pago] = await tx`
      INSERT INTO pago (alumno_id, fecha, monto, ingreso_id)
      VALUES (${alumnoId}, ${fecha}, ${total}, ${ingreso.ingreso.id})
      RETURNING *
    `
    await tx`INSERT INTO pago_clase ${tx(rows.map(r => ({ pago_id: pago.id, clase_id: r.id })))}`
    await tx`UPDATE clase SET cobro = 'pagado', updated_at = NOW() WHERE id = ANY(${ids})`

    return {
      pago: serializarPago({
        ...pago,
        alumno,
        ciclo_financiero: ingreso.ingreso.ciclo_financiero,
        clases: rows.map(r => ({ id: r.id, fecha: r.fecha, monto: entero(r.monto) })),
      }),
      ingreso: ingreso.ingreso,
    }
  })
}

// Solo desde la UI (no hay tool MCP): las clases vuelven a pendiente y se borra el ingreso.
export async function deshacerPago(id, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  return db.begin(async (tx) => {
    const [pago] = await tx`SELECT * FROM pago WHERE id = ${Number(id)} FOR UPDATE`
    if (!pago) return noEncontrado(`No existe el pago ${id}`)
    if (!pago.ingreso_id) return conflicto('Este pago no tiene ingreso vinculado y no se puede deshacer desde la app')

    const clases = await tx`SELECT clase_id FROM pago_clase WHERE pago_id = ${pago.id}`
    const ids = clases.map(c => c.clase_id)
    if (ids.length) await tx`UPDATE clase SET cobro = 'pendiente', updated_at = NOW() WHERE id = ANY(${ids})`
    await tx`DELETE FROM pago WHERE id = ${pago.id}`
    await tx`DELETE FROM ingreso WHERE id = ${pago.ingreso_id}`
    return { ok: true, clases_revertidas: ids, ingreso_eliminado: pago.ingreso_id }
  })
}

export async function listarPagos({ alumno_id, desde, hasta, limite = 50 } = {}, db = sql) {
  if (desde && !fechaValida(desde)) return validacion(`desde: fecha inválida (${desde})`)
  if (hasta && !fechaValida(hasta)) return validacion(`hasta: fecha inválida (${hasta})`)
  if (alumno_id != null && !idValido(alumno_id)) return validacion('alumno_id inválido')
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 500)
  const vacio = db``
  const rows = await db`
    SELECT p.*, a.nombre AS alumno, i.ciclo_financiero,
      COALESCE(json_agg(json_build_object('id', c.id, 'fecha', c.fecha, 'monto', c.monto) ORDER BY c.fecha)
        FILTER (WHERE c.id IS NOT NULL), '[]') AS clases
    FROM pago p
    JOIN alumno a ON a.id = p.alumno_id
    LEFT JOIN ingreso i ON i.id = p.ingreso_id
    LEFT JOIN pago_clase pc ON pc.pago_id = p.id
    LEFT JOIN clase c ON c.id = pc.clase_id
    WHERE true
      ${alumno_id != null ? db`AND p.alumno_id = ${Number(alumno_id)}` : vacio}
      ${desde ? db`AND p.fecha >= ${desde}` : vacio}
      ${hasta ? db`AND p.fecha <= ${hasta}` : vacio}
    GROUP BY p.id, a.nombre, i.ciclo_financiero
    ORDER BY p.fecha DESC, p.id DESC
    LIMIT ${lim}
  `
  return { pagos: rows.map(serializarPago) }
}

// ─── Resúmenes ───────────────────────────────────────────────────────────────

// Horas y montos de clases por fecha de la clase; cobrado por fecha del pago. La deuda es la
// actual (no depende del rango): dictada + pendiente, con la clase impaga más vieja.
// Las clases importadas ya pagadas no tienen fila en `pago`, así que no suman a `cobrado`.
export async function resumenClases({ desde, hasta } = {}, db = sql) {
  if (desde && !fechaValida(desde)) return validacion(`desde: fecha inválida (${desde})`)
  if (hasta && !fechaValida(hasta)) return validacion(`hasta: fecha inválida (${hasta})`)
  if (desde && hasta && desde > hasta) return validacion(`desde (${desde}) es posterior a hasta (${hasta})`)
  const vacio = db``
  const enRango = (col) => db`
    ${desde ? db`AND ${db(col)} >= ${desde}` : vacio}
    ${hasta ? db`AND ${db(col)} <= ${hasta}` : vacio}
  `

  const [[clases], [cobrado], deuda] = await Promise.all([
    db`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'dictada')::int AS clases_dictadas,
        COALESCE(SUM(duracion_minutos) FILTER (WHERE estado = 'dictada'), 0)::int AS minutos_dictados,
        COALESCE(SUM(monto) FILTER (WHERE estado = 'dictada'), 0)::bigint AS monto_dictado,
        COUNT(*) FILTER (WHERE estado = 'programada')::int AS clases_programadas,
        COALESCE(SUM(duracion_minutos) FILTER (WHERE estado = 'programada'), 0)::int AS minutos_programados
      FROM clase WHERE true ${enRango('fecha')}
    `,
    db`
      SELECT COUNT(*)::int AS pagos, COALESCE(SUM(monto), 0)::bigint AS total
      FROM pago WHERE true ${enRango('fecha')}
    `,
    db`
      SELECT a.id AS alumno_id, a.nombre AS alumno, SUM(c.monto)::bigint AS deuda,
        MIN(c.fecha) AS desde, COUNT(*)::int AS clases
      FROM clase c JOIN alumno a ON a.id = c.alumno_id
      WHERE c.estado = 'dictada' AND c.cobro = 'pendiente'
      GROUP BY a.id, a.nombre
      ORDER BY deuda DESC, a.nombre
    `,
  ])

  const deudaPorAlumno = deuda.map(d => ({
    alumno_id: d.alumno_id,
    alumno: d.alumno,
    deuda: Number(d.deuda),
    desde: d.desde,
    clases: d.clases,
  }))
  return {
    rango: { desde: desde || null, hasta: hasta || null },
    horas_dictadas: clases.minutos_dictados / 60,
    clases_dictadas: clases.clases_dictadas,
    monto_dictado: Number(clases.monto_dictado),
    horas_programadas: clases.minutos_programados / 60,
    clases_programadas: clases.clases_programadas,
    cobrado: Number(cobrado.total),
    pagos: cobrado.pagos,
    deuda_total: deudaPorAlumno.reduce((s, d) => s + d.deuda, 0),
    deuda_por_alumno: deudaPorAlumno,
  }
}

// Ingresos de clases del ciclo financiero (por fecha de pago), desde la tabla `ingreso`.
export async function ingresosClasesCiclo(ciclo, db = sql) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ciclo || '')) return validacion('ciclo debe ser YYYY-MM')
  const [row] = await db`
    SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(monto), 0)::float8 AS total
    FROM ingreso WHERE ciclo_financiero = ${ciclo} AND fuente = ${FUENTE_INGRESO_CLASES}
  `
  return { ciclo, total: Number(row.total), cantidad: row.cantidad }
}
