import { useMemo } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { calcularComparadorMensual } from '../../utils/calculos'
import { COLOR_GRUPO } from '../../utils/categorias'
import { formatCLP, formatMes, privacyFormat } from '../../utils/formatters'
import { formatCiclo, obtenerCicloActual } from '../../utils/ciclos'

function DeltaMonto({ valor, isPrivate }) {
  if (isPrivate) return <span className="font-mono-numbers text-slate-500">••••••</span>
  const redondeado = Math.round(valor)
  const tone = redondeado > 0 ? 'text-rose-400' : redondeado < 0 ? 'text-emerald-400' : 'text-slate-500'
  return (
    <span className={`font-mono-numbers font-medium ${tone}`}>
      {redondeado > 0 ? '+' : ''}{formatCLP(redondeado)}
    </span>
  )
}

export function ComparadorMensual({ gastos, mes }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const { filas, mesAnterior, mesesPromedio } = useMemo(
    () => calcularComparadorMensual(gastos, mes),
    [gastos, mes],
  )
  const esMesEnCurso = mes === obtenerCicloActual()

  const insights = filas
    .filter(f => f.promedio > 0 && Math.abs(f.deltaPromedio) >= 10000)
    .slice(0, 3)

  const totales = filas.reduce(
    (acc, f) => ({
      actual: acc.actual + f.actual,
      anterior: acc.anterior + f.anterior,
      promedio: acc.promedio + f.promedio,
    }),
    { actual: 0, anterior: 0, promedio: 0 },
  )

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-900/40">
      <div className="border-b border-slate-800 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-200">Comparador por categoría</h2>
        <p className="mt-1 text-xs text-slate-500">
          {formatCiclo(mes)} vs {formatCiclo(mesAnterior)} y vs tu promedio de los últimos {mesesPromedio || 0} ciclos
          {esMesEnCurso && ' — ciclo en curso (parcial)'}
        </p>
      </div>

      {insights.length > 0 && (
        <div className="space-y-2 border-b border-slate-800 px-5 py-4">
          {insights.map(f => {
            const mas = f.deltaPromedio > 0
            return (
              <div key={f.grupo} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: COLOR_GRUPO[f.grupo] || '#64748b' }}
                />
                <span className="text-slate-400">
                  En {formatCiclo(mes).toLowerCase()} gastaste{' '}
                  <span className={`font-mono-numbers font-semibold ${mas ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {privacyFormat(Math.abs(Math.round(f.deltaPromedio)), isPrivacyModeEnabled)}
                  </span>{' '}
                  {mas ? 'más' : 'menos'} en <span className="text-slate-200">{f.grupo}</span> que tu promedio
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 text-right font-medium">{formatMes(mes)}</th>
              <th className="px-4 py-3 text-right font-medium">{formatMes(mesAnterior)}</th>
              <th className="px-4 py-3 text-right font-medium">Δ ciclo</th>
              <th className="px-4 py-3 text-right font-medium">Prom. {mesesPromedio}c</th>
              <th className="px-5 py-3 text-right font-medium">Δ vs prom.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  Sin gastos asignados a categorías en este período.
                </td>
              </tr>
            ) : filas.map(f => (
              <tr key={f.grupo}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: COLOR_GRUPO[f.grupo] || '#64748b' }}
                    />
                    <span className="text-slate-300">{f.grupo}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono-numbers text-slate-200">
                  {privacyFormat(f.actual, isPrivacyModeEnabled)}
                </td>
                <td className="px-4 py-3 text-right font-mono-numbers text-slate-400">
                  {privacyFormat(f.anterior, isPrivacyModeEnabled)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeltaMonto valor={f.deltaMes} isPrivate={isPrivacyModeEnabled} />
                </td>
                <td className="px-4 py-3 text-right font-mono-numbers text-slate-400">
                  {privacyFormat(Math.round(f.promedio), isPrivacyModeEnabled)}
                </td>
                <td className="px-5 py-3 text-right">
                  <DeltaMonto valor={f.deltaPromedio} isPrivate={isPrivacyModeEnabled} />
                </td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-700 text-slate-200">
                <td className="px-5 py-3 font-medium">Total</td>
                <td className="px-4 py-3 text-right font-mono-numbers font-semibold">
                  {privacyFormat(totales.actual, isPrivacyModeEnabled)}
                </td>
                <td className="px-4 py-3 text-right font-mono-numbers text-slate-400">
                  {privacyFormat(totales.anterior, isPrivacyModeEnabled)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeltaMonto valor={totales.actual - totales.anterior} isPrivate={isPrivacyModeEnabled} />
                </td>
                <td className="px-4 py-3 text-right font-mono-numbers text-slate-400">
                  {privacyFormat(Math.round(totales.promedio), isPrivacyModeEnabled)}
                </td>
                <td className="px-5 py-3 text-right">
                  <DeltaMonto valor={totales.actual - totales.promedio} isPrivate={isPrivacyModeEnabled} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}
