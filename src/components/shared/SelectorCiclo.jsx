import { formatCiclo, formatRangoCiclo } from '../../utils/ciclos'

export function SelectorCiclo({ ciclo, ciclos, onChange }) {
  const idx = ciclos.indexOf(ciclo)

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => idx < ciclos.length - 1 && onChange(ciclos[idx + 1])}
        disabled={idx >= ciclos.length - 1}
        aria-label="Ciclo anterior"
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ←
      </button>
      <div className="min-w-44 text-center">
        <div className="text-base font-semibold text-slate-200">{formatCiclo(ciclo)}</div>
        <div className="text-[11px] text-slate-500">{formatRangoCiclo(ciclo)}</div>
      </div>
      <button
        onClick={() => idx > 0 && onChange(ciclos[idx - 1])}
        disabled={idx <= 0}
        aria-label="Ciclo siguiente"
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        →
      </button>
    </div>
  )
}
