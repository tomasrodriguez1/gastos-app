import { useState } from 'react'
import { SelectorMes } from '../components/shared/SelectorMes'
import { BotonActualizar } from '../components/shared/BotonActualizar'
import { ResumenMes } from '../components/Dashboard/ResumenMes'
import { GraficoBarras } from '../components/Dashboard/GraficoBarras'
import { GraficoTendencia } from '../components/Dashboard/GraficoTendencia'
import { GraficoTendenciaCategoria } from '../components/Dashboard/GraficoTendenciaCategoria'
import { SemaforoCategorias } from '../components/Dashboard/SemaforoCategorias'
import { FondosAhorro } from '../components/Dashboard/FondosAhorro'
import { FondoFGP } from '../components/Dashboard/FondoFGP'
import { SyncReview } from '../components/Dashboard/SyncReview'
import { PanelMetricasAccionables } from '../components/Dashboard/PanelMetricasAccionables'
import { AlertasPresupuesto } from '../components/Dashboard/AlertasPresupuesto'
import { getMesActual } from '../utils/formatters'

function obtenerMesAnterior(mes) {
  const [yr, mo] = mes.split('-').map(Number)
  let prevMo = mo - 1
  let prevYr = yr
  if (prevMo <= 0) {
    prevMo = 12
    prevYr--
  }
  return `${prevYr}-${String(prevMo).padStart(2, '0')}`
}

export function CashflowPage({ gastos, meses, obtenerPresupuesto, guardarPresupuesto, onSync, syncing, syncError, pendingSync, onConfirmarSync, onCancelarSync, catalogos, onAgregarGasto, onRefetchGastos }) {
  const [mes, setMes] = useState(getMesActual)
  const [vista, setVista] = useState('mes')
  const presupuestoMes = obtenerPresupuesto(mes)
  const presupuestoMesAnterior = obtenerPresupuesto(obtenerMesAnterior(mes))
  const gastosMes = gastos.filter(g => g.mes === mes)

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
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <SelectorMes mes={mes} meses={meses} onChange={setMes} />
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => setVista('mes')}
              className={vista === 'mes'
                ? 'px-4 py-1.5 rounded-md bg-slate-700 text-white text-sm font-medium transition-colors'
                : 'px-4 py-1.5 rounded-md text-slate-400 hover:text-white text-sm transition-colors'}
            >
              Este Mes
            </button>
            <button
              onClick={() => setVista('historico')}
              className={vista === 'historico'
                ? 'px-4 py-1.5 rounded-md bg-slate-700 text-white text-sm font-medium transition-colors'
                : 'px-4 py-1.5 rounded-md text-slate-400 hover:text-white text-sm transition-colors'}
            >
              Histórico
            </button>
          </div>
          <BotonActualizar onSync={onSync} syncing={syncing} error={syncError} />
        </div>
      </div>

      {vista === 'mes' && (
        <>
          <ResumenMes gastosMes={gastosMes} presupuestoMes={presupuestoMes} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GraficoBarras gastos={gastos} mes={mes} presupuestoMes={presupuestoMes} />
            <PanelMetricasAccionables gastos={gastos} mes={mes} presupuestoMes={presupuestoMes} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-6">
            <FondoFGP gastos={gastos} mes={mes} presupuestoMes={presupuestoMes} />
            <AlertasPresupuesto gastos={gastos} mes={mes} presupuestoMes={presupuestoMes} />
          </div>

          <FondosAhorro presupuestoMes={presupuestoMes} mes={mes} onGuardarPresupuesto={guardarPresupuesto} catalogos={catalogos} gastos={gastos} onAgregarGasto={onAgregarGasto} onRefetchGastos={onRefetchGastos} />

          <SemaforoCategorias
            gastos={gastos}
            mes={mes}
            presupuestoMes={presupuestoMes}
            presupuestoMesAnterior={presupuestoMesAnterior}
          />
        </>
      )}

      {vista === 'historico' && (
        <div className="space-y-6">
          <GraficoTendenciaCategoria gastos={gastos} mesActual={mes} />
          <GraficoTendencia gastos={gastos} mesActual={mes} />
        </div>
      )}
    </main>
    </>
  )
}
