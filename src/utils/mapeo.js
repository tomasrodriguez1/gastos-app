// Cache de reglas cargadas desde el servidor
let _reglas = null
let _reglasCargando = false
let _reglasCargadas = false

export async function cargarReglas() {
  if (_reglasCargadas) return _reglas
  if (_reglasCargando) {
    // Esperar a que termine la carga en curso
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (_reglasCargadas) { clearInterval(check); resolve() }
      }, 50)
    })
    return _reglas
  }
  _reglasCargando = true
  try {
    const res = await fetch('/api/reglas-mapeo')
    _reglas = res.ok ? await res.json() : []
  } catch {
    _reglas = []
  }
  _reglasCargadas = true
  _reglasCargando = false
  return _reglas
}

export function invalidarReglas() {
  _reglas = null
  _reglasCargadas = false
}

function aplicarReglas(reglas, tipos, contexto, banco, motivo) {
  for (const r of reglas) {
    if (!r.activa) continue
    const matchContexto = !r.contexto || r.contexto === contexto
    const matchTipo = !r.tipo || tipos.includes(r.tipo)
    const matchBanco = !r.banco || r.banco === banco
    const matchMotivo = !r.motivo_regex || new RegExp(r.motivo_regex, 'i').test(motivo || '')

    if (matchContexto && matchTipo && matchBanco && matchMotivo) {
      if (r.grupo_dest === '_NONE_') return null
      return { grupo: r.grupo_dest, subcategoria: r.subcat_dest }
    }
  }
  return null
}

// Returns { grupo, subcategoria } | null — usa reglas cacheadas si están disponibles,
// si no, cae al motor hardcodeado como último recurso
export function getSubcategoriaPresupuesto(tipos, contexto, banco) {
  if (_reglasCargadas && _reglas?.length) {
    return aplicarReglas(_reglas, tipos, contexto || '', banco || '', '')
  }
  // Fallback hardcodeado (se usa solo hasta que las reglas se carguen desde el servidor)
  return getSubcategoriaPresupuestoFallback(tipos, contexto, banco)
}

export function getCategoriaPresupuesto(tipos, contexto) {
  const r = getSubcategoriaPresupuesto(tipos, contexto, '')
  return r?.grupo ?? null
}

// Versión asíncrona — usa siempre las reglas del servidor
export async function getSubcategoriaPresupuestoAsync(tipos, contexto, banco) {
  const reglas = await cargarReglas()
  return aplicarReglas(reglas, tipos, contexto || '', banco || '', '')
}

// Fallback hardcodeado — mantiene compatibilidad durante la carga inicial
function getSubcategoriaPresupuestoFallback(tipos, contexto, banco) {
  if (contexto === 'Ale') {
    for (const tipo of tipos) {
      if (tipo === 'Viaje')      return { grupo: 'ALE', subcategoria: 'Pasajes' }
      if (tipo === 'Comida')     return { grupo: 'ALE', subcategoria: 'Comida' }
      if (tipo === 'Ocio')       return { grupo: 'ALE', subcategoria: 'Fiesta' }
      if (tipo === 'Regalo')     return { grupo: 'ALE', subcategoria: 'Regalos' }
      if (tipo === 'Transporte') return { grupo: 'ALE', subcategoria: 'Transporte' }
    }
    return { grupo: 'ALE', subcategoria: 'Otros' }
  }
  if (contexto === 'Trabajo') return { grupo: 'EMPRENDIMIENTO', subcategoria: 'Zalantos' }
  for (const tipo of tipos) {
    switch (tipo) {
      case 'Comida':
        return contexto === 'Amigos'
          ? { grupo: 'ENTRETENIMIENTO', subcategoria: 'Carrete' }
          : { grupo: 'COMIDA', subcategoria: 'Restaurantes' }
      case 'Ocio':         return { grupo: 'ENTRETENIMIENTO', subcategoria: 'Carrete' }
      case 'Deporte':      return { grupo: 'ENTRETENIMIENTO', subcategoria: 'Padel' }
      case 'Regalo':       return { grupo: 'ENTRETENIMIENTO', subcategoria: 'Regalos' }
      case 'Ropa':         return { grupo: 'CUIDADO PERSONAL', subcategoria: 'Ropa' }
      case 'Regalo propio':return { grupo: 'CUIDADO PERSONAL', subcategoria: 'Corte de Pelo' }
      case 'Viaje':        return { grupo: 'VIAJES', subcategoria: 'Pasajes' }
      case 'Transporte':   return { grupo: 'TRANSPORTE', subcategoria: 'Tag' }
      case 'Mantención':   return { grupo: 'TRANSPORTE', subcategoria: 'Ahorro Mantenimiento' }
      case 'Auto':         return { grupo: 'TRANSPORTE', subcategoria: 'Ahorro Patente' }
      case 'Salud':        return { grupo: 'SALUD', subcategoria: 'Consulta Médica' }
      case 'Suscripcion':  return { grupo: 'HOGAR Y SERVICIOS', subcategoria: 'Suscripciones' }
      case 'Externo':
      case 'Proyecto':     return { grupo: 'EMPRENDIMIENTO', subcategoria: 'Zalantos' }
      case 'Deuda': {
        const sub = banco === 'Edwards' ? 'TC Edwards' : banco === 'BICE' ? 'TC BICE' : 'Otras Deudas'
        return { grupo: 'PRÉSTAMOS Y BANCOS', subcategoria: sub }
      }
      case 'Turno': case 'Ajuste': case 'Unknown': case 'VA': case 'A medias': case 'Otro':
        return null
    }
  }
  return null
}
