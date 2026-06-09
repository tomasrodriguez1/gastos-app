import { useState, useEffect, useCallback } from 'react'
import { cargarDeDisco, guardarEnDisco, eliminarGastoRemoto } from '../utils/persistencia'

function mesDesFecha(fecha) {
  return fecha.substring(0, 7)
}

export function useGastosLocales() {
  const [gastosLocales, setGastosLocales] = useState([])

  useEffect(() => {
    cargarDeDisco('gastos_manuales').then(data => {
      if (data) {
        setGastosLocales(data)
      } else {
        // Migrar desde localStorage si hay datos viejos
        try {
          const raw = localStorage.getItem('gastos_manuales_v1')
          const legacy = raw ? JSON.parse(raw) : []
          if (legacy.length) guardarEnDisco('gastos_manuales', legacy).catch(() => {})
          setGastosLocales(legacy)
        } catch { setGastosLocales([]) }
      }
    })
  }, [])

  const agregar = useCallback((gasto) => {
    const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const nuevo = {
      ...gasto,
      id: crypto.randomUUID(),
      mes: mesDesFecha(gasto.fecha),
      yr: gasto.fecha.substring(0, 4),
      monto_real: gasto.monto_real ?? gasto.monto,
      split: gasto.split ?? 0,
      usd: gasto.usd ?? 0,
      budget: false,
      manual: true,
      created_at: ahora,
    }
    setGastosLocales(prev => {
      const next = [nuevo, ...prev]
      guardarEnDisco('gastos_manuales', next).catch(() => {
        setGastosLocales(prev)
      })
      return next
    })
    return nuevo
  }, [])

  const actualizar = useCallback((id, changes) => {
    setGastosLocales(prev => {
      const next = prev.map(g => g.id === id ? { ...g, ...changes } : g)
      guardarEnDisco('gastos_manuales', next).catch(() => {
        setGastosLocales(prev)
      })
      return next
    })
  }, [])

  const eliminar = useCallback((id) => {
    setGastosLocales(prev => {
      const next = prev.filter(g => g.id !== id)
      return next
    })
    eliminarGastoRemoto(id).catch(() => {})
  }, [])

  return { gastosLocales, agregar, actualizar, eliminar }
}
