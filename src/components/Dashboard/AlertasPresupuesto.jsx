import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { calcularGastosPorGrupo, calcularPrevistoPorGrupo } from '../../utils/calculos'
import { formatCLP } from '../../utils/formatters'

export function AlertasPresupuesto({ gastos, mes, presupuestoMes }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const realPorGrupo = calcularGastosPorGrupo(gastos, mes)
  const previstoPorGrupo = calcularPrevistoPorGrupo(presupuestoMes)
  const gruposPasados = Object.entries(realPorGrupo)
    .filter(([grupo, monto]) => monto > (previstoPorGrupo[grupo] || 0))
    .sort((a, b) => (b[1] - (previstoPorGrupo[b[0]] || 0)) - (a[1] - (previstoPorGrupo[a[0]] || 0)))

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40">
      <div className="border-b border-slate-800 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-200">Alertas</h2>
      </div>
      <div className="space-y-3 p-5">
        {gruposPasados.length === 0 ? (
          <p className="text-sm text-slate-500">No hay categorias pasadas de presupuesto.</p>
        ) : gruposPasados.slice(0, 5).map(([grupo, monto]) => {
          const exceso = monto - (previstoPorGrupo[grupo] || 0)
          return (
            <div key={grupo} className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
              <div className="text-sm font-medium text-rose-300">{grupo}</div>
              <div className="mt-1 text-xs text-slate-500">
                {isPrivacyModeEnabled ? 'Sobre presupuesto' : `${formatCLP(exceso)} sobre presupuesto`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
