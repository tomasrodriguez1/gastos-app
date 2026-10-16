// Import de clases desde un export de Notion (CSV o JSON). Formato documentado en
// docs/context/data_model_context.md ("Import desde Notion"). Sin API de Notion ni dependencias:
// parser CSV mínimo (RFC 4180) + normalización fila a fila + inserción idempotente por notion_id.
//
// Reglas (DEC-019):
// - Una fila = una clase. monto = Price; precio_hora = Price / Horas; hora = columna Hora; fecha =
//   día de calendario (se descarta el "1:00 AM" que Notion pega por zona horaria).
// - Checkbox marcado o Status "Pagado" → dictada. Si no → programada (aunque la fecha ya pasó).
// - "Pagado" → cobro pagado, sin fila en `pago` ni `ingreso`. "No cobrado" (o vacío) → pendiente.
//   Otro valor → pendiente, con el valor crudo en notion_status.
// - "$ till now" es una fórmula: se ignora.
// - notion_id = columna de id si viene; si no, clave sintética csv:<nombre>|<fecha>|<hora>.
//   INSERT … ON CONFLICT (notion_id) DO NOTHING: reimportar no duplica ni pisa cambios hechos en
//   la app. Tampoco revive las que se eliminaron en la app (clase_import_descartada).

import { PRECIO_HORA_NORMAL, fechaValida, horaValida } from './clases.js'

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function parsearCSV(texto) {
  const limpio = texto.replace(/^\uFEFF/, '')
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] || ''
  const sep = (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length ? ';' : ','
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]
    if (enComillas) {
      if (ch === '"' && limpio[i + 1] === '"') { campo += '"'; i++ }
      else if (ch === '"') enComillas = false
      else campo += ch
    } else if (ch === '"') {
      enComillas = true
    } else if (ch === sep) {
      fila.push(campo); campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some(c => c.trim() !== '')) filas.push(fila)
      fila = []
    } else {
      campo += ch
    }
  }
  fila.push(campo)
  if (fila.some(c => c.trim() !== '')) filas.push(fila)
  return filas
}

// Filas de CSV → objetos por encabezado. Un encabezado vacío (el checkbox sin nombre de Notion)
// queda como "".
export function objetosDesdeCSV(texto) {
  const [encabezado, ...filas] = parsearCSV(texto)
  if (!encabezado) return []
  const claves = encabezado.map(h => h.trim())
  return filas.map(f => Object.fromEntries(claves.map((k, i) => [k, f[i] ?? ''])))
}

export function leerArchivo(texto, nombreArchivo = '') {
  if (nombreArchivo.toLowerCase().endsWith('.json') || /^\s*[[{]/.test(texto)) {
    const datos = JSON.parse(texto)
    const filas = Array.isArray(datos) ? datos : datos.filas || datos.results
    if (!Array.isArray(filas)) throw new Error('El JSON tiene que ser un array de filas')
    return filas
  }
  return objetosDesdeCSV(texto)
}

// ─── Columnas ────────────────────────────────────────────────────────────────

const ALIAS = {
  nombre: ['nombre', 'name', 'alumno'],
  fecha: ['fecha', 'date'],
  hora: ['hora', 'time'],
  modalidad: ['modalidad'],
  status: ['status', 'estado', 'cobro'],
  price: ['price', 'precio'],
  horas: ['horas', 'hours', 'duración', 'duracion'],
  id: ['notion_id', 'id', 'page id', 'page_id'],
}
const IGNORADAS = ['$ till now']
const VERDADERO = ['yes', 'true', 'sí', 'si', 'x', '✓', '✔', '1', 'checked', '__yes__']
const FALSO = ['no', 'false', '0', '', 'unchecked', '__no__']

function claveDe(fila, alias) {
  return Object.keys(fila).find(k => alias.includes(k.trim().toLowerCase()))
}

// Columna del checkbox "dictada": la indicada, la de encabezado vacío, o la única columna no
// reconocida cuyos valores son todos sí/no.
export function detectarColumnaDictada(filas, indicada) {
  if (!filas.length) return null
  const claves = Object.keys(filas[0])
  if (indicada) {
    const k = claves.find(c => c.trim().toLowerCase() === indicada.trim().toLowerCase())
    if (!k) throw new Error(`No existe la columna "${indicada}"`)
    return k
  }
  if (claves.includes('')) return ''
  const conocidas = new Set([...Object.values(ALIAS).flat(), ...IGNORADAS])
  const candidatas = claves.filter(k => !conocidas.has(k.trim().toLowerCase())).filter(k =>
    filas.every(f => [...VERDADERO, ...FALSO].includes(String(f[k] ?? '').trim().toLowerCase())))
  return candidatas.length === 1 ? candidatas[0] : null
}

// ─── Normalización ───────────────────────────────────────────────────────────

const MESES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}
const pad = (n) => String(n).padStart(2, '0')

// Solo el día de calendario: Notion agrega horas basura ("1:00 AM") y a veces un rango "→".
export function normalizarFecha(valor) {
  const texto = String(valor ?? '').split('→')[0].trim()
  if (!texto) return null
  let m = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  let fecha = m && `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  if (!fecha && (m = texto.match(/^([a-záéíóú]+)\.?\s+(\d{1,2}),?\s+(\d{4})/i)) && MESES[m[1].toLowerCase()]) {
    fecha = `${m[3]}-${pad(MESES[m[1].toLowerCase()])}-${pad(m[2])}`
  }
  if (!fecha && (m = texto.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?,?\s+(?:de\s+)?(\d{4})/i)) && MESES[m[2].toLowerCase()]) {
    fecha = `${m[3]}-${pad(MESES[m[2].toLowerCase()])}-${pad(m[1])}`
  }
  // D/M/YYYY (formato chileno).
  if (!fecha && (m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/))) fecha = `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  return fecha && fechaValida(fecha) ? fecha : null
}

export function normalizarHora(valor) {
  const texto = String(valor ?? '').trim().toLowerCase()
  if (!texto) return null
  const m = texto.match(/^(\d{1,2})(?:[:.h](\d{2}))?(?::\d{2})?\s*(am|pm|a\.\s?m\.|p\.\s?m\.)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] || 0)
  const sufijo = m[3]?.replace(/[.\s]/g, '')
  if (sufijo === 'pm' && h < 12) h += 12
  if (sufijo === 'am' && h === 12) h = 0
  const hora = `${pad(h)}:${pad(min)}`
  return horaValida(hora) ? hora : null
}

// Duración en horas. Notion exporta "1", "0,5", "1.5", "1:30" (h:mm) y, cuando la propiedad es un
// select con opciones repetidas, "1 (2)" — el sufijo "(n)" no es parte del valor.
export function normalizarHoras(valor) {
  const texto = String(valor ?? '').replace(/\(\d+\)\s*$/, '').trim().replace(/\s/g, '')
  if (!texto) return null
  const hm = texto.match(/^(\d+):([0-5]\d)$/)
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// "$25.000", "25,000", "CLP 25000" → 25000. Pesos sin decimales.
export function normalizarMonto(valor) {
  const digitos = String(valor ?? '').replace(/\.\d{1,2}$/, '').replace(/[^\d]/g, '')
  return digitos ? Number(digitos) : null
}

const esVerdadero = (v) => VERDADERO.includes(String(v ?? '').trim().toLowerCase())

// Una fila del export → clase lista para insertar, o { error }. `avisos` lista lo que se completó
// con un default.
export function normalizarFila(fila, { colDictada } = {}) {
  const get = (campo) => {
    const k = claveDe(fila, ALIAS[campo])
    return k === undefined ? '' : String(fila[k] ?? '').trim()
  }
  const avisos = []
  const nombre = get('nombre')
  if (!nombre) return { error: 'sin Nombre' }
  const fecha = normalizarFecha(get('fecha'))
  if (!fecha) return { error: `Fecha ilegible "${get('fecha')}"` }

  let hora = normalizarHora(get('hora'))
  let nota = null
  if (!hora) {
    if (get('hora')) return { error: `Hora ilegible "${get('hora')}"` }
    hora = '00:00'
    nota = 'Sin hora en Notion'
    avisos.push('sin Hora → 00:00')
  }

  let horas = normalizarHoras(get('horas'))
  if (horas == null) { horas = 1; avisos.push('sin Horas → 1') }
  if (!(horas > 0)) return { error: `Horas inválidas "${get('horas')}"` }
  const duracionMinutos = Math.round(horas * 60)

  const monto = normalizarMonto(get('price'))
  if (monto == null) return { error: `Price ilegible "${get('price')}"` }

  const modalidadCruda = get('modalidad').toLowerCase()
  let modalidad = modalidadCruda === 'online' ? 'online' : 'presencial'
  if (modalidadCruda && !['online', 'presencial'].includes(modalidadCruda)) avisos.push(`Modalidad "${get('modalidad')}" → presencial`)
  if (!modalidadCruda) avisos.push('sin Modalidad → presencial')

  const status = get('status')
  const statusNorm = status.toLowerCase()
  const pagado = statusNorm === 'pagado'
  const statusRaro = status && !['pagado', 'no cobrado'].includes(statusNorm) ? status : null

  const dictada = pagado || (colDictada != null && esVerdadero(fila[colDictada]))
  const id = get('id')

  return {
    clase: {
      notion_id: id || `csv:${nombre}|${fecha}|${hora}`,
      alumno: nombre,
      fecha,
      hora_inicio: hora,
      duracion_minutos: duracionMinutos,
      modalidad,
      precio_hora: Math.round(monto / horas),
      monto,
      estado: dictada ? 'dictada' : 'programada',
      cobro: pagado ? 'pagado' : 'pendiente',
      notion_status: statusRaro,
      nota,
    },
    avisos,
    statusRaro,
  }
}

// ─── Import ──────────────────────────────────────────────────────────────────

class Simulacion extends Error {}

// Inserta en una sola transacción. dryRun hace todo y al final revierte, así el reporte es exacto.
export async function importarClases(filas, db, { colDictada: indicada, dryRun = false, actualizarPrecios = false } = {}) {
  const colDictada = detectarColumnaDictada(filas, indicada)
  const reporte = {
    filas: filas.length,
    columna_dictada: colDictada,
    alumnos_creados: [],
    alumnos_actualizados: [],
    clases_nuevas: 0,
    clases_existentes: 0,
    eliminadas_en_app: 0,
    repetidas_en_archivo: 0,
    errores: [],
    avisos: [],
    status_raros: {},
    dry_run: dryRun,
  }
  if (colDictada == null && filas.length) {
    reporte.avisos.push('No se encontró la columna del checkbox "dictada": solo las filas "Pagado" entran como dictadas. Usá --col-dictada.')
  }

  const clases = []
  const vistos = new Set()
  filas.forEach((fila, i) => {
    const linea = i + 2 // +1 encabezado, +1 base 1
    const r = normalizarFila(fila, { colDictada })
    if (r.error) { reporte.errores.push({ linea, error: r.error }); return }
    if (vistos.has(r.clase.notion_id)) { reporte.repetidas_en_archivo++; return }
    vistos.add(r.clase.notion_id)
    for (const a of r.avisos) reporte.avisos.push(`línea ${linea}: ${a}`)
    if (r.statusRaro) reporte.status_raros[r.statusRaro] = (reporte.status_raros[r.statusRaro] || 0) + 1
    clases.push(r.clase)
  })

  // Precio por defecto del alumno = tarifa de su clase más reciente.
  const precioPorAlumno = new Map()
  for (const c of [...clases].sort((a, b) => `${a.fecha} ${a.hora_inicio}`.localeCompare(`${b.fecha} ${b.hora_inicio}`))) {
    if (c.precio_hora > 0) precioPorAlumno.set(c.alumno, c.precio_hora)
  }

  try {
    await db.begin(async (tx) => {
      const alumnoIds = new Map()
      for (const nombre of new Set(clases.map(c => c.alumno))) {
        const precio = precioPorAlumno.get(nombre) || PRECIO_HORA_NORMAL
        const [existente] = await tx`SELECT * FROM alumno WHERE lower(nombre) = lower(${nombre})`
        if (existente) {
          alumnoIds.set(nombre, existente.id)
          if (actualizarPrecios && existente.precio_hora_default !== precio) {
            await tx`UPDATE alumno SET precio_hora_default = ${precio}, updated_at = NOW() WHERE id = ${existente.id}`
            reporte.alumnos_actualizados.push({ nombre: existente.nombre, precio_hora_default: precio })
          }
          continue
        }
        const [nuevo] = await tx`INSERT INTO alumno (nombre, precio_hora_default) VALUES (${nombre}, ${precio}) RETURNING id`
        alumnoIds.set(nombre, nuevo.id)
        reporte.alumnos_creados.push({ nombre, precio_hora_default: precio })
      }

      const descartadas = new Set((await tx`SELECT notion_id FROM clase_import_descartada`).map(r => r.notion_id))
      for (const c of clases) {
        if (descartadas.has(c.notion_id)) { reporte.eliminadas_en_app++; continue }
        const [insertada] = await tx`
          INSERT INTO clase (alumno_id, fecha, hora_inicio, duracion_minutos, modalidad, precio_hora, monto,
                             estado, cobro, notion_id, notion_status, nota)
          VALUES (${alumnoIds.get(c.alumno)}, ${c.fecha}, ${c.hora_inicio}, ${c.duracion_minutos}, ${c.modalidad},
                  ${c.precio_hora}, ${c.monto}, ${c.estado}, ${c.cobro}, ${c.notion_id}, ${c.notion_status}, ${c.nota})
          ON CONFLICT (notion_id) DO NOTHING
          RETURNING id
        `
        if (insertada) reporte.clases_nuevas++
        else reporte.clases_existentes++
      }
      if (dryRun) throw new Simulacion()
    })
  } catch (err) {
    if (!(err instanceof Simulacion)) throw err
  }
  return reporte
}
