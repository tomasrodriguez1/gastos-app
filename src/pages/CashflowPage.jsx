import { useState } from 'react'
import { SelectorCiclo } from '../components/shared/SelectorCiclo'
import { BotonActualizar } from '../components/shared/BotonActualizar'
import { BotonBandeja } from '../components/shared/BotonBandeja'
import { ResumenMes } from '../components/Dashboard/ResumenMes'
import { GraficoBarras } from '../components/Dashboard/GraficoBarras'
import { GraficoTendencia } from '../components/Dashboard/GraficoTendencia'
import { GraficoTendenciaCategoria } from '../components/Dashboard/GraficoTendenciaCategoria'
import { SemaforoCategorias } from '../components/Dashboard/SemaforoCategorias'
import { FondosAhorro } from '../components/Dashboard/FondosAhorro'
import { FondoFGP } from '../components/Dashboard/FondoFGP'
import { SyncReview } from '../components/Dashboard/SyncReview'
import { PanelMetricasAccionables, PanelTopGastos } from '../components/Dashboard/PanelMetricasAccionables'
import { AlertasPresupuesto } from '../components/Dashboard/AlertasPresupuesto'
import { obtenerCicloActual, obtenerCicloAnterior } from '../utils/ciclos'

export function CashflowPage({ gastos, ciclos, obtenerPresupuesto, guardarPresupuesto, onSync, syncing, syncError, pendingSync, onConfirmarSync, onCancelarSync, catalogos, onAgregarGasto, onRefetchGastos, onActualizarGasto }) {
  const [ciclo, setCiclo] = useState(obtenerCicloActual)
  const [vista, setVista] = useState('ciclo')
  const presupuestoMes = obtenerPresupuesto(ciclo)
  const presupuestoMesAnterior = obtenerPresupuesto(obtenerCicloAnterior(ciclo))
  const gastosMes = gastos.filter(g => g.ciclo_financiero === ciclo)

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
    <main className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <SelectorCiclo ciclo={ciclo} ciclos={ciclos} onChange={setCiclo} />
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => setVista('ciclo')}
              className={vista === 'ciclo'
                ? 'px-4 py-1.5 rounded-md bg-slate-700 text-white text-sm font-medium transition-colors'
                : 'px-4 py-1.5 rounded-md text-slate-400 hover:text-white text-sm transition-colors'}
            >
              Este ciclo
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
          <BotonBandeja gastos={gastos} />
        </div>
      </div>

      {vista === 'ciclo' && (
        <>
          <ResumenMes gastosMes={gastosMes} presupuestoMes={presupuestoMes} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.7fr)_minmax(0,1.15fr)]">
            <GraficoBarras gastos={gastos} mes={ciclo} presupuestoMes={presupuestoMes} />
            <PanelMetricasAccionables gastos={gastos} mes={ciclo} presupuestoMes={presupuestoMes} />
            <PanelTopGastos gastos={gastos} mes={ciclo} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-6">
            <FondoFGP gastos={gastos} mes={ciclo} presupuestoMes={presupuestoMes} />
            <AlertasPresupuesto gastos={gastos} mes={ciclo} presupuestoMes={presupuestoMes} />
          </div>

          <FondosAhorro presupuestoMes={presupuestoMes} mes={ciclo} onGuardarPresupuesto={guardarPresupuesto} catalogos={catalogos} gastos={gastos} onAgregarGasto={onAgregarGasto} onRefetchGastos={onRefetchGastos} onActualizarGasto={onActualizarGasto} />

          <SemaforoCategorias
            gastos={gastos}
            mes={ciclo}
            presupuestoMes={presupuestoMes}
            presupuestoMesAnterior={presupuestoMesAnterior}
          />
        </>
      )}

      {vista === 'historico' && (
        <div className="space-y-6">
          <GraficoTendenciaCategoria gastos={gastos} mesActual={ciclo} />
          <GraficoTendencia gastos={gastos} mesActual={ciclo} />
        </div>
      )}
    </main>
    </>
  )
}
