import { useState } from 'react'
import { SelectorCiclo } from '../components/shared/SelectorCiclo'
import { EditorPresupuesto } from '../components/Presupuesto/EditorPresupuesto'
import { FondosAhorro } from '../components/Dashboard/FondosAhorro'
import { desplazarPeriodo, obtenerCicloActual } from '../utils/ciclos'

function generarCiclosFuturos(cantidad = 6) {
  const actual = obtenerCicloActual()
  return Array.from({ length: cantidad }, (_, index) => desplazarPeriodo(actual, index))
}

export function PresupuestoPage({ gastos, ciclos, obtenerPresupuesto, guardarPresupuesto, copiarCicloAnterior, catalogos, onAgregarGasto, onRefetchGastos }) {
  const cicloActual = obtenerCicloActual()
  const ciclosConFuturos = [...new Set([...generarCiclosFuturos(6), ...ciclos])].sort().reverse()

  const [ciclo, setCiclo] = useState(cicloActual)
  const [copiado, setCopiado] = useState(false)
  const presupuestoMes = obtenerPresupuesto(ciclo)

  const esFuturo = ciclo > cicloActual
  const tienePresupuesto = (
    Object.keys(presupuestoMes.ingresos || {}).length > 0 ||
    Object.keys(presupuestoMes.categorias || {}).length > 0
  )

  async function handleCopiar() {
    const ok = await copiarCicloAnterior(ciclo)
    if (ok) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  return (
    <main className="max-w-[1400px] mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <SelectorCiclo ciclo={ciclo} ciclos={ciclosConFuturos} onChange={setCiclo} />
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
          {copiado ? '✓ Copiado' : 'Copiar ciclo anterior'}
        </button>
      </div>
      {!tienePresupuesto && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-300">Sin presupuesto para este ciclo financiero</p>
            <p className="text-xs text-slate-500 mt-0.5">Creá uno desde cero o copiá el ciclo anterior como punto de partida</p>
          </div>
          <button
            onClick={handleCopiar}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 transition-colors"
          >
            Copiar ciclo anterior
          </button>
        </div>
      )}
      <EditorPresupuesto
        mes={ciclo}
        presupuestoMes={presupuestoMes}
        gastos={gastos}
        onGuardar={datos => guardarPresupuesto(ciclo, datos)}
        onNuevaSubcategoria={catalogos.recargarGrupos}
      />
      <FondosAhorro
        presupuestoMes={presupuestoMes}
        mes={ciclo}
        onGuardarPresupuesto={guardarPresupuesto}
        catalogos={catalogos}
        gastos={gastos}
        onAgregarGasto={onAgregarGasto}
        onRefetchGastos={onRefetchGastos}
      />
    </main>
  )
}
