import { useState } from 'react'
import { getGastoId } from '../../utils/gastosIds'
import { formatCLP, formatFecha } from '../../utils/formatters'

// Tabla de reconciliación de tarjeta: gastos "por pagar" de un banco, con
// input inline para marcar "por cobrar" (split) y toggle de pagado.
// Compacta y de solo lectura salvo esos dos campos — no reemplaza TablaGastos.
export function TablaTarjeta({ gastos, onActualizarGasto }) {
  const [editandoId, setEditandoId] = useState(null)
  const [valorSplit, setValorSplit] = useState('')

  const totalMonto = gastos.reduce((s, g) => s + (g.monto || 0), 0)
  const totalSplit = gastos.reduce((s, g) => s + (g.split || 0), 0)

  function empezarEdicion(g, gastoId) {
    setEditandoId(gastoId)
    setValorSplit(String(g.split || 0))
  }

  function confirmarSplit(gastoId) {
    const n = Number(valorSplit)
    if (!Number.isNaN(n)) onActualizarGasto(gastoId, { split: n })
    setEditandoId(null)
  }

  if (gastos.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
        No hay gastos por pagar en esta tarjeta 🎉
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-16">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Motivo</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-28">Monto</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-32">Por cobrar</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-20">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {gastos.map((g, i) => {
              const gastoId = getGastoId(g, i)
              return (
                <tr key={gastoId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-mono-numbers text-xs text-slate-500">
                    {formatFecha(g.fecha)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-300 max-w-xs">
                    <div className="truncate" title={g.motivo}>{g.motivo}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-numbers font-medium text-slate-200">
                    {formatCLP(g.monto)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {editandoId === gastoId ? (
                      <input
                        type="number"
                        autoFocus
                        className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-right font-mono-numbers text-slate-200"
                        value={valorSplit}
                        onChange={e => setValorSplit(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmarSplit(gastoId); if (e.key === 'Escape') setEditandoId(null) }}
                        onBlur={() => confirmarSplit(gastoId)}
                      />
                    ) : (
                      <button
                        onClick={() => empezarEdicion(g, gastoId)}
                        className="font-mono-numbers text-sky-400 hover:text-sky-300 transition-colors"
                        title="Marcar cuánto te deben de este gasto"
                      >
                        {formatCLP(g.split || 0)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => onActualizarGasto(gastoId, { pagado: true })}
                      className="text-xs px-2 py-0.5 rounded-full border text-amber-500/70 border-amber-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                      title="Marcar como pagado"
                    >
                      Pend.
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/50 bg-slate-800/80">
              <td colSpan={2} className="px-4 py-3 text-xs text-slate-500">
                {gastos.length} movimientos
              </td>
              <td className="px-4 py-3 text-right font-mono-numbers font-bold text-slate-200">
                {formatCLP(totalMonto)}
              </td>
              <td className="px-4 py-3 text-right font-mono-numbers font-bold text-sky-400">
                {formatCLP(totalSplit)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
