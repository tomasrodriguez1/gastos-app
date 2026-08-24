import { useState, useMemo } from 'react'
import { FiltrosGastos } from '../Gastos/FiltrosGastos'
import { TablaGastos } from '../Gastos/TablaGastos'
import { usePendientes } from '../../hooks/usePendientes'

const FILTROS_INIT = {
  banco: '',
  tipos: [],
  soloNoPagados: false,
  busqueda: '',
  contexto: '',
}

// Lista de bandeja (filtros + confirmar todos + tabla) — extraída de
// BandejaPage para poder embeberse también en AgentePage sin duplicar la
// lógica de filtrado/confirmación.
export function BandejaLista({ gastos, gastosLocales, catalogos, onActualizarGasto, onEliminarGasto }) {
  const [filtros, setFiltros] = useState(FILTROS_INIT)

  const pendientes = usePendientes(gastos, gastosLocales)

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

  if (pendientes.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
        Bandeja vacía — no hay gastos pendientes de revisión.
      </div>
    )
  }

  return (
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
  )
}
