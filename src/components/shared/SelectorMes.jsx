import { formatMesLargo } from '../../utils/formatters'

export function SelectorMes({ mes, meses, onChange }) {
  const idx = meses.indexOf(mes)

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => idx < meses.length - 1 && onChange(meses[idx + 1])}
        disabled={idx >= meses.length - 1}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ←
      </button>
      <span className="text-lg font-semibold text-slate-200 min-w-36 text-center">
        {formatMesLargo(mes)}
      </span>
      <button
        onClick={() => idx > 0 && onChange(meses[idx - 1])}
        disabled={idx <= 0}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        →
      </button>
    </div>
  )
}
