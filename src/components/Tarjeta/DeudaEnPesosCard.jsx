import { useCountUp } from '../../hooks/useCountUp'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatCLP } from '../../utils/formatters'
import { formatMontoTarjeta } from './formato'

export function DeudaEnPesosCard({ deuda, tipoCambio, onTipoCambio }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const animado = useCountUp(deuda.total || 0)
  const pesos = valor => (isPrivacyModeEnabled ? '••••••' : formatCLP(valor))
  const dolares = valor => (isPrivacyModeEnabled ? '••••••' : formatMontoTarjeta(valor, 'USD'))
  const tasaVisible = isPrivacyModeEnabled ? '••••••' : tipoCambio

  return (
    <section className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">Deuda en pesos</div>
          <div className="mt-1 font-mono-numbers text-xl font-bold text-slate-200 sm:text-2xl">
            {isPrivacyModeEnabled ? '••••••' : formatCLP(animado)}
          </div>
        </div>
        {deuda.pideTipoCambio && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            CLP por USD
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={tipoCambio}
              onChange={event => onTipoCambio(event.target.value)}
              placeholder="950"
              aria-label="CLP por USD"
              className="w-28 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-right font-mono-numbers text-sm text-slate-200 outline-none focus:border-sky-500"
            />
          </label>
        )}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-slate-500">
        <div>
          {pesos(deuda.clp)} en pesos
          {deuda.movimientosUsdPropio > 0 && <> · {dolares(deuda.usdPropioUsd)} con tipo de cambio propio = {pesos(deuda.usdPropioClp)}</>}
          {deuda.movimientosUsdTasa > 0 && <> · {dolares(deuda.usdTasaUsd)} × {tasaVisible} = {pesos(deuda.usdTasaClp)}</>}
        </div>
        {deuda.parcial && (
          <div className="text-amber-400">
            Total parcial: {deuda.sinConvertir === 1 ? 'falta 1 movimiento' : `faltan ${deuda.sinConvertir} movimientos`} ({dolares(deuda.sinConvertirUsd)}) sin tipo de cambio.
          </div>
        )}
        <div>Suma para planificar. El pago y el fondo siguen separados por moneda.</div>
      </div>
    </section>
  )
}
