import { Link } from 'react-router-dom'
import { formatCLP } from '../../utils/formatters'

export function FondoTarjetaResumen({ fondo }) {
  const saldos = fondo?.saldos || { CLP: 0, USD: 0 }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Fondo tarjeta</h3>
          <p className="text-xs text-slate-600 mt-0.5">Lo aportado para pagar Edwards/BICE. Se gestiona en /tarjeta.</p>
        </div>
        <Link
          to="/tarjeta"
          className="text-xs px-3 py-1.5 rounded-lg border bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20 transition-colors font-medium shrink-0"
        >
          Ver en /tarjeta
        </Link>
      </div>
      <div className="flex gap-6">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">CLP</div>
          <div className="font-mono-numbers text-lg font-bold text-sky-400">{formatCLP(saldos.CLP || 0)}</div>
        </div>
        {saldos.USD > 0 && (
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">USD</div>
            <div className="font-mono-numbers text-lg font-bold text-sky-400">USD {saldos.USD.toFixed(2)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
