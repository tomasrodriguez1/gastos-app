import { useState, useEffect, useCallback } from 'react'
import { cargarDeDisco, guardarEnDisco, actualizarGastoRemoto, eliminarGastoRemoto } from '../utils/persistencia'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../utils/ciclos'

function makeId(g) {
  return g.id || `${g.fecha}|${g.motivo?.trim().toLowerCase()}`
}

export function useGastos() {
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)

  const recargar = useCallback(() => {
    return cargarDeDisco('gastos')
      .then(data => {
        if (data?.length) {
          setGastos(data)
          setLoading(false)
        } else {
          // Fallback: seed desde JSON canónico (instalaciones nuevas)
          return fetch('/data/gastos_data_canonical.json')
            .then(r => r.ok ? r.json() : [])
            .then(json => {
              const migrated = json.map(g => ({
                ...g,
                id: makeId(g),
                mes: obtenerMesCalendario(g.fecha),
                ciclo_financiero: obtenerCicloFinanciero(g.fecha),
                monto_real: g.monto_real ?? g.monto,
              }))
              if (migrated.length) guardarEnDisco('gastos', migrated).catch(() => {})
              setGastos(migrated)
            })
            .finally(() => setLoading(false))
        }
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const actualizarGasto = useCallback((_id, changes) => {
    let prevGastos = []
    setGastos(prev => {
      prevGastos = prev
      return prev.map(g => makeId(g) === _id ? { ...g, ...changes } : g)
    })
    return actualizarGastoRemoto(_id, changes).catch(error => {
      setGastos(prevGastos)
      throw error
    })
  }, [])

  const eliminarGasto = useCallback((id) => {
    setGastos(prev => prev.filter(g => makeId(g) !== id))
    eliminarGastoRemoto(id).catch(() => {})
  }, [])

  const ciclosDisponibles = [...new Set(gastos.map(g => g.ciclo_financiero).filter(Boolean))].sort().reverse()
  const mesesCalendarioDisponibles = [...new Set(gastos.map(g => g.mes).filter(Boolean))].sort().reverse()

  return { gastos, setGastos, actualizarGasto, eliminarGasto, recargar, loading, ciclosDisponibles, mesesCalendarioDisponibles }
}
