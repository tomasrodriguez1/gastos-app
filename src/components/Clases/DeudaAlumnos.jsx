import { formatFecha, privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { CARD, TITULO_CARD } from './estilos'

// Deuda actual por cuenta de cobro (familia o alumno sin familia): clases dictadas y no
// cobradas, sin importar el mes que se mira.
export function DeudaAlumnos({ deuda = [], onCobrar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const fmt = (n) => privacyFormat(n, isPrivacyModeEnabled)
  const total = deuda.reduce((s, d) => s + d.deuda, 0)

  return (
    <div className={CARD}>
      <h3 className={`${TITULO_CARD} mb-3`}>Deuda</h3>
      {deuda.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-2">Nadie debe clases.</p>
      ) : (
        <div className="space-y-3">
          {deuda.map(d => (
            <div key={d.familia_id != null ? `f${d.familia_id}` : `a${d.alumno_id}`} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-slate-200 truncate">{d.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {d.clases} clase{d.clases === 1 ? '' : 's'} · desde {formatFecha(d.desde)}/{d.desde.slice(0, 4)}
                    {d.apoderado_nombre && ` · ${d.apoderado_nombre}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-numbers text-amber-400">{fmt(d.deuda)}</span>
                  <button
                    type="button"
                    onClick={() => onCobrar(d)}
                    className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                  >
                    Cobrar
                  </button>
                </div>
              </div>
              {d.alumnos.length > 1 && (
                <div className="mt-1 pl-3 border-l border-slate-700/60 space-y-0.5">
                  {d.alumnos.map(a => (
                    <p key={a.alumno_id} className="flex justify-between text-xs text-slate-400">
                      <span>{a.alumno} · {a.clases} clase{a.clases === 1 ? '' : 's'}</span>
                      <span className="font-mono-numbers">{fmt(a.deuda)}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-700/50 text-sm">
            <span className="font-medium text-slate-300">Total</span>
            <span className="font-mono-numbers font-bold text-amber-400">{fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
