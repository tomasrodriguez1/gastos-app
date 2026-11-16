import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatCLP } from '../../utils/formatters'
import { HistorialFondo } from '../Tarjeta/HistorialFondo'
import { ControlesFondo } from '../Tarjeta/ControlesFondo'
import { deudaEnPesos, saldoAbonos } from '../Tarjeta/deudaEnPesos'

const MONEDAS = ['CLP', 'USD']
const BANCOS = ['Edwards', 'BICE']

// Misma deuda que /tarjeta, pero sin tipo de cambio escrito: los USD sin monto_clp_manual quedan sin convertir.
function Cobertura({ saldo, deuda, oculto }) {
  if (deuda.total === 0 && !deuda.parcial) return <span className="text-slate-500">No hay deuda pendiente: todo el fondo está libre.</span>
  const despues = saldo - deuda.total
  const pendienteUsd = deuda.parcial ? ` · ${deuda.sinConvertir} movimientos USD sin convertir (ver en /tarjeta)` : ''
  if (despues >= 0) return <span className="text-emerald-400">Cubre la deuda de {oculto(formatCLP(deuda.total))}; quedan {oculto(formatCLP(despues))} libres{pendienteUsd}.</span>
  return <span className="text-rose-400">Faltan {oculto(formatCLP(Math.abs(despues)))} para cubrir la deuda de {oculto(formatCLP(deuda.total))}{pendienteUsd}.</span>
}

export function FondoTarjetaResumen({ reconciliacion, gastos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const oculto = valor => (isPrivacyModeEnabled ? '••••••' : valor)
  const [moneda, setMoneda] = useState('CLP')
  const fondo = reconciliacion?.fondo
  const saldos = fondo?.saldos || { CLP: 0, USD: 0 }
  const saldoClp = Math.round(Number(saldos.CLP) || 0)
  const ciclos = reconciliacion?.ciclos
  const saldosAbonos = reconciliacion?.abonos?.saldos
  const deuda = useMemo(
    () => deudaEnPesos(gastos, { bancos: BANCOS, ciclos, abonos: saldoAbonos(saldosAbonos, BANCOS) }),
    [gastos, ciclos, saldosAbonos],
  )
  const segmento = activo => `rounded-md px-3 py-1 text-xs font-medium ${activo ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:text-slate-300'}`

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Fondo tarjeta</h3>
          <p className="text-xs text-slate-600 mt-0.5">Fondo común de Edwards/BICE. Acá se aporta y retira; los pagos se registran en /tarjeta.</p>
        </div>
        <Link
          to="/tarjeta"
          className="text-xs px-3 py-1.5 rounded-lg border bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20 transition-colors font-medium shrink-0"
        >
          Pagar en /tarjeta
        </Link>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-6">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">CLP</div>
            <div className="font-mono-numbers text-lg font-bold text-sky-400">{oculto(formatCLP(saldoClp))}</div>
          </div>
          {saldos.USD > 0 && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">USD</div>
              <div className="font-mono-numbers text-lg font-bold text-sky-400">{oculto(`USD ${saldos.USD.toFixed(2)}`)}</div>
            </div>
          )}
        </div>
        <div className="flex rounded-lg border border-slate-700 bg-slate-900/40 p-0.5 ml-auto">
          {MONEDAS.map(item => <button key={item} onClick={() => setMoneda(item)} className={segmento(moneda === item)}>{item}</button>)}
        </div>
      </div>

      <p className="text-sm"><Cobertura saldo={saldoClp} deuda={deuda} oculto={oculto} /></p>

      <ControlesFondo
        saldo={saldoClp}
        onAportar={reconciliacion?.aportarFondo}
        onRetirar={reconciliacion?.retirarFondo}
        onAjustarSaldo={reconciliacion?.ajustarSaldoFondo}
      />

      <HistorialFondo movimientos={fondo?.movimientos || []} moneda={moneda} onEliminar={reconciliacion?.eliminarMovimientoFondo} />
    </div>
  )
}
