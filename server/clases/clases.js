// Clases particulares (DEC-019): familias, alumnos, clases y pagos. Módulo propio, separado de gastos y
// presupuesto. Único contacto con las finanzas: registrarPago crea un `ingreso` real
// (fuente "Clases particulares", origen 'clases') en la misma transacción que marca las clases
// pagadas; deshacerPago lo borra. La deuda no se persiste: Σ monto de clases dictadas y
// pendientes de cobro.
//
// Todo el SQL del módulo vive acá (la UI y las tools MCP delegan). Cada función recibe `db`
// para poder correr contra otra conexión en tests y devuelve el resultado o
// { error, status, code } con code ∈ validacion | no_encontrado | conflicto.

import sql from '../db/client.js'
import { crearIngreso, FUENTE_CLASES } from '../ingresos.js'
import { obtenerCicloFinanciero, cicloIngresoDeClase, mesClasesDeCiclo } from '../../src/utils/ciclos.js'

export const FUENTE_INGRESO_CLASES = FUENTE_CLASES
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
    familia_id: row.familia_id ?? null,
    familia: row.familia ?? null,
    apoderado_nombre: row.apoderado_nombre ?? null,
    apoderado_telefono: row.apoderado_telefono ?? null,
  }
}

export function serializarFamilia(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    apoderado_nombre: row.apoderado_nombre || null,
    apoderado_telefono: row.apoderado_telefono || null,
    alumnos: (row.alumnos || []).filter(a => a && a.id != null),
  }
}

export function serializarClase(row) {
  return {
    id: row.id,
    alumno_id: row.alumno_id,
    alumno: row.alumno ?? null,
    familia_id: row.familia_id ?? null,
    familia: row.familia ?? null,
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
    pago_estado: row.pago_estado ?? null,
    nota: row.nota || null,
    notion_status: row.notion_status || null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ?? null,
  }
}

// `cobrado_a` es lo que se muestra: el alumno, o "Familia X" si el pago cubre a varios hermanos.
function serializarPago(row) {
  return {
    id: row.id,
    alumno_id: row.alumno_id ?? null,
    alumno: row.alumno ?? null,
    familia_id: row.familia_id ?? null,
    familia: row.familia ?? null,
    cobrado_a: row.alumno ?? (row.familia ? `Familia ${row.familia}` : null),
    fecha: row.fecha,
    monto: entero(row.monto),
    estado: row.estado || 'confirmado',
    ingreso_id: row.ingreso_id ?? null,
    ciclo_financiero: row.ciclo_financiero ?? null,
    clases: (row.clases || []).filter(c => c && c.id != null),
  }
}

const SELECT_CLASE = (db) => db`
  SELECT c.*, a.nombre AS alumno, a.familia_id, f.nombre AS familia, pc.pago_id, pg.estado AS pago_estado
  FROM clase c
  JOIN alumno a ON a.id = c.alumno_id
  LEFT JOIN familia f ON f.id = a.familia_id
  LEFT JOIN pago_clase pc ON pc.clase_id = c.id
  LEFT JOIN pago pg ON pg.id = pc.pago_id
`

async function leerClase(id, db) {
  const [row] = await db`${SELECT_CLASE(db)} WHERE c.id = ${Number(id)}`
  return row || null
}

// ─── Alumnos ─────────────────────────────────────────────────────────────────

const SELECT_ALUMNO = (db) => db`
  SELECT a.*, f.nombre AS familia, f.apoderado_nombre, f.apoderado_telefono
  FROM alumno a LEFT JOIN familia f ON f.id = a.familia_id
`

async function leerAlumno(id, db) {
  const [row] = await db`${SELECT_ALUMNO(db)} WHERE a.id = ${Number(id)}`
  return row || null
}

export async function listarAlumnos({ incluirInactivos = true } = {}, db = sql) {
  const rows = incluirInactivos
    ? await db`${SELECT_ALUMNO(db)} ORDER BY a.activo DESC, a.nombre`
    : await db`${SELECT_ALUMNO(db)} WHERE a.activo ORDER BY a.nombre`
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
  let familiaId = actual.familia_id
  if (cambios.familia_id !== undefined) {
    if (cambios.familia_id === null || cambios.familia_id === '') familiaId = null
    else {
      if (!idValido(cambios.familia_id)) return validacion('familia_id inválido')
      const [familia] = await db`SELECT id FROM familia WHERE id = ${Number(cambios.familia_id)}`
      if (!familia) return noEncontrado(`No existe la familia ${cambios.familia_id}`)
      familiaId = familia.id
    }
  }

  if (nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
    const otro = await buscarAlumnoPorNombre(nombre, db)
    if (otro) return conflicto(`Ya existe un alumno llamado "${otro.nombre}"`)
  }

  const [row] = await db`
    UPDATE alumno SET nombre = ${nombre}, precio_hora_default = ${precio}, activo = ${activo},
      familia_id = ${familiaId}, updated_at = NOW()
    WHERE id = ${actual.id}
    RETURNING id
  `
  return { alumno: serializarAlumno(await leerAlumno(row.id, db)) }
}

// ─── Familias ────────────────────────────────────────────────────────────────
// Cuenta de cobro: agrupa hermanos y guarda al apoderado (nombre y WhatsApp).

function datosFamilia(datos, actual = {}) {
  const nombre = datos.nombre !== undefined ? textoONull(datos.nombre) : actual.nombre
  if (!nombre) return { error: 'Falta el nombre de la familia' }
  if (nombre.length > 120) return { error: 'Nombre demasiado largo' }
  const apoderado = datos.apoderado_nombre !== undefined ? textoONull(datos.apoderado_nombre) : actual.apoderado_nombre ?? null
  const telefono = datos.apoderado_telefono !== undefined ? textoONull(datos.apoderado_telefono) : actual.apoderado_telefono ?? null
  if (telefono && !/^\+?[\d\s().-]{8,20}$/.test(telefono)) return { error: `Teléfono inválido (${telefono})` }
  return { nombre, apoderado, telefono }
}

async function leerFamilia(id, db) {
  const [row] = await db`
    SELECT f.*, COALESCE(json_agg(json_build_object('id', a.id, 'nombre', a.nombre, 'activo', a.activo) ORDER BY a.nombre)
      FILTER (WHERE a.id IS NOT NULL), '[]') AS alumnos
    FROM familia f LEFT JOIN alumno a ON a.familia_id = f.id
    WHERE f.id = ${Number(id)}
    GROUP BY f.id
  `
  return row || null
}

export async function listarFamilias(db = sql) {
  const rows = await db`
    SELECT f.*, COALESCE(json_agg(json_build_object('id', a.id, 'nombre', a.nombre, 'activo', a.activo) ORDER BY a.nombre)
      FILTER (WHERE a.id IS NOT NULL), '[]') AS alumnos
    FROM familia f LEFT JOIN alumno a ON a.familia_id = f.id
    GROUP BY f.id
    ORDER BY f.nombre
  `
  return rows.map(serializarFamilia)
}

export async function crearFamilia(datos = {}, db = sql) {
  const d = datosFamilia(datos)
  if (d.error) return validacion(d.error)
  const [row] = await db`
    INSERT INTO familia (nombre, apoderado_nombre, apoderado_telefono)
    VALUES (${d.nombre}, ${d.apoderado}, ${d.telefono})
    ON CONFLICT DO NOTHING
    RETURNING id
  `
  if (!row) return conflicto(`Ya existe la familia "${d.nombre}"`)
  return { familia: serializarFamilia(await leerFamilia(row.id, db)) }
}

export async function editarFamilia(id, cambios = {}, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  const [actual] = await db`SELECT * FROM familia WHERE id = ${Number(id)}`
  if (!actual) return noEncontrado('Familia no encontrada')
  const d = datosFamilia(cambios, actual)
  if (d.error) return validacion(d.error)
  if (d.nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
    const [otra] = await db`SELECT id FROM familia WHERE lower(nombre) = lower(${d.nombre})`
    if (otra) return conflicto(`Ya existe la familia "${d.nombre}"`)
  }
  await db`
    UPDATE familia SET nombre = ${d.nombre}, apoderado_nombre = ${d.apoderado}, apoderado_telefono = ${d.telefono},
      updated_at = NOW()
    WHERE id = ${actual.id}
  `
  return { familia: serializarFamilia(await leerFamilia(actual.id, db)) }
}

// Solo una familia vacía (sin alumnos ni pagos): sirve para corregir una creada por error.
export async function eliminarFamilia(id, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  const [actual] = await db`
    SELECT f.id,
      (SELECT COUNT(*) FROM alumno WHERE familia_id = f.id)::int AS alumnos,
      (SELECT COUNT(*) FROM pago WHERE familia_id = f.id)::int AS pagos
    FROM familia f WHERE f.id = ${Number(id)}
  `
  if (!actual) return noEncontrado('Familia no encontrada')
  if (actual.alumnos || actual.pagos) return conflicto('La familia tiene alumnos o pagos: sacá a los alumnos primero')
  await db`DELETE FROM familia WHERE id = ${actual.id}`
  return { ok: true }
}

// ─── Clases ──────────────────────────────────────────────────────────────────

export async function buscarClases(filtros = {}, db = sql) {
  const {
    alumno_id, familia_id, alumno, desde, hasta, estado, cobro, actualizada_desde, sin_pago,
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
  if (familia_id != null && !idValido(familia_id)) return validacion('familia_id inválido')
  const lim = Math.min(Math.max(Number(limite) || 100, 1), 1000)
  const off = Math.max(Number(offset) || 0, 0)

  const vacio = db``
  const rows = await db`
    SELECT c.*, a.nombre AS alumno, a.familia_id, f.nombre AS familia, pc.pago_id, pg.estado AS pago_estado,
      COUNT(*) OVER () AS total
    FROM clase c
    JOIN alumno a ON a.id = c.alumno_id
    LEFT JOIN familia f ON f.id = a.familia_id
    LEFT JOIN pago_clase pc ON pc.clase_id = c.id
    LEFT JOIN pago pg ON pg.id = pc.pago_id
    WHERE true
      ${sin_pago ? db`AND pc.pago_id IS NULL` : vacio}
      ${alumno_id != null ? db`AND c.alumno_id = ${Number(alumno_id)}` : vacio}
      ${familia_id != null ? db`AND a.familia_id = ${Number(familia_id)}` : vacio}
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
      AND NOT EXISTS (SELECT 1 FROM pago_clase pc WHERE pc.clase_id = clase.id)
    RETURNING id
  `
  const actual = await leerClase(id, db)
  if (!actual) return noEncontrado(`No existe la clase ${id}`)
  if (!row) {
    if (actual.cobro === 'pagado') return conflicto(`La clase ${actual.id} ya está pagada: no se puede cancelar`)
    if (actual.pago_id) return conflicto(`La clase ${actual.id} tiene un pago por confirmar: descartalo antes de cancelarla`)
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
    const [conPago] = await tx`SELECT pago_id FROM pago_clase WHERE clase_id = ${actual.id}`
    if (conPago) return conflicto(`La clase ${actual.id} tiene un pago por confirmar: descartalo antes de eliminarla`)
    await tx`DELETE FROM clase WHERE id = ${actual.id}`
    if (actual.notion_id) {
      await tx`INSERT INTO clase_import_descartada (notion_id) VALUES (${actual.notion_id}) ON CONFLICT DO NOTHING`
    }
    return { ok: true, id: actual.id }
  })
}

// ─── Pagos ───────────────────────────────────────────────────────────────────

// "Cristobal Mena: 2026-10-01, 2026-10-08" o, si son varios hermanos,
// "Familia Mena — Cristobal Mena: 2026-10-04; Luciano Mena: 2026-10-06".
function notaPago(clases, familia) {
  const porAlumno = new Map()
  for (const c of clases) porAlumno.set(c.alumno, [...(porAlumno.get(c.alumno) || []), c.fecha])
  const partes = [...porAlumno].map(([nombre, fechas]) => `${nombre}: ${fechas.sort().join(', ')}`)
  return porAlumno.size > 1 ? `Familia ${familia} — ${partes.join('; ')}` : partes[0]
}

// Clases agrupadas por el ciclo en que son ingreso: las del mes calendario M son del ciclo M+1
// (DEC-021). Una clase de $0 no puede ser un pago propio (pago.monto > 0): se suma al primer grupo
// con monto (siempre hay uno: registrarPago ya verificó que el total > 0).
function agruparPorCicloIngreso(rows) {
  const grupos = new Map()
  for (const r of rows) {
    const ciclo = cicloIngresoDeClase(r.fecha)
    if (!grupos.has(ciclo)) grupos.set(ciclo, [])
    grupos.get(ciclo).push(r)
  }
  const total = (clases) => clases.reduce((s, r) => s + entero(r.monto), 0)
  const ordenados = [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([ciclo, clases]) => ({ ciclo, clases }))
  const conMonto = ordenados.filter(g => total(g.clases) > 0)
  for (const g of ordenados.filter(x => total(x.clases) === 0)) conMonto[0].clases.push(...g.clases)
  return conMonto
}

// Un pago cubre N clases dictadas y pendientes de un mismo alumno o de hermanos de una misma
// familia (cuenta de cobro); monto = Σ clase.monto (sin parciales). En una transacción: ingreso →
// pago → pago_clase → clases pagadas. Si algo falla no queda nada escrito. `monto` es opcional: si
// viene y no coincide con la suma, se rechaza.
//
// El ingreso cae en el ciclo del mes siguiente a las clases (las de octubre son ingreso de
// noviembre), no en el de la fecha del pago (DEC-021). Si las clases son de meses distintos se crea
// un pago con su ingreso por cada ciclo, en la misma transacción: `pagos` e `ingresos` traen todos
// (ordenados por ciclo) y `pago` / `ingreso` el primero.
//
// porConfirmar (pagos que registra una IA por MCP, DEC-020): el pago y su ingreso nacen
// 'pendiente' y las clases siguen sin cobrar (siguen en la deuda) hasta que un humano lo confirma
// con confirmarPago. Mientras tanto no se pueden volver a pagar, mover, cancelar ni eliminar.
export async function registrarPago({ claseIds, fecha, monto, porConfirmar = false, hoy = hoyLocal() } = {}, db = sql) {
  const lista = Array.isArray(claseIds) ? claseIds : []
  if (lista.length === 0) return validacion('Faltan las clases a pagar')
  if (!lista.every(idValido)) return validacion('Ids de clase inválidos')
  const ids = [...new Set(lista.map(Number))]
  if (!fechaValida(fecha)) return validacion(`Fecha de pago inválida (${fecha ?? 'vacía'}): usá YYYY-MM-DD`)
  if (fecha > hoy) return validacion(`La fecha de pago ${fecha} es futura (hoy es ${hoy})`)

  return db.begin(async (tx) => {
    const rows = await tx`
      SELECT c.*, a.nombre AS alumno, a.familia_id, f.nombre AS familia
      FROM clase c JOIN alumno a ON a.id = c.alumno_id LEFT JOIN familia f ON f.id = a.familia_id
      WHERE c.id = ANY(${ids})
      ORDER BY c.fecha, c.hora_inicio
      FOR UPDATE OF c
    `
    const encontradas = new Set(rows.map(r => r.id))
    const faltan = ids.filter(id => !encontradas.has(id))
    if (faltan.length) return noEncontrado(`No existen las clases: ${faltan.join(', ')}`)

    const alumnos = new Set(rows.map(r => r.alumno_id))
    const familias = new Set(rows.map(r => r.familia_id))
    if (alumnos.size > 1 && (familias.size > 1 || rows[0].familia_id == null)) {
      return validacion(
        `Un pago es de un solo alumno o de hermanos de una misma familia; estas clases son de ${[...new Set(rows.map(r => r.alumno))].join(', ')}`,
      )
    }
    const noPagables = rows.filter(r => r.estado !== 'dictada' || r.cobro !== 'pendiente')
    if (noPagables.length) {
      const detalle = noPagables.map(r => `${r.id} (${r.cobro === 'pagado' ? 'ya pagada' : r.estado})`).join(', ')
      return conflicto(`Solo se pagan clases dictadas y sin cobrar. No se pueden pagar: ${detalle}`)
    }

    const conPago = await tx`SELECT clase_id, pago_id FROM pago_clase WHERE clase_id = ANY(${ids})`
    if (conPago.length) {
      return conflicto(
        `Estas clases ya tienen un pago por confirmar: ${conPago.map(c => `${c.clase_id} (pago ${c.pago_id})`).join(', ')}. Confirmalo o descartalo antes.`,
      )
    }

    const total = rows.reduce((s, r) => s + entero(r.monto), 0)
    if (monto != null && Number(monto) !== total) {
      return validacion(`El monto (${monto}) no coincide con la suma de las clases (${total}); no hay pagos parciales`)
    }
    if (total <= 0) return validacion('Las clases suman $0: no hay nada que cobrar')

    const { familia_id: familiaId, familia } = rows[0]
    const estado = porConfirmar ? 'pendiente' : 'confirmado'
    const pagos = []
    const ingresos = []
    for (const grupo of agruparPorCicloIngreso(rows)) {
      const totalGrupo = grupo.clases.reduce((s, r) => s + entero(r.monto), 0)
      const unAlumno = new Set(grupo.clases.map(r => r.alumno_id)).size === 1
      const ingreso = await crearIngreso({
        fecha,
        fuente: FUENTE_INGRESO_CLASES,
        monto: totalGrupo,
        nota: notaPago(grupo.clases, familia),
        origen: 'clases',
        estado,
        ciclo: grupo.ciclo,
      }, tx)
      // crearIngreso ya validó todo lo que podía fallar; si igual devuelve error, se aborta la
      // transacción para no dejar el pago a medias.
      if (ingreso.error) throw new Error(`No se pudo crear el ingreso: ${ingreso.error}`)

      const [pago] = await tx`
        INSERT INTO pago (alumno_id, familia_id, fecha, monto, ingreso_id, estado)
        VALUES (${unAlumno ? grupo.clases[0].alumno_id : null}, ${familiaId}, ${fecha}, ${totalGrupo}, ${ingreso.ingreso.id}, ${estado})
        RETURNING *
      `
      await tx`INSERT INTO pago_clase ${tx(grupo.clases.map(r => ({ pago_id: pago.id, clase_id: r.id })))}`
      pagos.push(serializarPago({
        ...pago,
        alumno: unAlumno ? grupo.clases[0].alumno : null,
        familia,
        ciclo_financiero: ingreso.ingreso.ciclo_financiero,
        clases: grupo.clases.map(r => ({ id: r.id, alumno: r.alumno, fecha: r.fecha, monto: entero(r.monto) })),
      }))
      ingresos.push(ingreso.ingreso)
    }
    if (!porConfirmar) await tx`UPDATE clase SET cobro = 'pagado', updated_at = NOW() WHERE id = ANY(${ids})`

    return { pago: pagos[0], ingreso: ingresos[0], pagos, ingresos }
  })
}

// Aprueba un pago por confirmar: pago e ingreso pasan a confirmado y las clases a pagadas, todo en
// una transacción. Solo desde la UI (no hay tool MCP que confirme).
export async function confirmarPago(id, db = sql) {
  if (!idValido(id)) return validacion('Id inválido')
  return db.begin(async (tx) => {
    const [pago] = await tx`SELECT * FROM pago WHERE id = ${Number(id)} FOR UPDATE`
    if (!pago) return noEncontrado(`No existe el pago ${id}`)
    if (pago.estado !== 'pendiente') return conflicto(`El pago ${pago.id} ya estaba confirmado`)

    const ids = (await tx`SELECT clase_id FROM pago_clase WHERE pago_id = ${pago.id}`).map(c => c.clase_id)
    const clases = await tx`SELECT id, estado, cobro FROM clase WHERE id = ANY(${ids}) FOR UPDATE`
    const invalidas = clases.filter(c => c.estado !== 'dictada' || c.cobro !== 'pendiente')
    if (invalidas.length) {
      return conflicto(`Las clases ${invalidas.map(c => c.id).join(', ')} cambiaron desde que se registró el pago: descartalo y vuelve a cobrar`)
    }
    await tx`UPDATE pago SET estado = 'confirmado' WHERE id = ${pago.id}`
    if (pago.ingreso_id) await tx`UPDATE ingreso SET estado = 'confirmado', updated_at = NOW() WHERE id = ${pago.ingreso_id}`
    await tx`UPDATE clase SET cobro = 'pagado', updated_at = NOW() WHERE id = ANY(${ids})`
    return { ok: true, pago_id: pago.id, ingreso_id: pago.ingreso_id, clases_pagadas: ids }
  })
}

// Solo desde la UI (no hay tool MCP): las clases vuelven a pendiente y se borra el ingreso.
// También descarta un pago por confirmar.
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

export async function listarPagos({ alumno_id, familia_id, desde, hasta, limite = 50 } = {}, db = sql) {
  if (desde && !fechaValida(desde)) return validacion(`desde: fecha inválida (${desde})`)
  if (hasta && !fechaValida(hasta)) return validacion(`hasta: fecha inválida (${hasta})`)
  if (alumno_id != null && !idValido(alumno_id)) return validacion('alumno_id inválido')
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 500)
  const vacio = db``
  const rows = await db`
    SELECT p.*, a.nombre AS alumno, f.nombre AS familia, i.ciclo_financiero,
      COALESCE(json_agg(json_build_object('id', c.id, 'alumno', ca.nombre, 'fecha', c.fecha, 'monto', c.monto) ORDER BY c.fecha)
        FILTER (WHERE c.id IS NOT NULL), '[]') AS clases
    FROM pago p
    LEFT JOIN alumno a ON a.id = p.alumno_id
    LEFT JOIN familia f ON f.id = p.familia_id
    LEFT JOIN ingreso i ON i.id = p.ingreso_id
    LEFT JOIN pago_clase pc ON pc.pago_id = p.id
    LEFT JOIN clase c ON c.id = pc.clase_id
    LEFT JOIN alumno ca ON ca.id = c.alumno_id
    WHERE true
      ${alumno_id != null ? db`AND p.alumno_id = ${Number(alumno_id)}` : vacio}
      ${familia_id != null ? db`AND p.familia_id = ${Number(familia_id)}` : vacio}
      ${desde ? db`AND p.fecha >= ${desde}` : vacio}
      ${hasta ? db`AND p.fecha <= ${hasta}` : vacio}
    GROUP BY p.id, a.nombre, f.nombre, i.ciclo_financiero
    ORDER BY p.fecha DESC, p.id DESC
    LIMIT ${lim}
  `
  return { pagos: rows.map(serializarPago) }
}

// ─── Resúmenes ───────────────────────────────────────────────────────────────

// Horas y montos de clases por fecha de la clase; cobrado (plata que entró) por fecha del pago. La deuda es la
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
      FROM pago WHERE estado = 'confirmado' ${enRango('fecha')}
    `,
    db`
      SELECT a.id AS alumno_id, a.nombre AS alumno, a.familia_id, f.nombre AS familia,
        f.apoderado_nombre, f.apoderado_telefono,
        SUM(c.monto)::bigint AS deuda, MIN(c.fecha) AS desde, COUNT(*)::int AS clases,
        COALESCE(SUM(c.monto) FILTER (WHERE pg.estado = 'pendiente'), 0)::bigint AS por_confirmar
      FROM clase c JOIN alumno a ON a.id = c.alumno_id LEFT JOIN familia f ON f.id = a.familia_id
        LEFT JOIN pago_clase pc ON pc.clase_id = c.id LEFT JOIN pago pg ON pg.id = pc.pago_id
      WHERE c.estado = 'dictada' AND c.cobro = 'pendiente'
      GROUP BY a.id, a.nombre, f.id
      ORDER BY deuda DESC, a.nombre
    `,
  ])

  const deudaPorAlumno = deuda.map(d => ({
    alumno_id: d.alumno_id,
    alumno: d.alumno,
    familia_id: d.familia_id ?? null,
    familia: d.familia ?? null,
    deuda: Number(d.deuda),
    por_confirmar: Number(d.por_confirmar),
    desde: d.desde,
    clases: d.clases,
  }))
  // Por cuenta de cobro: hermanos de una familia juntos; un alumno sin familia, solo.
  const cuentas = new Map()
  for (const d of deuda) {
    const clave = d.familia_id != null ? `familia:${d.familia_id}` : `alumno:${d.alumno_id}`
    const cuenta = cuentas.get(clave) || {
      familia_id: d.familia_id ?? null,
      alumno_id: d.familia_id != null ? null : d.alumno_id,
      nombre: d.familia_id != null ? `Familia ${d.familia}` : d.alumno,
      apoderado_nombre: d.apoderado_nombre ?? null,
      apoderado_telefono: d.apoderado_telefono ?? null,
      deuda: 0, por_confirmar: 0, desde: d.desde, clases: 0, alumnos: [],
    }
    cuenta.deuda += Number(d.deuda)
    cuenta.por_confirmar += Number(d.por_confirmar)
    cuenta.clases += d.clases
    if (d.desde < cuenta.desde) cuenta.desde = d.desde
    cuenta.alumnos.push({ alumno_id: d.alumno_id, alumno: d.alumno, deuda: Number(d.deuda), por_confirmar: Number(d.por_confirmar), clases: d.clases })
    cuentas.set(clave, cuenta)
  }
  for (const cuenta of cuentas.values()) cuenta.alumnos.sort((a, b) => a.alumno.localeCompare(b.alumno))
  const deudaPorFamilia = [...cuentas.values()].sort((a, b) => b.deuda - a.deuda || a.nombre.localeCompare(b.nombre))
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
    por_confirmar_total: deudaPorAlumno.reduce((s, d) => s + d.por_confirmar, 0),
    deuda_por_alumno: deudaPorAlumno,
    deuda_por_familia: deudaPorFamilia,
  }
}

// Lo que deben las clases dictadas de un mes calendario (las clases de ese mes son ingreso del
// ciclo siguiente, DEC-021). `por_confirmar` = la parte que ya tiene un pago por confirmar.
export async function deudaClasesDelMes(mes, db = sql) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) return validacion('mes debe ser YYYY-MM')
  const [row] = await db`
    SELECT COALESCE(SUM(c.monto), 0)::bigint AS deuda, COUNT(*)::int AS clases,
      COALESCE(SUM(c.monto) FILTER (WHERE EXISTS (SELECT 1 FROM pago_clase pc WHERE pc.clase_id = c.id)), 0)::bigint AS por_confirmar
    FROM clase c
    WHERE c.estado = 'dictada' AND c.cobro = 'pendiente' AND substr(c.fecha, 1, 7) = ${mes}
  `
  return { mes, deuda: Number(row.deuda), clases: row.clases, por_confirmar: Number(row.por_confirmar) }
}

// Ingreso automático de un mes de clases (DEC-021): las clases dictadas y ya cobradas que no tienen
// un pago registrado (las que vinieron de Notion como "Pagado") se asumen como ingreso sin que haya
// que registrar nada. Las que se pagaron con un pago registrado ya tienen su `ingreso` y no entran
// acá (no se cuentan dos veces); las que tienen un pago por confirmar siguen sin cobrar.
export async function ingresoAutomaticoClases(mes, db = sql) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) return validacion('mes debe ser YYYY-MM')
  const [row] = await db`
    SELECT COALESCE(SUM(c.monto), 0)::bigint AS total, COUNT(*)::int AS clases
    FROM clase c
    WHERE c.estado = 'dictada' AND c.cobro = 'pagado' AND substr(c.fecha, 1, 7) = ${mes}
      AND NOT EXISTS (SELECT 1 FROM pago_clase pc WHERE pc.clase_id = c.id)
  `
  return { mes, total: Number(row.total), clases: row.clases }
}

// Ingresos de clases del ciclo (DEC-021): los pagos confirmados de las clases del mes anterior más
// las clases de ese mes ya cobradas sin pago registrado (ingreso automático). `total` es la suma.
export async function ingresosClasesCiclo(ciclo, db = sql) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ciclo || '')) return validacion('ciclo debe ser YYYY-MM')
  const [[row], automatico] = await Promise.all([
    db`
      SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(monto), 0)::float8 AS total
      FROM ingreso WHERE ciclo_financiero = ${ciclo} AND fuente = ${FUENTE_INGRESO_CLASES} AND estado = 'confirmado'
    `,
    ingresoAutomaticoClases(mesClasesDeCiclo(ciclo), db),
  ])
  const registrado = Number(row.total)
  return {
    ciclo,
    total: registrado + automatico.total,
    registrado,
    automatico: automatico.total,
    cantidad: row.cantidad,
    clases_automaticas: automatico.clases,
  }
}

// Todas las clases dictadas, compactas, para /clases/analisis (los cálculos se hacen en el
// cliente con src/utils/analisisClases.js). Son pocas filas (cientos) y no se pagina.
export async function clasesParaAnalisis(db = sql) {
  const rows = await db`
    SELECT c.id, c.fecha, c.hora_inicio, c.duracion_minutos, c.modalidad, c.precio_hora, c.monto, c.cobro,
      c.alumno_id, a.nombre AS alumno, a.familia_id, f.nombre AS familia
    FROM clase c JOIN alumno a ON a.id = c.alumno_id LEFT JOIN familia f ON f.id = a.familia_id
    WHERE c.estado = 'dictada'
    ORDER BY c.fecha, c.hora_inicio
  `
  return rows.map(r => ({
    id: r.id,
    fecha: r.fecha,
    hora_inicio: r.hora_inicio,
    horas: r.duracion_minutos / 60,
    modalidad: r.modalidad,
    precio_hora: entero(r.precio_hora),
    monto: entero(r.monto),
    cobro: r.cobro,
    alumno_id: r.alumno_id,
    alumno: r.alumno,
    familia_id: r.familia_id ?? null,
    familia: r.familia ?? null,
  }))
}
