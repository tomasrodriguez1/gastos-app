import { useState, useEffect, useCallback } from 'react'
import { cargarDeDisco, guardarEnDisco, eliminarGastoRemoto } from '../utils/persistencia'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../utils/ciclos'

export function useGastosLocales() {
  const [gastosLocales, setGastosLocales] = useState([])

  useEffect(() => {
    cargarDeDisco('gastos_manuales').then(data => {
      if (data) {
        setGastosLocales(data.map(g => ({
          ...g,
          mes: obtenerMesCalendario(g.fecha),
          ciclo_financiero: obtenerCicloFinanciero(g.fecha),
        })))
      } else {
        // Migrar desde localStorage si hay datos viejos
        try {
          const raw = localStorage.getItem('gastos_manuales_v1')
          const legacy = raw ? JSON.parse(raw) : []
          const normalizados = legacy.map(g => ({
            ...g,
            mes: obtenerMesCalendario(g.fecha),
            ciclo_financiero: obtenerCicloFinanciero(g.fecha),
          }))
          if (normalizados.length) guardarEnDisco('gastos_manuales', normalizados).catch(() => {})
          setGastosLocales(normalizados)
        } catch { setGastosLocales([]) }
      }
    })
  }, [])

  const agregar = useCallback((gasto) => {
    const ahora = new Date().toISOString()
    const nuevo = {
      ...gasto,
      id: crypto.randomUUID(),
      mes: obtenerMesCalendario(gasto.fecha),
      ciclo_financiero: obtenerCicloFinanciero(gasto.fecha),
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
      const next = prev.map(g => {
        if (g.id !== id) return g
        const periodos = changes.fecha
          ? {
              mes: obtenerMesCalendario(changes.fecha),
              ciclo_financiero: obtenerCicloFinanciero(changes.fecha),
            }
          : {}
        return { ...g, ...changes, ...periodos }
      })
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
