// Detección de gastos duplicados en PostgreSQL
// Tres niveles de confianza: alta, media, baja

import { toMonto } from './db/numeric.js'
import sql from './db/client.js'
import { deserializarGasto } from './gastos/serializacion.js'

function normalizarMotivo(motivo) {
  if (!motivo) return ''
  return motivo
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Similitud de Jaccard sobre tokens (bigramas de palabras + palabras)
function similitudMotivo(a, b) {
  const tokensA = tokenizar(a)
  const tokensB = tokenizar(b)
  if (!tokensA.size || !tokensB.size) return 0
  const interseccion = [...tokensA].filter(t => tokensB.has(t)).length
  const union = new Set([...tokensA, ...tokensB]).size
  return interseccion / union
}

function tokenizar(texto) {
  const palabras = normalizarMotivo(texto).split(' ').filter(Boolean)
  const tokens = new Set(palabras)
  // agregar bigramas para motivos cortos
  for (let i = 0; i < palabras.length - 1; i++) {
    tokens.add(`${palabras[i]}_${palabras[i + 1]}`)
  }
  return tokens
}

function montoEfectivo(g) {
  return Math.round(toMonto(g.monto_real ?? g.monto ?? g.monto_clp_manual ?? 0))
}

function montosSimilares(a, b) {
  if (a === 0 && b === 0) return true
  const diff = Math.abs(a - b)
  const pct = Math.max(a, b) === 0 ? 0 : diff / Math.max(a, b)
  return diff <= 100 || pct <= 0.01
}

function diffDias(fechaA, fechaB) {
  return Math.abs(new Date(fechaA) - new Date(fechaB)) / 86400000
}

function clavePar(idA, idB) {
  // par ordenado lexicográficamente para lookup simétrico
  return [idA, idB].sort().join('|')
}

function fechaISO(fecha) {
  if (!fecha) return ''
  if (typeof fecha === 'string') return fecha.slice(0, 10)
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return fecha.toISOString().slice(0, 10)
  }
  return String(fecha).slice(0, 10)
}

function desplazarFecha(fecha, dias) {
  const d = new Date(`${fechaISO(fecha)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function clasificarSimilitud(candidato, existente) {
  const fechaA = fechaISO(candidato.fecha)
  const fechaB = fechaISO(existente.fecha)
  const montoA = montoEfectivo(candidato)
  const montoB = montoEfectivo(existente)
  const motivoA = normalizarMotivo(candidato.motivo)
  const motivoB = normalizarMotivo(existente.motivo)
  const dias = diffDias(fechaA, fechaB)

  // Alta relajada vs el detector de ciclo: misma fecha + motivo + monto,
  // aunque el banco difiera (chat BICE vs mail Edwards de la misma compra).
  if (fechaA === fechaB && motivoA && motivoA === motivoB && montosSimilares(montoA, montoB)) {
    return { confianza: 'alta', razon: 'fecha_motivo_monto' }
  }

  if (montosSimilares(montoA, montoB) && dias <= 2 && motivoA !== motivoB) {
    return { confianza: 'media', razon: 'monto_similar_fecha_cercana' }
  }

  if (dias <= 3 && similitudMotivo(candidato.motivo, existente.motivo) >= 0.80) {
    return { confianza: 'baja', razon: 'motivo_similar' }
  }

  return null
}

// Candidatos a duplicado de un gasto que todavía no está en DB (agente /
// crear_gasto). Ventana ±3 días, ignora descartados. No usa exclusiones:
// el par aún no existe.
export async function buscarSimilares(candidato) {
  const fecha = fechaISO(candidato?.fecha)
  if (!fecha) return []

  const desde = desplazarFecha(fecha, -3)
  const hasta = desplazarFecha(fecha, 3)
  const rows = await sql`
    SELECT * FROM gastos
    WHERE fecha >= ${desde}
      AND fecha <= ${hasta}
      AND (estado IS NULL OR estado <> 'descartado')
    ORDER BY fecha
  `

  const candidatoNormalizado = {
    ...candidato,
    fecha,
    monto: candidato.monto ?? 0,
    monto_real: candidato.monto_real ?? candidato.monto ?? 0,
    usd: candidato.usd ?? 0,
    motivo: candidato.motivo || '',
  }

  const vistos = new Set()
  const matches = []
  for (const g of rows.map(deserializarGasto)) {
    if (candidato.id && g.id === candidato.id) continue
    const clase = clasificarSimilitud(candidatoNormalizado, g)
    if (!clase || vistos.has(g.id)) continue
    vistos.add(g.id)
    matches.push({
      gastoId: g.id,
      fecha: fechaISO(g.fecha),
      motivo: g.motivo,
      monto: g.monto,
      usd: g.usd,
      banco: g.banco,
      estado: g.estado,
      origen: g.origen,
      confianza: clase.confianza,
      razon: clase.razon,
    })
  }

  const orden = { alta: 0, media: 1, baja: 2 }
  matches.sort((a, b) => orden[a.confianza] - orden[b.confianza])
  return matches
}

export async function detectarDuplicadosCiclo(sql, ciclo, deserializarGasto) {
  const exclusionesRows = await sql`SELECT gasto_id_a, gasto_id_b FROM duplicado_exclusion`
  const paresExcluidos = new Set(exclusionesRows.map(r => clavePar(r.gasto_id_a, r.gasto_id_b)))

  const rawGastos = await sql`SELECT * FROM gastos WHERE ciclo_financiero = ${ciclo} ORDER BY fecha`
  const gastos = rawGastos.map(deserializarGasto)

  const usados = new Set()
  const grupos = []

  // ─── ALTA: mismo sync_key entre filas distintas (manual ↔ Notion)
  const porSyncKey = {}
  for (const g of gastos) {
    if (!g.sync_key) continue
    if (!porSyncKey[g.sync_key]) porSyncKey[g.sync_key] = []
    porSyncKey[g.sync_key].push(g)
  }
  for (const fila of Object.values(porSyncKey)) {
    if (fila.length < 2) continue
    const ids = fila.map(g => g.id)
    if (ids.some(id => usados.has(id))) continue
    ids.forEach(id => usados.add(id))
    grupos.push({
      id: `grp_alta_sk_${grupos.length}`,
      confianza: 'alta',
      razon: 'sync_key_duplicado',
      gastos: fila,
    })
  }

  // ─── ALTA: misma fecha + motivo_norm + monto_efectivo + banco
  const claveAlta = {}
  for (const g of gastos) {
    if (usados.has(g.id)) continue
    const k = `${g.fecha}|${normalizarMotivo(g.motivo)}|${montoEfectivo(g)}|${g.banco ?? ''}`
    if (!claveAlta[k]) claveAlta[k] = []
    claveAlta[k].push(g)
  }
  for (const fila of Object.values(claveAlta)) {
    if (fila.length < 2) continue
    const ids = fila.map(g => g.id)
    if (ids.some(id => usados.has(id))) continue
    ids.forEach(id => usados.add(id))
    grupos.push({
      id: `grp_alta_ex_${grupos.length}`,
      confianza: 'alta',
      razon: 'fecha_motivo_monto_banco',
      gastos: fila,
    })
  }

  // ─── MEDIA: mismo monto_efectivo (±1% o ±100), fechas a ±2 días, motivos distintos
  const disponibles = gastos.filter(g => !usados.has(g.id))
  const gruposMedia = []
  const usadosMedia = new Set()

  for (let i = 0; i < disponibles.length; i++) {
    const a = disponibles[i]
    if (usadosMedia.has(a.id)) continue
    const grupo = [a]

    for (let j = i + 1; j < disponibles.length; j++) {
      const b = disponibles[j]
      if (usadosMedia.has(b.id)) continue
      const par = clavePar(a.id, b.id)
      if (paresExcluidos.has(par)) continue

      const montoA = montoEfectivo(a)
      const montoB = montoEfectivo(b)
      const motivoNormA = normalizarMotivo(a.motivo)
      const motivoNormB = normalizarMotivo(b.motivo)

      if (
        montosSimilares(montoA, montoB) &&
        diffDias(a.fecha, b.fecha) <= 2 &&
        motivoNormA !== motivoNormB
      ) {
        grupo.push(b)
        usadosMedia.add(b.id)
      }
    }

    if (grupo.length >= 2) {
      usadosMedia.add(a.id)
      gruposMedia.push({
        id: `grp_media_${gruposMedia.length}`,
        confianza: 'media',
        razon: 'monto_similar_fecha_cercana',
        gastos: grupo,
      })
    }
  }
  gruposMedia.forEach(grp => {
    grp.gastos.forEach(g => usados.add(g.id))
    grupos.push(grp)
  })

  // ─── BAJA: similitud de motivo ≥ 0.80, fechas a ±3 días
  const disponiblesBaja = gastos.filter(g => !usados.has(g.id))
  const usadosBaja = new Set()

  for (let i = 0; i < disponiblesBaja.length; i++) {
    const a = disponiblesBaja[i]
    if (usadosBaja.has(a.id)) continue
    const grupo = [a]

    for (let j = i + 1; j < disponiblesBaja.length; j++) {
      const b = disponiblesBaja[j]
      if (usadosBaja.has(b.id)) continue
      const par = clavePar(a.id, b.id)
      if (paresExcluidos.has(par)) continue

      if (
        diffDias(a.fecha, b.fecha) <= 3 &&
        similitudMotivo(a.motivo, b.motivo) >= 0.80
      ) {
        grupo.push(b)
        usadosBaja.add(b.id)
      }
    }

    if (grupo.length >= 2) {
      usadosBaja.add(a.id)
      grupos.push({
        id: `grp_baja_${grupos.length}`,
        confianza: 'baja',
        razon: 'motivo_similar',
        gastos: grupo,
      })
    }
  }

  const gastosAfectados = grupos.reduce((n, grp) => n + grp.gastos.length, 0)

  return {
    grupos,
    resumen: {
      alta: grupos.filter(g => g.confianza === 'alta').length,
      media: grupos.filter(g => g.confianza === 'media').length,
      baja: grupos.filter(g => g.confianza === 'baja').length,
      gastos_afectados: gastosAfectados,
    },
  }
}

export { clavePar }
