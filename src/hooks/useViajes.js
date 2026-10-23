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

function enviar(url, method, payload) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
}

// Viajes (DEC-024). Asignar/desasignar cambian gastos en el server (viaje_id y el
// presupuesto_manual sugerido), así que llaman a onCambioGastos para refrescar la lista.
export function useViajes({ onCambioGastos } = {}) {
  const [viajes, setViajes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      setViajes(await leerJson(await fetch('/api/viajes')))
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
    const resultado = await leerJson(await enviar('/api/viajes', 'POST', payload))
    await refrescar()
    return resultado
  }, [refrescar])

  const editar = useCallback(async (id, cambios) => {
    const resultado = await leerJson(await enviar(`/api/viajes/${id}`, 'PATCH', cambios))
    await refrescar()
    return resultado
  }, [refrescar])

  const eliminar = useCallback(async (id) => {
    const resultado = await leerJson(await enviar(`/api/viajes/${id}`, 'DELETE'))
    await Promise.all([refrescar(), onCambioGastos?.()])
    return resultado
  }, [refrescar, onCambioGastos])

  const asignar = useCallback(async (id, gastoIds) => {
    const resultado = await leerJson(await enviar(`/api/viajes/${id}/asignar`, 'POST', { gasto_ids: gastoIds }))
    await Promise.all([refrescar(), onCambioGastos?.()])
    return resultado
  }, [refrescar, onCambioGastos])

  const desasignar = useCallback(async (gastoIds) => {
    const resultado = await leerJson(await enviar('/api/viajes/desasignar', 'POST', { gasto_ids: gastoIds }))
    await Promise.all([refrescar(), onCambioGastos?.()])
    return resultado
  }, [refrescar, onCambioGastos])

  return { viajes, cargando, error, refrescar, crear, editar, eliminar, asignar, desasignar }
}
