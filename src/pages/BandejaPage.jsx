import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FiltrosGastos } from '../components/Gastos/FiltrosGastos'
import { TablaGastos } from '../components/Gastos/TablaGastos'

const FILTROS_INIT = {
  banco: '',
  tipos: [],
  soloNoPagados: false,
  busqueda: '',
  contexto: '',
}

export function BandejaPage({ gastos, gastosLocales, catalogos, onActualizarGasto, onEliminarGasto }) {
  const [filtros, setFiltros] = useState(FILTROS_INIT)

  const pendientes = useMemo(() => {
    return [...gastos, ...gastosLocales]
      .filter(g => g.estado === 'pendiente' || g.estado === 'error_parseo')
      .sort((a, b) => (b.created_at || b.fecha).localeCompare(a.created_at || a.fecha))
  }, [gastos, gastosLocales])

  const contextos = useMemo(() => {
    const set = new Set()
    pendientes.forEach(g => {
      const ctx = g.contexto_override || g.contexto
      if (ctx) set.add(ctx)
    })
    return [...set].sort()
  }, [pendientes])

  const filtrados = useMemo(() => {
    return pendientes
      .filter(g => {
        if (filtros.banco === 'sin-banco') return !g.banco
        if (filtros.banco) return g.banco === filtros.banco
        return true
      })
      .filter(g => {
        if (!filtros.tipos.length) return true
        return (g.tipos || []).some(t => filtros.tipos.includes(t))
      })
      .filter(g => {
        if (!filtros.busqueda) return true
        return g.motivo?.toLowerCase().includes(filtros.busqueda.toLowerCase())
      })
      .filter(g => {
        if (!filtros.contexto) return true
        const ctx = g.contexto_override || g.contexto
        return ctx === filtros.contexto
      })
  }, [pendientes, filtros])

  function confirmarTodos() {
    filtrados
      .filter(g => g.estado === 'pendiente')
      .forEach(g => onActualizarGasto(g.id, { estado: 'confirmado' }))
  }

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-heading text-white">Bandeja</h1>
          <p className="text-xs text-slate-500">
            Gastos ingresados automáticamente (mail, etc.) esperando revisión — nada se confirma solo
          </p>
        </div>
        <Link
          to="/log"
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Ver log completo →
        </Link>
      </div>

      {pendientes.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
          Bandeja vacía — no hay gastos pendientes de revisión.
        </div>
      ) : (
        <>
          <FiltrosGastos
            filtros={filtros}
            onChange={setFiltros}
            contextos={contextos}
            bancos={catalogos?.bancos}
            todosTipos={catalogos?.tipos}
          />

          {filtrados.some(g => g.estado === 'pendiente') && (
            <div className="flex justify-end">
              <button
                onClick={confirmarTodos}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
              >
                Confirmar todos los visibles
              </button>
            </div>
          )}

          <TablaGastos
            gastos={filtrados}
            onEliminar={onEliminarGasto}
            onActualizar={onActualizarGasto}
            catalogos={catalogos}
          />
        </>
      )}
    </main>
  )
}
