import { useState } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatFecha } from '../../utils/formatters'
import { formatMontoTarjeta } from './formato'

const ETIQUETAS = { aporte: 'Aporte', ajuste: 'Ajuste', pago: 'Pago' }
const VISIBLES = 8

export function HistorialFondo({ movimientos, moneda, onEliminar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [verTodos, setVerTodos] = useState(false)
  const [error, setError] = useState('')
  const filtrados = movimientos.filter(mov => mov.moneda === moneda)
  const visibles = verTodos ? filtrados : filtrados.slice(0, VISIBLES)

  async function eliminar(mov) {
    if (!window.confirm(`¿Borrar ${ETIQUETAS[mov.tipo].toLowerCase()} de ${formatMontoTarjeta(mov.monto, moneda)}?`)) return
    setError('')
    try {
      await onEliminar(mov.id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Movimientos del fondo</h2>
        <span className="text-xs text-slate-600">{moneda}</span>
      </div>
      {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}
      {filtrados.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-600">Sin movimientos. Usá “+ Aportar”.</p>
      ) : (
        <ul className="space-y-1.5">
          {visibles.map(mov => (
            <li key={mov.id} className="group flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 font-mono-numbers text-slate-600">{formatFecha(mov.fecha)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-400" title={mov.nota || ''}>
                {ETIQUETAS[mov.tipo]}{mov.banco ? ` ${mov.banco}` : ''}{mov.nota && mov.tipo === 'aporte' ? ` · ${mov.nota}` : ''}
              </span>
              <span className={`font-mono-numbers ${mov.monto < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isPrivacyModeEnabled ? '••••' : `${mov.monto > 0 ? '+' : ''}${formatMontoTarjeta(mov.monto, moneda)}`}
              </span>
              {mov.tipo !== 'pago' && (
                <button type="button" onClick={() => eliminar(mov)} title="Borrar" className="text-slate-600 hover:text-rose-400 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100">×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {filtrados.length > VISIBLES && (
        <button type="button" onClick={() => setVerTodos(!verTodos)} className="mt-2 text-[11px] text-slate-500 hover:text-slate-300">
          {verTodos ? 'Ver menos' : `Ver ${filtrados.length - VISIBLES} más`}
        </button>
      )}
    </section>
  )
}
