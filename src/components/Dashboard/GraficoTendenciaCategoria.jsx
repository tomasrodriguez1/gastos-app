import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { formatCLP, formatEjeCLP } from '../../utils/formatters'

function TooltipCustom({ active, payload, label, nombre, color }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm min-w-[140px]">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="mb-1 text-xs" style={{ color }}>{nombre}</div>
      <div className="font-mono-numbers font-bold text-white">{formatCLP(payload[0]?.value)}</div>
    </div>
  )
}

export function GraficoTendenciaCategoria({ data, nombre, color }) {
  return (
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
          tickFormatter={formatEjeCLP}
          axisLine={false}
          tickLine={false}
          width={58}
        />
        <Tooltip content={<TooltipCustom nombre={nombre} color={color} />} cursor={{ stroke: '#334155' }} />
        <Line
          type="monotone"
          dataKey="valor"
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
