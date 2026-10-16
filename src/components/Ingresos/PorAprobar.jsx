import { useState } from 'react'
import { formatFecha, privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { BOTON_PRIMARIO, CARD, TITULO_CARD } from '../Clases/estilos'
import { EditorIngreso } from './EditorIngreso'

const ORIGEN = {
  mcp: { etiqueta: 'MCP', estilo: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
  chat: { etiqueta: 'Agente', estilo: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  clases: { etiqueta: 'Pago de clases', estilo: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  manual: { etiqueta: 'Manual', estilo: 'border-slate-600 bg-slate-700/40 text-slate-300' },
}

// Ingresos y pagos de clases que registró una IA y esperan aprobación humana (DEC-020). No
// cuentan como ingreso real hasta que se aprueban. Un pago de clases se aprueba completo (pago,
// ingreso y clases pagadas) y no se edita acá: si hay que cambiarlo, se descarta y se vuelve a cobrar.
export function PorAprobar({ pendientes, fuentes, fondosSugeridos, onAprobar, onDescartar, onEditar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [editando, setEditando] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(null)

  async function correr(id, fn) {
    setError(null)
    setOcupado(id)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(null)
    }
  }

  function descartar(p) {
    const detalle = p.origen === 'clases' ? ' Las clases quedan sin cobrar.' : ''
    if (window.confirm(`¿Descartar ${p.fuente} por ${privacyFormat(p.monto, false)}?${detalle}`)) {
      correr(p.id, () => onDescartar(p.id))
    }
  }

  return (
    <section className={`${CARD} ${pendientes.length ? 'border-amber-500/40' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={TITULO_CARD}>Por aprobar</h2>
        {pendientes.length > 0 && (
          <span className="text-xs rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5">{pendientes.length}</span>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {pendientes.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-2">No hay ingresos esperando aprobación.</p>
      ) : (
        <div className="divide-y divide-slate-700/40">
          {pendientes.map(p => {
            const origen = ORIGEN[p.origen] || ORIGEN.manual
            if (editando === p.id) {
              return (
                <div key={p.id} className="py-3">
                  <EditorIngreso
                    inicial={p}
                    fuentes={fuentes}
                    fondosSugeridos={fondosSugeridos}
                    textoBoton="Guardar"
                    onGuardar={async (datos) => { await onEditar(p.id, datos); setEditando(null) }}
                    onCancelar={() => setEditando(null)}
                  />
                </div>
              )
            }
            return (
              <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm text-slate-200 flex items-center gap-2 flex-wrap">
                    {p.fuente}
                    <span className={`text-[10px] rounded-full border px-1.5 py-0.5 ${origen.estilo}`}>{origen.etiqueta}</span>
                  </p>
                  <p className="text-xs text-slate-500 break-words">
                    {formatFecha(p.fecha)} · ciclo {p.ciclo_financiero}
                    {p.cobrado_a && ` · ${p.cobrado_a} · ${p.clases} clase${p.clases === 1 ? '' : 's'}`}
                    {p.fondo && ` · fondo ${p.fondo}`}
                    {p.nota && ` · ${p.nota}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono-numbers text-slate-100">{privacyFormat(p.monto, isPrivacyModeEnabled)}</span>
                  <button type="button" disabled={ocupado === p.id} onClick={() => correr(p.id, () => onAprobar(p.id))} className={BOTON_PRIMARIO}>Aprobar</button>
                  {p.origen !== 'clases' && (
                    <button type="button" onClick={() => setEditando(p.id)} className="text-xs text-slate-500 hover:text-emerald-400">Editar</button>
                  )}
                  <button type="button" disabled={ocupado === p.id} onClick={() => descartar(p)} className="text-xs text-slate-500 hover:text-red-400">Descartar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
