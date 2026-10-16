// Ingresos reales (fecha, fuente, monto). Separado de presupuesto_ingreso (previsión por ciclo,
// se reemplaza entero en cada PUT) por el mismo criterio que reserva vs presupuesto_fondo: uno es
// un registro histórico de hechos, el otro un plan que se reescribe.
//
// Reglas (DEC-020):
// - La fuente tiene que existir en el catálogo `fuente_ingreso` (se guarda el nombre canónico).
// - Vías de entrada: manual (UI), chat (agente), mcp y clases (pago de clases). Lo que registra
//   una IA (chat, mcp) nace 'pendiente' y no cuenta hasta que un humano lo aprueba; manual y
//   clases nacen 'confirmado' (registrarPago puede pedir 'pendiente' para los pagos por MCP).
// - Una fuente automática (Clases particulares) solo la crea un pago de clases.
//
// Este módulo es la base: no depende de server/clases/ (clases.js lo importa). Lo que cruza con
// clases (aprobar/descartar un ingreso de clases, resumen del ciclo) está en ingresosCiclo.js, y
// el router en routes/ingresos.js. Ver docs/context/data_model_context.md.

import sql from './db/client.js'
import { toMonto } from './db/numeric.js'
import { obtenerCicloFinanciero } from '../src/utils/ciclos.js'

export const FUENTE_CLASES = 'Clases particulares'
export const ORIGENES = ['manual', 'chat', 'mcp', 'clases']
export const ESTADOS_INGRESO = ['pendiente', 'confirmado']
export const TIPOS_FUENTE = ['fijo', 'variable', 'fondos']

// Un ingreso creado por un pago de clases (server/clases/) no se corrige por acá:
// se deshace el pago en /clases, que lo borra junto con el vínculo.
export const ERROR_INGRESO_CLASES = {
  error: 'Este ingreso viene de un pago de clases: se corrige deshaciendo el pago en /clases',
  status: 409,
  code: 'conflicto',
}

const fallo = (status, error, code, extra = {}) => ({ error, status, code, ...extra })
const validacion = (error, extra) => fallo(400, error, 'validacion', extra)
const noEncontrado = (error = 'No encontrado') => fallo(404, error, 'no_encontrado')
const conflicto = (error, extra) => fallo(409, error, 'conflicto', extra)

const textoONull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// ─── Serialización ───────────────────────────────────────────────────────────

export function serializarIngreso(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    ciclo_financiero: row.ciclo_financiero,
    fuente: row.fuente,
    monto: toMonto(row.monto),
    nota: row.nota || null,
    origen: row.origen,
    estado: row.estado || 'confirmado',
    fondo: row.fondo || null,
  }
}

export function serializarFuente(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    automatica: row.automatica,
    dia_esperado: row.dia_esperado ?? null,
    activa: row.activa,
    orden: row.orden,
  }
}

// ─── Catálogo de fuentes ─────────────────────────────────────────────────────

export async function listarFuentes({ incluirInactivas = true } = {}, db = sql) {
  const rows = incluirInactivas
    ? await db`SELECT * FROM fuente_ingreso ORDER BY orden, id`
    : await db`SELECT * FROM fuente_ingreso WHERE activa ORDER BY orden, id`
  return rows.map(serializarFuente)
}

async function buscarFuente(nombre, db) {
  const [row] = await db`SELECT * FROM fuente_ingreso WHERE lower(nombre) = lower(${nombre.trim()})`
  return row || null
}

async function nombresRegistrables(db) {
  const rows = await db`SELECT nombre FROM fuente_ingreso WHERE activa AND NOT automatica ORDER BY orden, id`
  return rows.map(r => r.nombre)
}

function datosFuente(datos, actual = {}) {
  const nombre = datos.nombre !== undefined ? textoONull(datos.nombre) : actual.nombre
  if (!nombre) return { error: 'Falta el nombre de la fuente' }
  if (nombre.length > 80) return { error: 'Nombre demasiado largo' }
  const tipo = datos.tipo !== undefined ? datos.tipo : actual.tipo || 'variable'
  if (!TIPOS_FUENTE.includes(tipo)) return { error: `tipo debe ser uno de: ${TIPOS_FUENTE.join(', ')}` }
  let dia = datos.dia_esperado !== undefined ? datos.dia_esperado : actual.dia_esperado ?? null
  if (dia === '' || dia === undefined) dia = null
  if (dia !== null) {
    dia = Number(dia)
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { error: 'dia_esperado tiene que ser un día del mes (1–31)' }
  }
  // Si deja de ser fija, el día esperado se limpia solo (a menos que lo pida explícitamente).
  if (tipo !== 'fijo' && datos.dia_esperado === undefined) dia = null
  if (dia !== null && tipo !== 'fijo') return { error: 'Solo una fuente fija tiene día esperado' }
  const activa = datos.activa !== undefined ? Boolean(datos.activa) : actual.activa ?? true
  return { nombre, tipo, dia, activa }
}

export async function crearFuente(datos = {}, db = sql) {
  const d = datosFuente(datos)
  if (d.error) return validacion(d.error)
  const [{ n }] = await db`SELECT COALESCE(MAX(orden), 0)::int AS n FROM fuente_ingreso`
  const [row] = await db`
    INSERT INTO fuente_ingreso (nombre, tipo, dia_esperado, activa, orden)
    VALUES (${d.nombre}, ${d.tipo}, ${d.dia}, ${d.activa}, ${n + 1})
    ON CONFLICT DO NOTHING
    RETURNING *
  `
  if (!row) return conflicto(`Ya existe la fuente "${d.nombre}"`)
  return { fuente: serializarFuente(row) }
}

// Renombrar propaga el nombre a los ingresos y al previsto, en la misma transacción, para que
// previsto y real sigan usando el mismo nombre. Una fuente automática (Clases) no se renombra ni
// se desactiva: el resto del sistema la identifica por nombre.
export async function editarFuente(id, cambios = {}, db = sql) {
  const fuenteId = Number(id)
  if (!Number.isInteger(fuenteId) || fuenteId <= 0) return validacion('Id inválido')
  return db.begin(async (tx) => {
    const [actual] = await tx`SELECT * FROM fuente_ingreso WHERE id = ${fuenteId} FOR UPDATE`
    if (!actual) return noEncontrado('Fuente no encontrada')
    const d = datosFuente(cambios, actual)
    if (d.error) return validacion(d.error)
    if (actual.automatica) {
      if (d.nombre !== actual.nombre) return conflicto(`"${actual.nombre}" es automática: no se puede renombrar`)
      if (!d.activa) return conflicto(`"${actual.nombre}" es automática: no se puede desactivar`)
    }
    const orden = cambios.orden !== undefined && Number.isInteger(Number(cambios.orden)) ? Number(cambios.orden) : actual.orden

    if (d.nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
      const otra = await buscarFuente(d.nombre, tx)
      if (otra) return conflicto(`Ya existe la fuente "${otra.nombre}"`)
    }
    if (d.nombre !== actual.nombre) {
      await tx`UPDATE ingreso SET fuente = ${d.nombre}, updated_at = NOW() WHERE lower(fuente) = lower(${actual.nombre})`
      const [{ existe }] = await tx`SELECT to_regclass('public.presupuesto_ingreso') IS NOT NULL AS existe`
      if (existe) {
        await tx`
          UPDATE presupuesto_ingreso p SET fuente = ${d.nombre}
          WHERE p.fuente = ${actual.nombre}
            AND NOT EXISTS (SELECT 1 FROM presupuesto_ingreso q WHERE q.ciclo = p.ciclo AND q.fuente = ${d.nombre})
        `
      }
    }
    const [row] = await tx`
      UPDATE fuente_ingreso SET nombre = ${d.nombre}, tipo = ${d.tipo}, dia_esperado = ${d.dia},
        activa = ${d.activa}, orden = ${orden}, updated_at = NOW()
      WHERE id = ${actual.id}
      RETURNING *
    `
    return { fuente: serializarFuente(row) }
  })
}

// ─── Ingresos ────────────────────────────────────────────────────────────────

export async function listarIngresos({ ciclo, estado } = {}, db = sql) {
  if (estado && !ESTADOS_INGRESO.includes(estado)) return []
  const vacio = db``
  const rows = await db`
    SELECT * FROM ingreso
    WHERE true
      ${ciclo ? db`AND ciclo_financiero = ${ciclo}` : vacio}
      ${estado ? db`AND estado = ${estado}` : vacio}
    ORDER BY fecha DESC, id DESC
  `
  return rows.map(serializarIngreso)
}

// Valida fuente (catálogo) y fondo, y devuelve el nombre canónico.
async function resolverFuente(fuente, { origen, fondo }, db) {
  const nombre = textoONull(fuente)
  if (!nombre) return validacion('Falta fuente')
  const registro = await buscarFuente(nombre, db)
  if (!registro) {
    const validas = await nombresRegistrables(db)
    return validacion(`La fuente "${nombre}" no existe en el catálogo. Fuentes válidas: ${validas.join(', ')}`, { validas })
  }
  if (!registro.activa) return validacion(`La fuente "${registro.nombre}" está desactivada`)
  if (registro.automatica && origen !== 'clases') {
    return validacion(`"${registro.nombre}" se registra como pago de clases (en /clases o con registrar_pago), no como ingreso suelto`)
  }
  const fondoLimpio = textoONull(fondo)
  if (fondoLimpio && registro.tipo !== 'fondos') {
    return validacion(`"fondo" solo se usa con la fuente de tipo fondos (${registro.nombre} no lo es)`)
  }
  return { fuente: registro, fondo: fondoLimpio }
}

// estado: 'confirmado' para manual/clases, 'pendiente' para lo que registra una IA. registrarPago
// de clases lo pasa explícito.
export async function crearIngreso({ fecha, fuente, monto, nota, origen = 'manual', fondo, estado } = {}, db = sql) {
  if (!textoONull(fuente)) return validacion('Falta fuente')
  const montoNum = Number(monto)
  if (!Number.isFinite(montoNum) || montoNum <= 0) return validacion('Monto inválido')
  if (!ORIGENES.includes(origen)) return validacion(`origen debe ser uno de: ${ORIGENES.join(', ')}`)

  let cicloFinanciero
  try {
    cicloFinanciero = obtenerCicloFinanciero(fecha)
  } catch {
    return validacion('Fecha inválida')
  }

  const r = await resolverFuente(fuente, { origen, fondo }, db)
  if (r.error) return r

  const estadoFinal = estado || (origen === 'chat' || origen === 'mcp' ? 'pendiente' : 'confirmado')
  if (!ESTADOS_INGRESO.includes(estadoFinal)) return validacion('estado inválido')

  const [row] = await db`
    INSERT INTO ingreso (fecha, ciclo_financiero, fuente, monto, nota, origen, estado, fondo)
    VALUES (${fecha}, ${cicloFinanciero}, ${r.fuente.nombre}, ${montoNum}, ${textoONull(nota)}, ${origen}, ${estadoFinal}, ${r.fondo})
    RETURNING *
  `
  return { ingreso: serializarIngreso(row) }
}

// Posible duplicado: misma fuente, monto ±10 % y fecha ±5 días (pendientes o confirmados).
export async function buscarIngresosSimilares({ fuente, monto, fecha, excluirId } = {}, db = sql) {
  const montoNum = Number(monto)
  if (!textoONull(fuente) || !(montoNum > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return []
  const base = new Date(`${fecha}T00:00:00Z`)
  const dia = (n) => new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10)
  const rows = await db`
    SELECT * FROM ingreso
    WHERE lower(fuente) = lower(${fuente.trim()})
      AND fecha >= ${dia(-5)} AND fecha <= ${dia(5)}
      AND monto >= ${montoNum * 0.9} AND monto <= ${montoNum * 1.1}
      ${excluirId ? db`AND id <> ${Number(excluirId)}` : db``}
    ORDER BY fecha DESC, id DESC
  `
  return rows.map(serializarIngreso)
}

export async function editarIngreso(id, cambios = {}, db = sql) {
  const ingresoId = Number(id)
  const [actual] = await db`SELECT * FROM ingreso WHERE id = ${ingresoId}`
  if (!actual) return noEncontrado()
  if (actual.origen === 'clases') return ERROR_INGRESO_CLASES

  const fecha = cambios.fecha !== undefined ? cambios.fecha : actual.fecha
  const monto = cambios.monto !== undefined ? Number(cambios.monto) : toMonto(actual.monto)
  if (!Number.isFinite(monto) || monto <= 0) return validacion('Monto inválido')
  const nota = cambios.nota !== undefined ? cambios.nota : actual.nota

  let cicloFinanciero = actual.ciclo_financiero
  if (cambios.fecha !== undefined) {
    try {
      cicloFinanciero = obtenerCicloFinanciero(fecha)
    } catch {
      return validacion('Fecha inválida')
    }
  }

  let fuente = actual.fuente
  let fondo = actual.fondo
  if (cambios.fuente !== undefined || cambios.fondo !== undefined) {
    const r = await resolverFuente(cambios.fuente !== undefined ? cambios.fuente : actual.fuente, {
      origen: actual.origen,
      fondo: cambios.fondo !== undefined ? cambios.fondo : actual.fondo,
    }, db)
    if (r.error) return r
    fuente = r.fuente.nombre
    fondo = r.fondo
  }

  const [row] = await db`
    UPDATE ingreso SET
      fecha = ${fecha},
      ciclo_financiero = ${cicloFinanciero},
      fuente = ${fuente},
      monto = ${monto},
      nota = ${textoONull(nota)},
      fondo = ${fondo},
      updated_at = NOW()
    WHERE id = ${ingresoId}
    RETURNING *
  `
  return { ingreso: serializarIngreso(row) }
}

export async function eliminarIngreso(id, db = sql) {
  const ingresoId = Number(id)
  const [actual] = await db`SELECT * FROM ingreso WHERE id = ${ingresoId}`
  if (!actual) return noEncontrado()
  if (actual.origen === 'clases') return ERROR_INGRESO_CLASES
  const rows = await db`DELETE FROM ingreso WHERE id = ${ingresoId} RETURNING id`
  if (!rows.length) return noEncontrado()
  return { ok: true }
}

// Aprueba un ingreso pendiente (no de clases: ese se aprueba confirmando su pago, ver
// ingresosCiclo.js). Condicionado a estado='pendiente' para que dos aprobaciones no se pisen.
export async function confirmarIngreso(id, db = sql) {
  const ingresoId = Number(id)
  const [actual] = await db`SELECT * FROM ingreso WHERE id = ${ingresoId}`
  if (!actual) return noEncontrado()
  if (actual.origen === 'clases') return ERROR_INGRESO_CLASES
  const [row] = await db`
    UPDATE ingreso SET estado = 'confirmado', updated_at = NOW()
    WHERE id = ${ingresoId} AND estado = 'pendiente'
    RETURNING *
  `
  if (!row) return conflicto('Ese ingreso ya estaba confirmado')
  return { ingreso: serializarIngreso(row) }
}

// Descarta (borra) un ingreso pendiente. Un confirmado se elimina con eliminarIngreso.
export async function descartarIngreso(id, db = sql) {
  const ingresoId = Number(id)
  const [actual] = await db`SELECT * FROM ingreso WHERE id = ${ingresoId}`
  if (!actual) return noEncontrado()
  if (actual.origen === 'clases') return ERROR_INGRESO_CLASES
  if (actual.estado !== 'pendiente') return conflicto('Solo se descartan ingresos pendientes; uno confirmado se elimina')
  await db`DELETE FROM ingreso WHERE id = ${ingresoId} AND estado = 'pendiente'`
  return { ok: true }
}
