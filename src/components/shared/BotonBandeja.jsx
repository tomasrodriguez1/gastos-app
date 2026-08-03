import { Link } from 'react-router-dom'

function IconBandeja() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

export function BotonBandeja({ gastos, compact = false }) {
  const pendientes = gastos.filter(g => g.estado === 'pendiente' || g.estado === 'error_parseo').length

  return (
    <Link
      to="/bandeja"
      title="Bandeja de gastos por revisar"
      className={`relative flex items-center gap-2 rounded-lg border font-medium transition-all ${
        pendientes > 0
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
          : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:bg-slate-700/60'
      } ${compact ? 'px-2.5 py-2 text-base' : 'px-4 py-2 text-sm'}`}
    >
      <IconBandeja />
      {!compact && 'Bandeja'}
      {pendientes > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-900 px-1">
          {pendientes}
        </span>
      )}
    </Link>
  )
}
