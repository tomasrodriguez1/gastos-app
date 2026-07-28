import { useState, useEffect, useCallback } from 'react'

async function fetchPresupuestoCiclo(ciclo) {
  try {
    const res = await fetch(`/api/presupuesto/${ciclo}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function usePresupuesto() {
  const [presupuesto, setPresupuesto] = useState({})
  const [cargado, setCargado] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState(null)

  useEffect(() => {
    // Carga y cachea todos los ciclos con presupuesto.
    fetch('/api/presupuesto/ciclos')
      .then(r => r.ok ? r.json() : [])
      .then(async (ciclos) => {
        const entries = await Promise.all(
          ciclos.map(async (ciclo) => [ciclo, await fetchPresupuestoCiclo(ciclo)])
        )
        const data = Object.fromEntries(entries.filter(([, v]) => v !== null))
        setPresupuesto(data)
        setCargado(true)
      })
      .catch(() => setCargado(true))
  }, [])

  const guardar = useCallback(async (ciclo, datos) => {
    setErrorGuardado(null)
    try {
      const res = await fetch(`/api/presupuesto/${ciclo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`PUT /api/presupuesto/${ciclo} falló ${res.status}:`, body)
        throw new Error('Error al guardar el presupuesto')
      }
      const result = await res.json().catch(() => ({}))
      const datosEstado = { ...datos }
      delete datosEstado.fondo_cambios
      setPresupuesto(prev => ({ ...prev, [ciclo]: datosEstado }))
      return { ok: true, gastosActualizados: result.gastos_actualizados || 0 }
    } catch (error) {
      setErrorGuardado(error.message || 'Error de conexión al guardar')
      return { ok: false, gastosActualizados: 0 }
    }
  }, [])

  const obtenerCiclo = useCallback((ciclo) => {
    return presupuesto[ciclo] || { ingresos: {}, categorias: {}, fondos: {} }
  }, [presupuesto])

  const copiarCicloAnterior = useCallback(async (cicloActual) => {
    const res = await fetch(`/api/presupuesto/${cicloActual}/copiar-anterior`, { method: 'POST' })
    if (!res.ok) return false
    const datos = await fetchPresupuestoCiclo(cicloActual)
    if (datos) setPresupuesto(prev => ({ ...prev, [cicloActual]: datos }))
    return true
  }, [])

  return { presupuesto, obtenerCiclo, guardar, copiarCicloAnterior, cargado, errorGuardado }
}
