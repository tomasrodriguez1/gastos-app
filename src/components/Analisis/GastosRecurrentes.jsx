import { useMemo } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { detectarRecurrentes } from '../../utils/recurrentes'
import { COLOR_GRUPO } from '../../utils/categorias'
import { formatCLP, formatFecha, privacyFormat } from '../../utils/formatters'

function BadgeEstado({ item }) {
  if (item.estado === 'cobrado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
        ✓ Cobrado
      </span>
    )
  }
  if (item.estado === 'esperado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-400">
        Se espera ~día {item.diaTipico}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
      ⚠ No llegó este mes
    </span>
  )
}

function BadgeVariacion({ item, isPrivate }) {
  if (!item.subio && !item.bajo) return null
  const tone = item.subio
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`} title={isPrivate ? undefined : `Antes: ${formatCLP(Math.round(item.promedioPrevio))}`}>
      {item.subio ? '↗' : '↘'} {item.variacionPct > 0 ? '+' : ''}{item.variacionPct.toFixed(0)}%
    </span>
  )
}

export function GastosRecurrentes({ gastos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const { recurrentes, totalMensual } = useMemo(() => detectarRecurrentes(gastos), [gastos])

  const alertas = recurrentes.filter(r => r.estado === 'atrasado' || r.subio).length

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Recurrentes y suscripciones</h2>
          <p className="mt-1 text-xs text-slate-500">
            Cargos detectados automáticamente que se repiten mes a mes (mínimo 3 meses)
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-slate-400">
            {recurrentes.length} detectados
          </span>
          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-sky-300">
            ~{privacyFormat(Math.round(totalMensual), isPrivacyModeEnabled)}/mes
          </span>
          {alertas > 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-400">
              {alertas} {alertas === 1 ? 'alerta' : 'alertas'}
            </span>
          )}
        </div>
      </div>

      {recurrentes.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-500">
          Aún no se detectan gastos recurrentes. Se necesitan cargos con el mismo motivo en al menos 3 meses distintos.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Cargo</th>
                <th className="px-4 py-3 text-right font-medium">Monto típico</th>
                <th className="px-4 py-3 text-right font-medium">Último cobro</th>
                <th className="px-4 py-3 text-center font-medium">Meses</th>
                <th className="px-5 py-3 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {recurrentes.map(item => (
                <tr key={item.clave}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: COLOR_GRUPO[item.grupo] || '#64748b' }}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-200">{item.nombre}</div>
                        <div className="text-xs text-slate-600">{item.grupo || 'Sin categoría'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono-numbers text-slate-200">
                    {privacyFormat(Math.round(item.montoMediana), isPrivacyModeEnabled)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <BadgeVariacion item={item} isPrivate={isPrivacyModeEnabled} />
                      <div>
                        <div className="font-mono-numbers text-slate-300">
                          {privacyFormat(Math.round(item.montoUltimo), isPrivacyModeEnabled)}
                        </div>
                        <div className="text-xs text-slate-600">{formatFecha(item.ultimaFecha)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono-numbers text-slate-500">
                    {item.mesesPresentes.length}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <BadgeEstado item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
