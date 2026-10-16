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

// Datos de /clases: clases del rango (mes calendario), alumnos, familias, resumen (horas del rango, deuda
// actual, ingresos de clases del ciclo) y pagos recientes. Toda escritura refresca todo: son
// pocas filas y así la deuda y el ingreso del ciclo nunca quedan desfasados de la tabla.
export function useClases({ desde, hasta, ciclo }) {
  const [clases, setClases] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [familias, setFamilias] = useState([])
  const [resumen, setResumen] = useState(null)
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      const rango = new URLSearchParams({ desde, hasta }).toString()
      const [c, a, f, r, p] = await Promise.all([
        fetch(`/api/clases?${rango}`).then(leerJson),
        fetch('/api/clases/alumnos').then(leerJson),
        fetch('/api/clases/familias').then(leerJson),
        fetch(`/api/clases/resumen?${rango}&ciclo=${encodeURIComponent(ciclo)}`).then(leerJson),
        fetch('/api/clases/pagos?limite=20').then(leerJson),
      ])
      setClases(c.filas)
      setAlumnos(a)
      setFamilias(f)
      setResumen(r)
      setPagos(p)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [desde, hasta, ciclo])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescar()
  }, [refrescar])

  const conRefresco = useCallback((fn) => async (...args) => {
    const resultado = await fn(...args)
    await refrescar()
    return resultado
  }, [refrescar])

  return {
    clases, alumnos, familias, resumen, pagos, cargando, error, refrescar,
    // Clases cobrables de una cuenta (familia completa o alumno sin familia).
    clasesPagables: useCallback((cuenta) => {
      const filtro = cuenta.familia_id != null ? `familia_id=${cuenta.familia_id}` : `alumno_id=${cuenta.alumno_id}`
      return fetch(`/api/clases?${filtro}&estado=dictada&cobro=pendiente`).then(leerJson).then(r => r.filas)
    }, []),
    crearFamilia: conRefresco((datos) => enviar('/api/clases/familias', 'POST', datos)),
    editarFamilia: conRefresco((id, cambios) => enviar(`/api/clases/familias/${id}`, 'PATCH', cambios)),
    eliminarFamilia: conRefresco((id) => enviar(`/api/clases/familias/${id}`, 'DELETE')),
    crearAlumno: conRefresco((datos) => enviar('/api/clases/alumnos', 'POST', datos)),
    editarAlumno: conRefresco((id, cambios) => enviar(`/api/clases/alumnos/${id}`, 'PATCH', cambios)),
    agendar: conRefresco((datos) => enviar('/api/clases', 'POST', datos)),
    mover: conRefresco((id, cambios) => enviar(`/api/clases/${id}`, 'PATCH', cambios)),
    marcarDictada: conRefresco((id) => enviar(`/api/clases/${id}/dictada`, 'POST')),
    cancelar: conRefresco((id) => enviar(`/api/clases/${id}/cancelar`, 'POST')),
    eliminar: conRefresco((id) => enviar(`/api/clases/${id}`, 'DELETE')),
    registrarPago: conRefresco((claseIds, fecha) => enviar('/api/clases/pagos', 'POST', { clase_ids: claseIds, fecha })),
    deshacerPago: conRefresco((id) => enviar(`/api/clases/pagos/${id}`, 'DELETE')),
  }
}
