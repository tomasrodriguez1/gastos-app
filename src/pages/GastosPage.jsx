import { useState, useMemo, useEffect } from 'react'
import { SelectorMes } from '../components/shared/SelectorMes'
import { BotonActualizar } from '../components/shared/BotonActualizar'
import { FiltrosGastos } from '../components/Gastos/FiltrosGastos'
import { TablaGastos } from '../components/Gastos/TablaGastos'
import { FormNuevoGasto } from '../components/Gastos/FormNuevoGasto'
import { DuplicadosReview } from '../components/Gastos/DuplicadosReview'
import { SyncReview } from '../components/Dashboard/SyncReview'
import { useDuplicados } from '../hooks/useDuplicados'
import { getMesActual } from '../utils/formatters'

const FILTROS_INIT = {
  banco: '',
  tipos: [],
  soloNoPagados: false,
  busqueda: '',
  contexto: '',
}

export function GastosPage({ gastos, gastosLocales, meses, onAgregarGasto, onEliminarGasto, onActualizarGasto, catalogos, onSync, syncing, syncError, pendingSync, onConfirmarSync, onCancelarSync }) {
  const [mes, setMes] = useState(getMesActual)
  const [filtros, setFiltros] = useState(FILTROS_INIT)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarDuplicados, setMostrarDuplicados] = useState(false)

  const { grupos, resumen, loading: loadingDup, error: errorDup, cargar: cargarDup, excluirPar, refrescar: refrescarDup } = useDuplicados()

  // Pre-carga del resumen al cambiar de mes para mostrar el badge
  useEffect(() => {
    cargarDup(mes)
  }, [mes, cargarDup])

  const todosLosGastos = useMemo(() => {
    return [...gastos, ...gastosLocales].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [gastos, gastosLocales])

  const gastosMes = useMemo(() => todosLosGastos.filter(g => g.mes === mes), [todosLosGastos, mes])

  const contextos = useMemo(() => {
    const set = new Set()
    gastosMes.forEach(g => {
      const ctx = g.contexto_override || g.contexto
      if (ctx) set.add(ctx)
    })
    return [...set].sort()
  }, [gastosMes])

  const gastosFiltrados = useMemo(() => {
    return gastosMes
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
  }, [gastosMes, filtros])

  const manualesDelMes = gastosLocales.filter(g => g.mes === mes).length

  function handleGuardar(gasto) {
    onAgregarGasto(gasto)
    setMostrarForm(false)
  }

  return (
    <>
    {pendingSync && (
      <SyncReview
        pendingSync={pendingSync}
        onConfirmar={onConfirmarSync}
        onCancelar={onCancelarSync}
        catalogos={catalogos}
      />
    )}
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <SelectorMes mes={mes} meses={meses} onChange={m => { setMes(m); setFiltros(FILTROS_INIT) }} />
        <div className="flex items-center gap-3">
          {manualesDelMes > 0 && (
            <span className="text-xs text-violet-400">
              {manualesDelMes} manual{manualesDelMes !== 1 ? 'es' : ''}
            </span>
          )}
          <span className="text-xs text-slate-500">{gastosFiltrados.length} registros</span>
          <BotonActualizar onSync={onSync} syncing={syncing} error={syncError} />
          <button
            onClick={() => setMostrarDuplicados(true)}
            className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 text-sm font-medium hover:bg-slate-700/60 transition-all"
          >
            Duplicados
            {resumen?.gastos_afectados > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-900 px-1">
                {resumen.gastos_afectados}
              </span>
            )}
          </button>
          <button
            onClick={() => setMostrarForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400 text-sm font-medium hover:bg-violet-500/20 transition-all"
          >
            <span className="text-base leading-none">+</span>
            Nuevo gasto
          </button>
        </div>
      </div>

      <FiltrosGastos
        filtros={filtros}
        onChange={setFiltros}
        contextos={contextos}
        bancos={catalogos?.bancos}
        todosTipos={catalogos?.tipos}
      />
      <TablaGastos gastos={gastosFiltrados} onEliminar={onEliminarGasto} onActualizar={onActualizarGasto} catalogos={catalogos} />

      {mostrarForm && (
        <FormNuevoGasto
          onGuardar={handleGuardar}
          onCerrar={() => setMostrarForm(false)}
          catalogos={catalogos}
        />
      )}

      {mostrarDuplicados && (
        <DuplicadosReview
          grupos={grupos}
          resumen={resumen}
          loading={loadingDup}
          error={errorDup}
          mes={mes}
          onActualizar={onActualizarGasto}
          onEliminar={onEliminarGasto}
          onExcluir={excluirPar}
          onRefrescar={refrescarDup}
          onCerrar={() => setMostrarDuplicados(false)}
          catalogos={catalogos}
        />
      )}
    </main>
    </>
  )
}
