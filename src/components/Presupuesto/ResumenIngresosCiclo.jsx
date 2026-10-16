import { Link } from 'react-router-dom'
import { privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { useResumenIngresos } from '../../hooks/useIngresos'

// Resumen de lo que realmente entró en el ciclo, junto a "Ingresos previstos". El registro y la
// aprobación de ingresos viven en /ingresos (DEC-020).
export function ResumenIngresosCiclo({ ciclo }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const { resumen } = useResumenIngresos(ciclo)
  const fmt = (n) => privacyFormat(n, isPrivacyModeEnabled)
  const t = resumen?.totales

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Ingresos reales del ciclo</h3>
        <Link to="/ingresos" className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 transition-colors">
          Registrar y aprobar →
        </Link>
      </div>
      {!t ? (
        <p className="text-sm text-slate-600">Cargando…</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Real (confirmado)</p>
            <p className="font-mono-numbers font-bold text-emerald-400">{fmt(t.real)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Previsto</p>
            <p className="font-mono-numbers text-slate-300">{fmt(t.previsto)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Por aprobar</p>
            <p className={`font-mono-numbers ${t.por_aprobar > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{fmt(t.por_aprobar)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
