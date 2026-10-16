import { useState } from 'react'
import { formatFecha, privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { CARD, TITULO_CARD } from './estilos'

// Pagos registrados en la app. Deshacer vuelve las clases a "No cobrado" y borra el ingreso.
export function PagosRecientes({ pagos, onDeshacer }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [error, setError] = useState(null)

  async function deshacer(pago) {
    const ok = window.confirm(
      `¿Deshacer el pago de ${pago.cobrado_a} del ${formatFecha(pago.fecha)}? ` +
      `Las ${pago.clases.length} clases vuelven a "No cobrado" y se borra el ingreso.`,
    )
    if (!ok) return
    setError(null)
    try {
      await onDeshacer(pago.id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className={CARD}>
      <h3 className={`${TITULO_CARD} mb-3`}>Pagos recientes</h3>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {pagos.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-2">Sin pagos registrados.</p>
      ) : (
        <div className="space-y-2">
          {pagos.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="text-slate-200 truncate">{p.cobrado_a}</p>
                <p className="text-xs text-slate-500">
                  {formatFecha(p.fecha)} · {p.clases.length} clase{p.clases.length === 1 ? '' : 's'}
                  {p.ciclo_financiero && ` · ciclo ${p.ciclo_financiero}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono-numbers text-emerald-400">{privacyFormat(p.monto, isPrivacyModeEnabled)}</span>
                {p.ingreso_id && (
                  <button type="button" onClick={() => deshacer(p)} className="text-xs text-slate-500 hover:text-red-400">Deshacer</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
