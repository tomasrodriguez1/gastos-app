import { useCountUp } from '../../hooks/useCountUp'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatCLP } from '../../utils/formatters'
import { fondoEnPesos } from './deudaEnPesos'
import { formatMontoTarjeta } from './formato'

function porcentaje(parte, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, (parte / total) * 100))
}

function CoberturaEnPesos({ total, facturado, fondo, pesos, usdSinConvertir }) {
  const escala = Math.max(total, fondo, 1)
  const faltaFacturado = facturado - fondo
  const faltaTotal = total - fondo

  let estado
  if (total === 0) estado = <span className="text-slate-500">Sin deuda pendiente en pesos.</span>
  else if (faltaTotal <= 0) estado = <span className="text-emerald-400">El fondo cubre toda la deuda pendiente.</span>
  else if (faltaFacturado <= 0) estado = <span className="text-emerald-400">El fondo cubre lo ya facturado · faltan {pesos(faltaTotal)} para lo no facturado.</span>
  else estado = <span className="text-rose-400">Faltan {pesos(faltaFacturado)} para cubrir lo ya facturado.</span>

  return (
    <div className="min-w-0 flex-1 sm:min-w-80">
      <div className="mb-2 text-xs sm:text-right">{estado}</div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">Deuda</span>
          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-slate-900/60">
            <div className="h-full bg-violet-500/70" style={{ width: `${porcentaje(facturado, escala)}%` }} title="Ya facturado" />
            <div className="h-full bg-amber-500/50" style={{ width: `${porcentaje(total - facturado, escala)}%` }} title="No facturado" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">Fondo</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-900/60">
            <div className="h-full bg-emerald-500/70" style={{ width: `${porcentaje(fondo, escala)}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 sm:justify-end">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500/70" />Facturado</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500/50" />No facturado</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500/70" />Fondo aportado</span>
      </div>
      {usdSinConvertir && (
        <p className="mt-1 text-[11px] text-amber-400 sm:text-right">El fondo en USD no entra hasta cargar el tipo de cambio.</p>
      )}
    </div>
  )
}

export function DeudaEnPesosCard({ deuda, tipoCambio, onTipoCambio, fondoSaldos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const animado = useCountUp(deuda.total || 0)
  const fondo = fondoEnPesos(fondoSaldos, tipoCambio)
  const pesos = valor => (isPrivacyModeEnabled ? '••••••' : formatCLP(valor))
  const dolares = valor => (isPrivacyModeEnabled ? '••••••' : formatMontoTarjeta(valor, 'USD'))
  const tasaVisible = isPrivacyModeEnabled ? '••••••' : tipoCambio
  const mostrarTasa = deuda.pideTipoCambio || fondo.usd !== 0

  return (
    <section className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-wider text-slate-500">Deuda en pesos</div>
        {mostrarTasa && (
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
      <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0 font-mono-numbers text-xl font-bold text-slate-200 sm:text-2xl">
          {isPrivacyModeEnabled ? '••••••' : formatCLP(animado)}
        </div>
        <CoberturaEnPesos
          total={deuda.total || 0}
          facturado={deuda.facturado || 0}
          fondo={fondo.total}
          pesos={pesos}
          usdSinConvertir={fondo.usdSinConvertir}
        />
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
