import { useState, useEffect, useCallback } from 'react'

async function fetchPresupuestoMes(mes) {
  try {
    const res = await fetch(`/api/presupuesto/${mes}`)
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
    // Load list of months with budget data, then cache them all
    fetch('/api/presupuesto/meses')
      .then(r => r.ok ? r.json() : [])
      .then(async (meses) => {
        const entries = await Promise.all(
          meses.map(async (mes) => [mes, await fetchPresupuestoMes(mes)])
        )
        const data = Object.fromEntries(entries.filter(([, v]) => v !== null))
        setPresupuesto(data)
        setCargado(true)
      })
      .catch(() => setCargado(true))
  }, [])

  const guardar = useCallback(async (mes, datos) => {
    setErrorGuardado(null)
    try {
      const res = await fetch(`/api/presupuesto/${mes}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`PUT /api/presupuesto/${mes} falló ${res.status}:`, body)
        throw new Error('Error al guardar el presupuesto')
      }
      const result = await res.json().catch(() => ({}))
      const { fondo_cambios: _fc, ...datosEstado } = datos
      setPresupuesto(prev => ({ ...prev, [mes]: datosEstado }))
      return { ok: true, gastosActualizados: result.gastos_actualizados || 0 }
    } catch (error) {
      setErrorGuardado(error.message || 'Error de conexión al guardar')
      return { ok: false, gastosActualizados: 0 }
    }
  }, [])

  const obtenerMes = useCallback((mes) => {
    return presupuesto[mes] || { ingresos: {}, categorias: {}, fondos: {} }
  }, [presupuesto])

  const copiarMesAnterior = useCallback(async (mesActual) => {
    const res = await fetch(`/api/presupuesto/${mesActual}/copiar-anterior`, { method: 'POST' })
    if (!res.ok) return false
    const datos = await fetchPresupuestoMes(mesActual)
    if (datos) setPresupuesto(prev => ({ ...prev, [mesActual]: datos }))
    return true
  }, [])

  return { presupuesto, obtenerMes, guardar, copiarMesAnterior, cargado, errorGuardado }
}
