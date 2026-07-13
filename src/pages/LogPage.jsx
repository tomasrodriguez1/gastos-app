import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FiltrosGastos } from '../components/Gastos/FiltrosGastos'
import { TablaGastos } from '../components/Gastos/TablaGastos'
import { getGastoId } from '../utils/gastosIds'

const FILTROS_INIT = {
  banco: '',
  tipos: [],
  soloNoPagados: false,
  busqueda: '',
  contexto: '',
}

const LOG_LAST_VIEWED_KEY = 'logLastViewed'
const PAGE_SIZE = 50

export function LogPage({ gastos, gastosLocales, catalogos, onActualizarGasto, onEliminarGasto }) {
  const [filtros, setFiltros] = useState(FILTROS_INIT)
  const [visibles, setVisibles] = useState(PAGE_SIZE)

  // Capturar la última visita ANTES de sobreescribirla, para poder resaltar
  // lo que entró desde entonces. Se hace una sola vez al montar la página.
  const [lastViewed] = useState(() => localStorage.getItem(LOG_LAST_VIEWED_KEY))
  useEffect(() => {
    localStorage.setItem(LOG_LAST_VIEWED_KEY, new Date().toISOString())
  }, [])

  const todosOrdenados = useMemo(() => {
    return [...gastos, ...gastosLocales].sort((a, b) => {
      const ca = a.created_at || a.fecha
      const cb = b.created_at || b.fecha
      return cb.localeCompare(ca)
    })
  }, [gastos, gastosLocales])

  const nuevosIds = useMemo(() => {
    if (!lastViewed) return new Set()
    const set = new Set()
    todosOrdenados.forEach((g, i) => {
      if (g.created_at && g.created_at > lastViewed) set.add(getGastoId(g, i))
    })
    return set
  }, [todosOrdenados, lastViewed])

  const contextos = useMemo(() => {
    const set = new Set()
    todosOrdenados.forEach(g => {
      const ctx = g.contexto_override || g.contexto
      if (ctx) set.add(ctx)
    })
    return [...set].sort()
  }, [todosOrdenados])

  const filtrados = useMemo(() => {
    return todosOrdenados
      .filter(g => {
        if (filtros.banco === 'sin-banco') return !g.banco
        if (filtros.banco) return g.banco === filtros.banco
        return true
      })
      .filter(g => {
        if (!filtros.tipos.length) return true
        return (g.tipos || []).some(t => filtros.tipos.includes(t))
      })
      .filter(g => !filtros.soloNoPagados || !g.pagado)
      .filter(g => {
        if (!filtros.busqueda) return true
        return g.motivo?.toLowerCase().includes(filtros.busqueda.toLowerCase())
      })
      .filter(g => {
        if (!filtros.contexto) return true
        const ctx = g.contexto_override || g.contexto
        return ctx === filtros.contexto
      })
  }, [todosOrdenados, filtros])

  const visibleGastos = filtrados.slice(0, visibles)

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-heading text-white">Log de ingresos</h1>
          <p className="text-xs text-slate-500">Últimos gastos ingresados, ordenados por momento de inserción</p>
        </div>
        <Link
          to="/gastos"
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Volver a Gastos
        </Link>
      </div>

      {nuevosIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          <span className="font-medium">{nuevosIds.size}</span>
          gasto{nuevosIds.size !== 1 ? 's' : ''} nuevo{nuevosIds.size !== 1 ? 's' : ''} desde tu última visita
        </div>
      )}

      <FiltrosGastos
        filtros={filtros}
        onChange={f => { setFiltros(f); setVisibles(PAGE_SIZE) }}
        contextos={contextos}
        bancos={catalogos?.bancos}
        todosTipos={catalogos?.tipos}
      />

      <TablaGastos
        gastos={visibleGastos}
        onEliminar={onEliminarGasto}
        onActualizar={onActualizarGasto}
        catalogos={catalogos}
        destacarIds={nuevosIds}
      />

      {visibles < filtrados.length && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibles(v => v + PAGE_SIZE)}
            className="px-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 text-sm font-medium hover:bg-slate-700/60 transition-all"
          >
            Cargar más ({filtrados.length - visibles} restantes)
          </button>
        </div>
      )}
    </main>
  )
}
