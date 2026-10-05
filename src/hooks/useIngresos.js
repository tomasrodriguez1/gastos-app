import { useCallback, useEffect, useState } from 'react'

async function leerJson(res) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(body.error || 'No se pudo completar la operación')
    error.detalle = body
    throw error
  }
  return body
}

export function useIngresos(ciclo) {
  const [ingresos, setIngresos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      const query = ciclo ? `?ciclo=${encodeURIComponent(ciclo)}` : ''
      setIngresos(await leerJson(await fetch(`/api/ingresos${query}`)))
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [ciclo])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescar()
  }, [refrescar])

  const crear = useCallback(async (payload) => {
    const resultado = await leerJson(await fetch('/api/ingresos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
    await refrescar()
    return resultado
  }, [refrescar])

  const editar = useCallback(async (id, cambios) => {
    const resultado = await leerJson(await fetch(`/api/ingresos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    }))
    await refrescar()
    return resultado
  }, [refrescar])

  const eliminar = useCallback(async (id) => {
    await leerJson(await fetch(`/api/ingresos/${id}`, { method: 'DELETE' }))
    await refrescar()
  }, [refrescar])

  return { ingresos, cargando, error, refrescar, crear, editar, eliminar }
}
