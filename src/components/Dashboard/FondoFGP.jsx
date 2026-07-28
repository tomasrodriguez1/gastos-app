import { calcularGastosPorSubcategoria } from '../../utils/calculos'
import { formatCLP } from '../../utils/formatters'

export function FondoFGP({ gastos, mes, presupuestoMes }) {
  const gastosPorSub = calcularGastosPorSubcategoria(gastos, mes)

  const items = []
  Object.entries(presupuestoMes?.categorias || {}).forEach(([grupo, gData]) => {
    Object.entries(gData.subcategorias || {}).forEach(([sub, s]) => {
      if (!s.fgp) return
      const real = gastosPorSub[grupo]?.[sub] || 0
      items.push({ grupo, sub, previsto: s.previsto || 0, real })
    })
  })

  if (items.length === 0) return null

  const totalPrevisto = items.reduce((s, i) => s + i.previsto, 0)
  const totalReal = items.reduce((s, i) => s + i.real, 0)
  const restante = totalPrevisto - totalReal
  const pct = totalPrevisto > 0 ? Math.min((totalReal / totalPrevisto) * 100, 100) : 0

  const barColor = pct >= 100 ? '#ef4444' : pct >= 85 ? '#eab308' : '#38bdf8'

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-700/40">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              FGP — Fondo Gastos Previstos
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">Plata reservada para gastos del ciclo</p>
          </div>
          <div className="text-right">
            <div className="font-mono-numbers text-lg font-bold text-sky-400">{formatCLP(restante)}</div>
            <div className="text-xs text-slate-600">disponible</div>
          </div>
        </div>

        {/* Total progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">
              Gastado: <span className="font-mono-numbers text-slate-300">{formatCLP(totalReal)}</span>
            </span>
            <span className="text-slate-600 font-mono-numbers">/ {formatCLP(totalPrevisto)}</span>
          </div>
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="text-right text-xs text-slate-600">{Math.round(pct)}% usado</div>
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-slate-700/30">
        {items.map(({ grupo, sub, previsto, real }) => {
          const itemPct = previsto > 0 ? Math.min((real / previsto) * 100, 100) : real > 0 ? 100 : 0
          const itemColor = itemPct >= 100 ? '#ef4444' : itemPct >= 85 ? '#eab308' : '#38bdf8'
          const dif = previsto - real
          return (
            <div key={`${grupo}-${sub}`} className="px-5 py-2.5 hover:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-700 shrink-0 font-medium uppercase tracking-wider"
                      style={{ minWidth: '2.5rem' }}>
                      {grupo.split(' ')[0].slice(0, 4)}
                    </span>
                    <span className="text-sm text-slate-300 truncate">{sub}</span>
                  </div>
                  <div className="mt-1 h-1 bg-slate-700/60 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${itemPct}%`, backgroundColor: itemColor }} />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  <div>
                    <div className="font-mono-numbers text-xs text-slate-300">{real > 0 ? formatCLP(real) : <span className="text-slate-700">—</span>}</div>
                    <div className="font-mono-numbers text-xs text-slate-600">/ {formatCLP(previsto)}</div>
                  </div>
                  <div className={`font-mono-numbers text-xs w-20 text-right ${dif >= 0 ? 'text-slate-500' : 'text-red-400'}`}>
                    {dif >= 0 ? formatCLP(dif) + ' libre' : formatCLP(Math.abs(dif)) + ' pasado'}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-slate-800/60 border-t border-slate-700/40 flex items-center justify-between">
        <span className="text-xs text-slate-600">{items.length} ítems reservados</span>
        <span className="text-xs text-slate-500">
          Total reservado: <span className="font-mono-numbers text-slate-400">{formatCLP(totalPrevisto)}</span>
        </span>
      </div>
    </div>
  )
}
