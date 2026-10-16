// Clases de Tailwind compartidas por los formularios de /clases (mismo look que IngresosReales).
export const INPUT = 'bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-emerald-500'
export const BOTON_PRIMARIO = 'px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
export const BOTON_SECUNDARIO = 'px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors'
export const CARD = 'bg-slate-800/50 border border-slate-700/50 rounded-xl p-5'
export const TITULO_CARD = 'text-sm font-medium text-slate-400 uppercase tracking-wider'

export function formatHoras(horas) {
  return `${String(horas).replace('.', ',')} h`
}
