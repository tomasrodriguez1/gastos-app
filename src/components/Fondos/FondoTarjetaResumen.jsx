import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCLP } from '../../utils/formatters'
import { HistorialFondo } from '../Tarjeta/HistorialFondo'

const MONEDAS = ['CLP', 'USD']

export function FondoTarjetaResumen({ fondo, onEliminarMovimiento }) {
  const [moneda, setMoneda] = useState('CLP')
  const saldos = fondo?.saldos || { CLP: 0, USD: 0 }
  const segmento = activo => `rounded-md px-3 py-1 text-xs font-medium ${activo ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:text-slate-300'}`

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Fondo tarjeta</h3>
          <p className="text-xs text-slate-600 mt-0.5">Ingresos (aportes) y egresos (pagos) del fondo común de Edwards/BICE.</p>
        </div>
        <Link
          to="/tarjeta"
          className="text-xs px-3 py-1.5 rounded-lg border bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20 transition-colors font-medium shrink-0"
        >
          Gestionar en /tarjeta
        </Link>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
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
        <div className="flex rounded-lg border border-slate-700 bg-slate-900/40 p-0.5 ml-auto">
          {MONEDAS.map(item => <button key={item} onClick={() => setMoneda(item)} className={segmento(moneda === item)}>{item}</button>)}
        </div>
      </div>

      <HistorialFondo movimientos={fondo?.movimientos || []} moneda={moneda} onEliminar={onEliminarMovimiento} />
    </div>
  )
}
