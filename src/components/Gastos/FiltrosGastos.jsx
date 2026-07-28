import { useState } from 'react'
import { BANCOS, TODOS_LOS_TIPOS } from '../../utils/categorias'

export function FiltrosGastos({ filtros, onChange, contextos = [], bancos = BANCOS, todosTipos = TODOS_LOS_TIPOS, mesesCalendario = [] }) {
  const { banco, tipos, soloNoPagados, busqueda, contexto, mesCalendario } = filtros
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const cantFiltrosActivos = [
    banco !== '',
    tipos.length > 0,
    soloNoPagados,
    busqueda !== '',
    (contexto || '') !== '',
    (mesCalendario || '') !== '',
  ].filter(Boolean).length

  function toggleTipo(tipo) {
    const next = tipos.includes(tipo) ? tipos.filter(t => t !== tipo) : [...tipos, tipo]
    onChange({ ...filtros, tipos: next })
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      {/* Toggle mobile */}
      <button
        className="sm:hidden w-full flex items-center justify-between px-4 py-3 text-sm text-slate-300"
        onClick={() => setMostrarFiltros(v => !v)}
      >
        <span className="flex items-center gap-2">
          <span>Filtros</span>
          {cantFiltrosActivos > 0 && (
            <span className="bg-sky-500/20 text-sky-400 text-xs px-1.5 py-0.5 rounded-full border border-sky-500/30 font-medium">
              {cantFiltrosActivos}
            </span>
          )}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-slate-500 transition-transform ${mostrarFiltros ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Panel de filtros */}
      <div className={`p-4 space-y-4 ${mostrarFiltros ? 'block' : 'hidden'} sm:block`}>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 uppercase tracking-wider">Banco</label>
            <select
              value={banco}
              onChange={e => onChange({ ...filtros, banco: e.target.value })}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
            >
              <option value="">Todos</option>
              {bancos.map(b => <option key={b} value={b}>{b}</option>)}
              <option value="sin-banco">Sin banco</option>
            </select>
          </div>

          {contextos.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 uppercase tracking-wider">Contexto</label>
              <select
                value={contexto || ''}
                onChange={e => onChange({ ...filtros, contexto: e.target.value })}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="">Todos</option>
                {contextos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 uppercase tracking-wider">Mes calendario</label>
            <select
              value={mesCalendario || ''}
              onChange={e => onChange({ ...filtros, mesCalendario: e.target.value })}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
            >
              <option value="">Todos los meses del ciclo</option>
              {mesesCalendario.map(mes => <option key={mes} value={mes}>{mes}</option>)}
            </select>
          </div>

          <input
            type="text"
            placeholder="Buscar por motivo..."
            value={busqueda}
            onChange={e => onChange({ ...filtros, busqueda: e.target.value })}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 w-full sm:w-52"
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={soloNoPagados}
              onChange={e => onChange({ ...filtros, soloNoPagados: e.target.checked })}
              className="w-4 h-4 rounded accent-sky-500"
            />
            <span className="text-sm text-slate-400">Solo no pagados</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-wider self-center mr-1">Tipo</span>
          {todosTipos.map(tipo => (
            <button
              key={tipo}
              onClick={() => toggleTipo(tipo)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                tipos.includes(tipo)
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:border-slate-500'
              }`}
            >
              {tipo}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
