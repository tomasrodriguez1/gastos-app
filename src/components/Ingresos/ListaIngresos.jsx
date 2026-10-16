import { useState } from 'react'
import { formatFecha, privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { CARD, TITULO_CARD } from '../Clases/estilos'
import { EditorIngreso } from './EditorIngreso'

// Ingresos del ciclo (confirmados y pendientes). Los de pagos de clases no se editan ni se borran
// acá: se corrigen deshaciendo el pago en /clases.
export function ListaIngresos({ ingresos, fuentes, fondosSugeridos, onEditar, onEliminar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [editando, setEditando] = useState(null)
  const [error, setError] = useState(null)

  async function eliminar(i) {
    if (!window.confirm(`¿Eliminar ${i.fuente} por ${privacyFormat(i.monto, false)}?`)) return
    setError(null)
    try {
      await onEliminar(i.id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className={CARD}>
      <h2 className={`${TITULO_CARD} mb-3`}>Ingresos del ciclo</h2>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {ingresos.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-2">Sin ingresos registrados este ciclo.</p>
      ) : (
        <div className="divide-y divide-slate-700/40">
          {ingresos.map(i => editando === i.id ? (
            <div key={i.id} className="py-3">
              <EditorIngreso
                inicial={i}
                fuentes={fuentes}
                fondosSugeridos={fondosSugeridos}
                textoBoton="Guardar"
                onGuardar={async (datos) => { await onEditar(i.id, datos); setEditando(null) }}
                onCancelar={() => setEditando(null)}
              />
            </div>
          ) : (
            <div key={i.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-slate-200 truncate">
                  {i.fuente}
                  {i.estado === 'pendiente' && <span className="ml-2 text-[10px] rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5">por aprobar</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {formatFecha(i.fecha)} · {i.origen === 'clases' ? 'pago de clases' : i.origen}
                  {i.fondo && ` · fondo ${i.fondo}`}{i.nota && ` · ${i.nota}`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono-numbers text-emerald-400">{privacyFormat(i.monto, isPrivacyModeEnabled)}</span>
                {i.origen === 'clases' ? (
                  <span className="text-[10px] uppercase tracking-wider text-slate-500" title="Se corrige deshaciendo el pago en Clases">Clases</span>
                ) : (
                  <>
                    <button type="button" onClick={() => setEditando(i.id)} className="text-xs text-slate-500 hover:text-emerald-400">Editar</button>
                    <button type="button" onClick={() => eliminar(i)} className="text-xs text-slate-500 hover:text-red-400">Eliminar</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
