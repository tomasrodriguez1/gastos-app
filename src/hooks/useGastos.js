import { useState, useEffect, useCallback } from 'react'
import { cargarDeDisco, guardarEnDisco, actualizarGastoRemoto, eliminarGastoRemoto } from '../utils/persistencia'

function makeId(g) {
  return g.id || `${g.fecha}|${g.motivo?.trim().toLowerCase()}`
}

export function useGastos() {
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargarDeDisco('gastos')
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

  const actualizarGasto = useCallback((_id, changes) => {
    let prevGastos = []
    setGastos(prev => {
      prevGastos = prev
      return prev.map(g => makeId(g) === _id ? { ...g, ...changes } : g)
    })
    actualizarGastoRemoto(_id, changes).catch(() => {
      setGastos(prevGastos)
    })
  }, [])

  const eliminarGasto = useCallback((id) => {
    setGastos(prev => prev.filter(g => makeId(g) !== id))
    eliminarGastoRemoto(id).catch(() => {})
  }, [])

  const mesesDisponibles = [...new Set(gastos.map(g => g.mes))].sort().reverse()

  return { gastos, setGastos, actualizarGasto, eliminarGasto, loading, mesesDisponibles }
}
