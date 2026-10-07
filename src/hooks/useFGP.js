import { useCallback, useEffect, useState } from 'react'

async function leerJson(res) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'No se pudo completar la operación')
  return body
}

// Movimientos del FGP (fgp_movimiento). El saldo se calcula con calcularFondoFGP (src/utils/fgp.js).
// onCambioExterno: refresca lo que un movimiento FGP toca fuera de esta tabla (fondo de tarjeta).
export function useFGP({ onCambioExterno } = {}) {
  const [movimientos, setMovimientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      setMovimientos(await leerJson(await fetch('/api/fgp/movimientos')))
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

  const enviar = useCallback(async (ruta, method, body) => {
    const resultado = await leerJson(await fetch(`/api/fgp${ruta}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }))
    await Promise.all([refrescar(), onCambioExterno?.()])
    return resultado
  }, [refrescar, onCambioExterno])

  const registrar = useCallback(datos => enviar('/movimientos', 'POST', datos), [enviar])
  const traspasar = useCallback((gastoIds, modo) => enviar('/traspasos', 'POST', { gasto_ids: gastoIds, modo }), [enviar])
  const eliminar = useCallback(id => enviar(`/movimientos/${id}`, 'DELETE'), [enviar])

  return { movimientos, cargando, error, refrescar, registrar, traspasar, eliminar }
}
