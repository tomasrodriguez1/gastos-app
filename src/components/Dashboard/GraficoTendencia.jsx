import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { calcularUltimosMeses } from '../../utils/calculos'
import { formatCLP, formatMes } from '../../utils/formatters'

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="font-mono-numbers font-bold text-sky-400">
        {formatCLP(payload[0]?.value)}
      </div>
    </div>
  )
}

export function GraficoTendencia({ gastos, mesActual }) {
  const datos = calcularUltimosMeses(gastos, mesActual, 6)
  const data = datos.map(d => ({
    mes: formatMes(d.mes),
    total: d.total,
  }))

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
        Tendencia últimos 6 meses
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="mes"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <Tooltip content={<TooltipCustom />} cursor={{ stroke: '#334155' }} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={{ fill: '#38bdf8', r: 4, strokeWidth: 0 }}
            activeDot={{ fill: '#38bdf8', r: 6, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
