import { useState } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatFecha } from '../../utils/formatters'
import { formatMontoTarjeta } from './formato'

const ETIQUETAS = { aporte: 'Aporte', ajuste: 'Ajuste', pago: 'Pago' }
const VISIBLES = 10

export function HistorialFondoCompleto({ movimientos, saldos, onEliminar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [vista, setVista] = useState('aportes')
  const [verTodos, setVerTodos] = useState(false)
  const [error, setError] = useState('')
  const filtrados = vista === 'aportes' ? movimientos.filter(mov => mov.tipo === 'aporte') : movimientos
  const visibles = verTodos ? filtrados : filtrados.slice(0, VISIBLES)

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista)
    setVerTodos(false)
    setError('')
  }

  async function eliminar(mov) {
    if (!window.confirm(`¿Borrar ${ETIQUETAS[mov.tipo].toLowerCase()} de ${formatMontoTarjeta(mov.monto, mov.moneda)}?`)) return
    setError('')
    try {
      await onEliminar(mov.id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50" aria-labelledby="historial-fondo-title">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-700/50 bg-slate-900/20 p-4 sm:p-5">
        <div>
          <h2 id="historial-fondo-title" className="text-sm font-semibold text-slate-200">Aportes al fondo de tarjetas</h2>
          <p className="mt-1 text-xs text-slate-500">El fondo es común para Edwards y BICE y se administra en pesos.</p>
          <div className="mt-3 flex rounded-lg border border-slate-700 bg-slate-900/70 p-0.5" role="group" aria-label="Tipo de movimiento del fondo">
            <button type="button" onClick={() => cambiarVista('aportes')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${vista === 'aportes' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-500 hover:text-slate-300'}`}>Solo aportes</button>
            <button type="button" onClick={() => cambiarVista('todos')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${vista === 'todos' ? 'bg-sky-500/15 text-sky-300' : 'text-slate-500 hover:text-slate-300'}`}>Historial completo</button>
          </div>
        </div>
        <div className="text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-600">Saldo operativo CLP</div>
            <div className="mt-1 font-mono-numbers text-lg font-bold text-emerald-400">{isPrivacyModeEnabled ? '••••••' : formatMontoTarjeta(saldos?.CLP || 0, 'CLP')}</div>
          </div>
        </div>
      </div>

      {error && <p className="border-b border-slate-700/40 px-4 py-3 text-xs text-rose-400">{error}</p>}

      {filtrados.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">{vista === 'aportes' ? 'Todavía no hay aportes registrados.' : 'Todavía no hay movimientos en el fondo.'}</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="w-24 px-4 py-3 text-left">Fecha</th>
                <th className="w-24 px-4 py-3 text-left">Tipo</th>
                <th className="w-24 px-4 py-3 text-center">Moneda</th>
                <th className="px-4 py-3 text-left">Detalle</th>
                <th className="w-36 px-4 py-3 text-right">Monto</th>
                <th className="w-14 px-4 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {visibles.map(mov => (
                <tr key={mov.id} className="group hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono-numbers text-xs text-slate-500">{formatFecha(mov.fecha)}</td>
                  <td className={`px-4 py-3 ${mov.tipo === 'pago' ? 'text-rose-400' : mov.tipo === 'aporte' ? 'text-emerald-400' : 'text-amber-400'}`}>{ETIQUETAS[mov.tipo]}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-md bg-slate-700/40 px-2 py-1 font-mono-numbers text-[10px] font-semibold ${mov.moneda === 'USD' ? 'text-violet-300' : 'text-sky-300'}`}>{mov.moneda}</span></td>
                  <td className="px-4 py-3 text-slate-400">{mov.nota || (mov.banco ? `${ETIQUETAS[mov.tipo]} ${mov.banco}` : 'Sin nota')}</td>
                  <td className={`px-4 py-3 text-right font-mono-numbers font-medium ${mov.monto < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{isPrivacyModeEnabled ? '••••••' : `${mov.monto > 0 ? '+' : ''}${formatMontoTarjeta(mov.monto, mov.moneda)}`}</td>
                  <td className="px-4 py-3 text-right">{mov.tipo !== 'pago' && <button type="button" onClick={() => eliminar(mov)} title="Borrar movimiento" className="text-slate-600 transition-colors hover:text-rose-400 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100">×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtrados.length > VISIBLES && (
        <div className="border-t border-slate-700/40 px-4 py-3">
          <button type="button" onClick={() => setVerTodos(!verTodos)} className="text-[11px] text-slate-500 hover:text-slate-300">{verTodos ? 'Ver menos' : `Ver ${filtrados.length - VISIBLES} más`}</button>
        </div>
      )}
    </section>
  )
}
