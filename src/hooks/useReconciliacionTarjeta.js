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
  const [fondo, setFondo] = useState({ saldos: { CLP: 0, USD: 0 }, movimientos: [] })
  const [ciclos, setCiclos] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const refrescar = useCallback(async () => {
    try {
      const [resumenRes, fondoRes, ciclosRes] = await Promise.all([
        fetch('/api/tarjeta/resumen'),
        fetch('/api/tarjeta/fondo'),
        fetch('/api/tarjeta/ciclos'),
      ])
      const [nuevoResumen, nuevoFondo, filasCiclo] = await Promise.all([
        leerJson(resumenRes),
        leerJson(fondoRes),
        leerJson(ciclosRes),
      ])
      setResumen(nuevoResumen)
      setFondo(nuevoFondo)
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

  const enviarFondo = useCallback(async (ruta, method, body) => {
    await leerJson(await fetch(`/api/tarjeta/fondo${ruta}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }))
    setFondo(await leerJson(await fetch('/api/tarjeta/fondo')))
  }, [])

  const aportarFondo = useCallback((moneda, monto, nota) => enviarFondo('/aportes', 'POST', { moneda, monto, nota }), [enviarFondo])
  const ajustarSaldoFondo = useCallback((moneda, saldo) => enviarFondo('/saldo', 'PUT', { moneda, saldo }), [enviarFondo])
  const eliminarMovimientoFondo = useCallback(id => enviarFondo(`/movimientos/${id}`, 'DELETE'), [enviarFondo])

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
    fondo,
    ciclos,
    cargando,
    error,
    refrescar,
    aportarFondo,
    ajustarSaldoFondo,
    eliminarMovimientoFondo,
    guardarCiclo,
    conciliar: payload => ejecutar('conciliar', payload),
    desconciliar: payload => ejecutar('desconciliar', payload),
    pagar: payload => ejecutar('pagar', payload),
  }
}
