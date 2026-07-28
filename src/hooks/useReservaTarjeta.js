import { useState, useEffect, useCallback } from 'react'

// Saldo reservado por tarjeta (ej. Mercado Pago) para pagar la TC.
// Standalone respecto al presupuesto — ver server/db/schema.pg.sql (reserva_tarjeta).
export function useReservaTarjeta() {
  const [reservas, setReservas] = useState({}) // { [banco]: monto }
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    fetch('/api/reserva-tarjeta')
      .then(r => r.json())
      .then(rows => {
        setReservas(Object.fromEntries(rows.map(r => [r.banco, r.monto])))
        setCargado(true)
      })
      .catch(() => setCargado(true))
  }, [])

  const guardarReserva = useCallback(async (banco, monto) => {
    setReservas(prev => ({ ...prev, [banco]: monto }))
    try {
      await fetch(`/api/reserva-tarjeta/${encodeURIComponent(banco)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto }),
      })
    } catch (e) {
      console.error('[useReservaTarjeta] error al guardar', e)
    }
  }, [])

  return { reservas, guardarReserva, cargado }
}
