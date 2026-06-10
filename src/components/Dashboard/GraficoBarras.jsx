import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from 'recharts'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { calcularGastosPorGrupo, calcularPrevistoPorGrupo } from '../../utils/calculos'
import { formatCLP, privacyFormat } from '../../utils/formatters'

const COLOR_AHORRO = '#6fca6e'
const COLOR_SOBRE = '#d85149'

function formatShortCLP(value, isPrivate = false) {
  if (isPrivate) return '••••••'
  const abs = Math.abs(value)
  if (abs >= 1000000) return `${value < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`
  if (abs >= 1000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1000)}k`
  return formatCLP(value)
}

function TooltipCustom({ active, payload, label, isPrivate }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  const ahorro = item.diferencia >= 0

  return (
    <div className="min-w-[220px] rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-xl">
      <div className="text-slate-300 font-medium mb-1">{label}</div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-4 text-slate-400">
          <span>Real</span>
          <span className="font-mono-numbers text-slate-100">{privacyFormat(item.real, isPrivate)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-400">
          <span>Previsto</span>
          <span className="font-mono-numbers text-slate-100">{privacyFormat(item.previsto, isPrivate)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-400">
          <span>{ahorro ? 'Ahorro' : 'Sobre gasto'}</span>
          <span className={`font-mono-numbers font-semibold ${ahorro ? 'text-emerald-400' : 'text-rose-400'}`}>
            {privacyFormat(Math.abs(item.diferencia), isPrivate)}
          </span>
        </div>
      </div>
    </div>
  )
}

function DiffLabel({ x, y, width, height, value, isPrivate }) {
  if (value === 0) return null

  const ahorro = value > 0
  const label = formatShortCLP(Math.abs(value), isPrivate)
  const textX = ahorro ? x + width + 8 : x +width - 8
  const anchor = ahorro ? 'start' : 'end'

  return (
    <text
      x={textX}
      y={y + height / 2 + 4}
      fill={ahorro ? COLOR_AHORRO : COLOR_SOBRE}
      fontSize={12}
      fontWeight={600}
      textAnchor={anchor}
      fontFamily="'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
    >
      {label}
    </text>
  )
}

function wrapLabel(text, maxLength = 22) {
  if (text.length <= maxLength) return [text]

  const words = text.split(' ')
  const lines = []
  let current = ''

  words.forEach(word => {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxLength) {
      current = next
    } else {
      if (current) lines.push(current)
      current = word
    }
  })

  if (current) lines.push(current)

  if (lines.length <= 2) return lines

  const secondLine = lines.slice(1).join(' ')
  return [
    lines[0],
    secondLine.length > maxLength ? `${secondLine.slice(0, maxLength - 1)}…` : secondLine,
  ]
}

function CategoryTick({ x, y, payload }) {
  const lines = wrapLabel(String(payload.value || ''))

  return (
    <foreignObject x={x - 188} y={y - 18} width={178} height={36}>
      <div className="flex h-full flex-col items-end justify-center text-right text-xs font-semibold leading-tight text-slate-300">
        {lines.map(line => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </foreignObject>
  )
}

function MobileDiffRows({ data, maxAbs, isPrivate }) {
  return (
    <div className="space-y-4 sm:hidden">
      {data.map(item => {
        const ahorro = item.diferencia >= 0
        const width = Math.max(5, Math.min(100, (Math.abs(item.diferencia) / maxAbs) * 100))
        const amount = isPrivate ? '••••••' : `${ahorro ? '+' : '-'}${formatShortCLP(Math.abs(item.diferencia))}`

        return (
          <div key={item.nombre} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight text-slate-200">{item.nombre}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>Real {privacyFormat(item.real, isPrivate)}</span>
                  <span>Previsto {privacyFormat(item.previsto, isPrivate)}</span>
                </div>
              </div>
              <div className={`shrink-0 font-mono-numbers text-sm font-bold ${ahorro ? 'text-emerald-400' : 'text-rose-400'}`}>
                {amount}
              </div>
            </div>

            <div className="relative h-3 rounded-full bg-slate-950/45">
              <div className="absolute left-1/2 top-[-3px] h-[18px] w-px bg-slate-600/80" />
              <div className="absolute inset-y-0 left-0 w-1/2 pr-1">
                {!ahorro && (
                  <div
                    className="ml-auto h-full rounded-full bg-rose-500"
                    style={{ width: `${width}%` }}
                  />
                )}
              </div>
              <div className="absolute inset-y-0 right-0 w-1/2 pl-1">
                {ahorro && (
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${width}%` }}
                  />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GraficoBarras({ gastos, mes, presupuestoMes }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const gastosPorGrupo = calcularGastosPorGrupo(gastos, mes)
  const previstoPorGrupo = calcularPrevistoPorGrupo(presupuestoMes)

  const allGrupos = new Set([...Object.keys(gastosPorGrupo), ...Object.keys(previstoPorGrupo)])
  const data = [...allGrupos]
    .map(grupo => ({
      nombre: grupo,
      real: gastosPorGrupo[grupo] || 0,
      previsto: previstoPorGrupo[grupo] || 0,
    }))
    .map(d => ({
      ...d,
      diferencia: d.previsto - d.real,
    }))
    .filter(d => d.real !== 0 || d.previsto !== 0)
    .sort((a, b) => b.diferencia - a.diferencia)

  const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.diferencia)))
  const domainLimit = Math.ceil(maxAbs * 2.45)
  const totalReal = data.reduce((sum, item) => sum + item.real, 0)
  const totalPrevisto = data.reduce((sum, item) => sum + item.previsto, 0)
  const diferenciaTotal = totalPrevisto - totalReal
  const totalAhorro = diferenciaTotal >= 0
  const chartHeight = Math.max(340, data.length * 38 + 72)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50">
      <div className="px-4 py-4 text-center sm:px-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          Desviación neta
          <span className="block">(Real vs. Previsto)</span>
        </h3>
      </div>

      <div className="px-4 pb-4">
        <MobileDiffRows data={data} maxAbs={maxAbs} isPrivate={isPrivacyModeEnabled} />

        <div className="hidden sm:block">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 8, right: 132, top: 8, bottom: 48 }}
            >
            <XAxis
              type="number"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={v => v === 0 ? '$0' : formatShortCLP(v, isPrivacyModeEnabled)}
              axisLine={false}
              tickLine={false}
              domain={[-domainLimit, domainLimit]}
            />
            <YAxis
              dataKey="nombre"
              type="category"
              tick={<CategoryTick />}
              width={198}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<TooltipCustom isPrivate={isPrivacyModeEnabled} />}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <ReferenceLine x={0} stroke="#64748b" strokeWidth={1} />
            <Bar dataKey="diferencia" name="Diferencia" radius={[3, 3, 3, 3]} barSize={22}>
              {data.map(entry => {
                return (
                  <Cell
                    key={entry.nombre}
                    fill={entry.diferencia >= 0 ? COLOR_AHORRO : COLOR_SOBRE}
                  />
                )
              })}
              <LabelList
                dataKey="diferencia"
                content={props => (
                  <DiffLabel
                    {...props}
                    isPrivate={isPrivacyModeEnabled}
                  />
                )}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>

        <div className="mt-5 flex items-center justify-center gap-6 text-sm sm:mt-1">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLOR_AHORRO }} />
            Ahorro
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLOR_SOBRE }} />
            Sobre gasto
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-700/50 bg-slate-950/35 px-5 py-3 text-sm">
        <span className={totalAhorro ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
          {totalAhorro ? 'Ahorro' : 'Sobre gasto'}
        </span>
        <span className="text-slate-400">Real</span>
        <span className={totalAhorro ? 'font-mono-numbers font-bold text-emerald-400' : 'font-mono-numbers font-bold text-rose-400'}>
          {isPrivacyModeEnabled ? '••••••' : `${totalAhorro ? '+' : '-'}${formatShortCLP(Math.abs(diferenciaTotal))}`}
        </span>
      </div>
    </div>
  )
}
