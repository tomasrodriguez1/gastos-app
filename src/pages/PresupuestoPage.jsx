import { useState } from 'react'
import { SelectorMes } from '../components/shared/SelectorMes'
import { EditorPresupuesto } from '../components/Presupuesto/EditorPresupuesto'
import { FondosAhorro } from '../components/Dashboard/FondosAhorro'
import { getMesActual } from '../utils/formatters'

function generarMesesFuturos(cantidad = 6) {
  let [yr, mo] = getMesActual().split('-').map(Number)
  const result = []
  for (let i = 0; i < cantidad; i++) {
    result.push(`${yr}-${String(mo).padStart(2, '0')}`)
    mo++
    if (mo > 12) { mo = 1; yr++ }
  }
  return result
}

export function PresupuestoPage({ gastos, meses, obtenerPresupuesto, guardarPresupuesto, copiarMesAnterior, catalogos, onAgregarGasto, onRefetchGastos }) {
  const mesHoy = getMesActual()
  const mesesConFuturos = [...new Set([...generarMesesFuturos(6), ...meses])].sort().reverse()

  const [mes, setMes] = useState(mesHoy)
  const [copiado, setCopiado] = useState(false)
  const presupuestoMes = obtenerPresupuesto(mes)

  const esFuturo = mes > mesHoy
  const tienePresupuesto = (
    Object.keys(presupuestoMes.ingresos || {}).length > 0 ||
    Object.keys(presupuestoMes.categorias || {}).length > 0
  )

  async function handleCopiar() {
    const ok = await copiarMesAnterior(mes)
    if (ok) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  return (
    <main className="max-w-[1400px] mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <SelectorMes mes={mes} meses={mesesConFuturos} onChange={setMes} />
          {esFuturo && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
              Futuro
            </span>
          )}
        </div>
        <button
          onClick={handleCopiar}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
            copiado
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-slate-500 hover:text-slate-300'
          }`}
        >
          {copiado ? '✓ Copiado' : 'Copiar mes anterior'}
        </button>
      </div>
      {!tienePresupuesto && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-300">Sin presupuesto para este mes</p>
            <p className="text-xs text-slate-500 mt-0.5">Creá uno desde cero o copiá el mes anterior como punto de partida</p>
          </div>
          <button
            onClick={handleCopiar}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 transition-colors"
          >
            Copiar mes anterior
          </button>
        </div>
      )}
      <EditorPresupuesto
        mes={mes}
        presupuestoMes={presupuestoMes}
        gastos={gastos}
        onGuardar={datos => guardarPresupuesto(mes, datos)}
        onNuevaSubcategoria={catalogos.recargarGrupos}
      />
      <FondosAhorro
        presupuestoMes={presupuestoMes}
        mes={mes}
        onGuardarPresupuesto={guardarPresupuesto}
        catalogos={catalogos}
        gastos={gastos}
        onAgregarGasto={onAgregarGasto}
        onRefetchGastos={onRefetchGastos}
      />
    </main>
  )
}
