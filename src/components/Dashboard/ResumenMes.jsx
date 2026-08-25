import { useCountUp } from '../../hooks/useCountUp'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatCLP, privacyFormat } from '../../utils/formatters'
import { calcularTotalIngresos, calcularTotalPrevisto, calcularProyeccionConservadora, montoDelCiclo } from '../../utils/calculos'

function Card({ label, value, rawValue, sub, color = 'text-slate-200', accent }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const hasNumericValue = typeof rawValue === 'number'
  const animatedValue = useCountUp(hasNumericValue ? rawValue : 0)
  const displayValue = hasNumericValue ? privacyFormat(animatedValue, isPrivacyModeEnabled) : value
  const accentText = accent?.rawValue !== undefined
    ? `${isPrivacyModeEnabled ? '••••••' : `${accent.rawValue > 0 ? '+' : ''}${formatCLP(accent.rawValue)}`}${accent.suffix}`
    : accent?.text

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-mono-numbers font-bold ${color}`}>{displayValue}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      {accent && <div className="text-xs mt-1" style={{ color: accent.color }}>{accentText}</div>}
    </div>
  )
}

export function ResumenMes({ gastosMes, presupuestoMes }) {
  const totalGastos = gastosMes
    .filter(g => !(g.usd > 0 && !g.monto))
    .reduce((s, g) => s + montoDelCiclo(g), 0)
  const totalIngresos = calcularTotalIngresos(presupuestoMes)
  const totalPrevisto = calcularTotalPrevisto(presupuestoMes)
  const resultado = totalIngresos - totalGastos
  const diferenciaPrevisto = totalGastos - totalPrevisto
  const savings = resultado >= 0 && totalIngresos > 0
    ? Math.round((resultado / totalIngresos) * 100)
    : null
  const proyeccion = calcularProyeccionConservadora(gastosMes, presupuestoMes)
  const diferenciaProyeccion = proyeccion - totalPrevisto

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      <Card
        label="Ingresos"
        rawValue={totalIngresos}
        color="text-emerald-400"
        sub={totalIngresos === 0 ? 'Sin datos de presupuesto' : undefined}
      />
      <Card
        label="Gastos reales"
        rawValue={totalGastos}
        color="text-slate-200"
        sub={`${gastosMes.length} movimientos`}
      />
      <Card
        label="Resultado"
        rawValue={resultado}
        color={resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}
        sub="Ingresos − Gastos"
      />
      <Card
        label="Presupuestado"
        rawValue={totalPrevisto}
        color="text-sky-400"
        accent={
          totalPrevisto > 0
            ? {
                color: diferenciaPrevisto > 0 ? '#ef4444' : '#22c55e',
                rawValue: diferenciaPrevisto,
                suffix: ' vs previsto',
              }
            : undefined
        }
      />
      <Card
        label="Tasa de ahorro"
        value={savings !== null ? `${savings}%` : '—'}
        color={savings === null ? 'text-red-400' : savings >= 20 ? 'text-emerald-400' : 'text-yellow-400'}
        sub="Resultado / Ingresos"
      />
      <Card
        label="Proyección ciclo"
        rawValue={proyeccion}
        color={diferenciaProyeccion > 0 ? 'text-red-400' : 'text-emerald-400'}
        sub="Gastado + resto presupuestado"
        accent={
          totalPrevisto > 0
            ? {
                color: diferenciaProyeccion > 0 ? '#ef4444' : '#22c55e',
                rawValue: diferenciaProyeccion,
                suffix: ' vs presupuesto',
              }
            : undefined
        }
      />
    </div>
  )
}
