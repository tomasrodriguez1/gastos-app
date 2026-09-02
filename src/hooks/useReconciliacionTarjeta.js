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

export function useReconciliacionTarjeta() {
  const [resumen, setResumen] = useState(null)
  const [reservas, setReservas] = useState({})
  const [ciclos, setCiclos] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      const [resumenRes, reservasRes, ciclosRes] = await Promise.all([
        fetch('/api/tarjeta/resumen'),
        fetch('/api/reserva-tarjeta'),
        fetch('/api/tarjeta/ciclos'),
      ])
      const [nuevoResumen, filasReserva, filasCiclo] = await Promise.all([
        leerJson(resumenRes),
        leerJson(reservasRes),
        leerJson(ciclosRes),
      ])
      setResumen(nuevoResumen)
      setReservas(Object.fromEntries(filasReserva.map(row => [row.banco, row.monto])))
      setCiclos(Object.fromEntries(filasCiclo.map(row => [row.banco, row.dia_cierre])))
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

  const guardarReserva = useCallback(async (banco, monto) => {
    await leerJson(await fetch(`/api/reserva-tarjeta/${encodeURIComponent(banco)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto }),
    }))
    setReservas(prev => ({ ...prev, [banco]: monto }))
  }, [])

  const guardarCiclo = useCallback(async (banco, diaCierre) => {
    await leerJson(await fetch(`/api/tarjeta/ciclos/${encodeURIComponent(banco)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dia_cierre: diaCierre }),
    }))
    setCiclos(prev => ({ ...prev, [banco]: diaCierre }))
  }, [])

  const ejecutar = useCallback(async (accion, payload) => {
    const resultado = await leerJson(await fetch(`/api/tarjeta/${accion}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
    await refrescar()
    return resultado
  }, [refrescar])

  return {
    resumen,
    reservas,
    ciclos,
    cargando,
    error,
    refrescar,
    guardarReserva,
    guardarCiclo,
    conciliar: payload => ejecutar('conciliar', payload),
    desconciliar: payload => ejecutar('desconciliar', payload),
    pagar: payload => ejecutar('pagar', payload),
  }
}
