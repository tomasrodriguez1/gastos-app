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
  }).then(leerJson)
}

// Cualquier cambio de ingresos (aprobar, descartar, registrar, pagos de clases) avisa a los demás
// hooks montados —el contador del menú, el Dashboard, /ingresos— para que se refresquen juntos.
const EVENTO = 'ingresos:cambio'
export const avisarCambioIngresos = () => window.dispatchEvent(new Event(EVENTO))

// Refresca `refrescar` al montar y cada vez que cambian los ingresos en cualquier parte de la app.
function useRefrescoIngresos(refrescar) {
  useEffect(() => {
    refrescar()
    window.addEventListener(EVENTO, refrescar)
    return () => window.removeEventListener(EVENTO, refrescar)
  }, [refrescar])
}

// Ingresos de un ciclo (pendientes y confirmados) con alta/edición/borrado manual.
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

  useRefrescoIngresos(refrescar)

  const crear = useCallback(async (payload) => {
    const resultado = await enviar('/api/ingresos', 'POST', payload)
    avisarCambioIngresos()
    return resultado
  }, [])

  const editar = useCallback(async (id, cambios) => {
    const resultado = await enviar(`/api/ingresos/${id}`, 'PATCH', cambios)
    avisarCambioIngresos()
    return resultado
  }, [])

  const eliminar = useCallback(async (id) => {
    await enviar(`/api/ingresos/${id}`, 'DELETE')
    avisarCambioIngresos()
  }, [])

  return { ingresos, cargando, error, refrescar, crear, editar, eliminar }
}

// Previsto vs real del ciclo por fuente + totales (Dashboard, /ingresos, /presupuesto).
export function useResumenIngresos(ciclo) {
  const [resumen, setResumen] = useState(null)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      setResumen(await leerJson(await fetch(`/api/ingresos/resumen?ciclo=${encodeURIComponent(ciclo)}`)))
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [ciclo])

  useRefrescoIngresos(refrescar)
  return { resumen, error, refrescar }
}

// Ingresos (y pagos de clases) esperando aprobación humana.
export function usePendientesIngresos() {
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      setPendientes(await leerJson(await fetch('/api/ingresos/pendientes')))
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useRefrescoIngresos(refrescar)

  const aprobar = useCallback(async (id) => {
    const r = await enviar(`/api/ingresos/${id}/confirmar`, 'POST')
    avisarCambioIngresos()
    return r
  }, [])

  const descartar = useCallback(async (id) => {
    const r = await enviar(`/api/ingresos/${id}/descartar`, 'POST')
    avisarCambioIngresos()
    return r
  }, [])

  return { pendientes, cargando, error, refrescar, aprobar, descartar }
}

// Cantidad de pendientes para el menú; se refresca al cambiar de ruta y con el evento compartido.
export function useCantidadPendientesIngresos(ruta) {
  const [cantidad, setCantidad] = useState(0)
  const refrescar = useCallback(async () => {
    try {
      const filas = await leerJson(await fetch('/api/ingresos?estado=pendiente'))
      setCantidad(Array.isArray(filas) ? filas.length : 0)
    } catch {
      // El contador es decorativo: sin sesión o sin red simplemente no se muestra.
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescar()
  }, [refrescar, ruta])
  useEffect(() => {
    window.addEventListener(EVENTO, refrescar)
    return () => window.removeEventListener(EVENTO, refrescar)
  }, [refrescar])
  return cantidad
}

// Catálogo de fuentes de ingreso.
export function useFuentesIngreso() {
  const [fuentes, setFuentes] = useState([])
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      setFuentes(await leerJson(await fetch('/api/ingresos/fuentes')))
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescar()
  }, [refrescar])

  const crear = useCallback(async (datos) => {
    const r = await enviar('/api/ingresos/fuentes', 'POST', datos)
    await refrescar()
    avisarCambioIngresos()
    return r
  }, [refrescar])

  const editar = useCallback(async (id, cambios) => {
    const r = await enviar(`/api/ingresos/fuentes/${id}`, 'PATCH', cambios)
    await refrescar()
    avisarCambioIngresos()
    return r
  }, [refrescar])

  return { fuentes, error, refrescar, crear, editar }
}

export function buscarIngresosSimilares({ fuente, monto, fecha }) {
  const query = new URLSearchParams({ fuente, monto: String(monto), fecha })
  return fetch(`/api/ingresos/similares?${query}`).then(leerJson)
}
