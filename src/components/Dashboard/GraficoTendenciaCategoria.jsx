import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { calcularTendenciaPorGrupo } from '../../utils/calculos'
import { formatCLP, formatMes } from '../../utils/formatters'

const COLORES = ['#38bdf8', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#eab308', '#06b6d4', '#84cc16', '#f43f5e', '#8b5cf6']

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const items = payload.filter(p => p.value > 0).sort((a, b) => b.value - a.value)
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm min-w-[160px]">
      <div className="text-slate-400 mb-2">{label}</div>
      {items.map(p => (
        <div key={p.dataKey} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }} className="truncate max-w-[100px]">{p.dataKey}</span>
          <span className="font-mono-numbers font-bold text-white">{formatCLP(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function GraficoTendenciaCategoria({ gastos, mesActual, cantidad = 6 }) {
  const { meses, grupos } = calcularTendenciaPorGrupo(gastos, mesActual, cantidad)
  const data = meses.map(d => ({ ...d, mes: formatMes(d.mes) }))

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
        Tendencia por categoría — últimos {cantidad} meses
      </h3>
      <ResponsiveContainer width="100%" height={280}>
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
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 12 }}
            iconType="circle"
            iconSize={8}
          />
          {grupos.map((grupo, i) => (
            <Line
              key={grupo}
              type="monotone"
              dataKey={grupo}
              stroke={COLORES[i % COLORES.length]}
              strokeWidth={2}
              dot={{ fill: COLORES[i % COLORES.length], r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
