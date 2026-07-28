import { useState, useCallback } from 'react'

export function useDuplicados() {
  const [grupos, setGrupos] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const cargar = useCallback(async (ciclo) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gastos/duplicados?ciclo=${ciclo}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setGrupos(data.grupos ?? [])
      setResumen(data.resumen ?? null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const excluirPar = useCallback(async (idA, idB, ciclo) => {
    await fetch('/api/gastos/duplicados/excluir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_a: idA, id_b: idB }),
    }).catch(() => {})
    if (ciclo) await cargar(ciclo)
  }, [cargar])

  const refrescar = useCallback((ciclo) => {
    if (ciclo) cargar(ciclo)
  }, [cargar])

  return { grupos, resumen, loading, error, cargar, excluirPar, refrescar }
}
