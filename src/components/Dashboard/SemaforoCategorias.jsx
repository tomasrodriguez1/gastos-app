import { calcularGastosPorGrupo, calcularPrevistoPorGrupo, semaforo } from '../../utils/calculos'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { privacyFormat } from '../../utils/formatters'
import { COLOR_GRUPO } from '../../utils/categorias'

const COLOR_TEXT = {
  verde:    'text-emerald-400',
  amarillo: 'text-yellow-400',
  rojo:     'text-red-400',
  naranja:  'text-orange-400',
  gris:     'text-slate-600',
}

const ORDER = { rojo: 0, naranja: 1, amarillo: 2, verde: 3, gris: 4 }

export function SemaforoCategorias({ gastos, mes, presupuestoMes, presupuestoMesAnterior }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const gastosPorGrupo = calcularGastosPorGrupo(gastos, mes)
  const previstoPorGrupo = calcularPrevistoPorGrupo(presupuestoMes)
  const previstoPorGrupoAnterior = presupuestoMesAnterior
    ? calcularPrevistoPorGrupo(presupuestoMesAnterior)
    : {}

  const allGrupos = new Set([...Object.keys(gastosPorGrupo), ...Object.keys(previstoPorGrupo)])
  const items = [...allGrupos]
    .map(grupo => {
      const real = gastosPorGrupo[grupo] || 0
      const previsto = previstoPorGrupo[grupo] || 0
      const estado = semaforo(real, previsto)
      return { grupo, real, previsto, estado }
    })
    .filter(d => d.real !== 0 || d.previsto !== 0)
    .sort((a, b) => ORDER[a.estado] - ORDER[b.estado])

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
        Estado por categoría
      </h3>
      <div className="space-y-2">
        {items.map(({ grupo, real, previsto, estado }) => {
          const pct = previsto > 0 ? Math.min((real / previsto) * 100, 200) : real > 0 ? 100 : 0
          const previstoAnterior = previstoPorGrupoAnterior[grupo] ?? 0
          const pctSobrePrevisto = previstoAnterior > 0 ? (real / previstoAnterior - 1) * 100 : null
          const barColor = estado === 'verde'    ? '#22c55e'
                         : estado === 'amarillo' ? '#eab308'
                         : estado === 'rojo'     ? '#ef4444'
                         : estado === 'naranja'  ? '#f97316'
                         : '#475569'
          return (
            <div key={grupo} className="flex items-center gap-3">
              <span
                className="text-xs w-3"
                style={{ color: COLOR_GRUPO[grupo] || barColor }}
              >●</span>
              <span className="text-sm text-slate-300 w-36 shrink-0 truncate">{grupo}</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
              </div>
              <span className={`font-mono-numbers text-xs w-24 text-right ${COLOR_TEXT[estado]}`}>
                {privacyFormat(real, isPrivacyModeEnabled)}
              </span>
              {pctSobrePrevisto !== null && (
                <span className={`text-xs font-mono-numbers w-12 text-right ${pctSobrePrevisto > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {pctSobrePrevisto > 0 ? '+' : ''}{Math.round(pctSobrePrevisto)}%
                </span>
              )}
              {previsto > 0 && (
                <span className="font-mono-numbers text-xs text-slate-600 w-24 text-right">
                  / {privacyFormat(previsto, isPrivacyModeEnabled)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
