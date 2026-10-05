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

export function useReservas() {
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      setReservas(await leerJson(await fetch('/api/reservas')))
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescar()
  }, [refrescar])

  const crear = useCallback(async (payload) => {
    const resultado = await leerJson(await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
    await refrescar()
    return resultado
  }, [refrescar])

  const editar = useCallback(async (id, cambios) => {
    const resultado = await leerJson(await fetch(`/api/reservas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    }))
    await refrescar()
    return resultado
  }, [refrescar])

  const cargarSaldos = useCallback(async (id) => {
    return leerJson(await fetch(`/api/reservas/${id}/saldos`))
  }, [])

  const registrarSaldo = useCallback(async (id, { monto, fecha }) => {
    return leerJson(await fetch(`/api/reservas/${id}/saldos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto, fecha }),
    }))
  }, [])

  return { reservas, cargando, error, refrescar, crear, editar, cargarSaldos, registrarSaldo }
}
