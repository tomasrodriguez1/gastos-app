import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar, BarChart, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { calcularGastosPorGrupo } from '../../utils/calculos'
import { COLOR_GRUPO } from '../../utils/categorias'
import { formatCLP, formatMes, privacyFormat } from '../../utils/formatters'
import { formatCiclo, obtenerDiaDelCiclo } from '../../utils/ciclos'

const DESDE_MES = '2026-01'

const FALLBACK_COLORS = [
  '#38bdf8',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#eab308',
  '#06b6d4',
  '#84cc16',
  '#f43f5e',
  '#8b5cf6',
]

function getViewOptions(dia) {
  return [
    { id: 'stacked', label: 'Stacked' },
    { id: 'dia', label: `Día ${dia}` },
    { id: 'money', label: '$' },
    { id: 'percent', label: '%' },
  ]
}

function generarMeses(desde, hasta) {
  if (!hasta || hasta < desde) return []

  const [startYear, startMonth] = desde.split('-').map(Number)
  const [endYear, endMonth] = hasta.split('-').map(Number)
  const meses = []
  let year = startYear
  let month = startMonth

  while (year < endYear || (year === endYear && month <= endMonth)) {
    meses.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return meses
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return '0.0%'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function TrendLine({ label, value, previous, type, isPrivate }) {
  const hasValue = value != null
  const isHigherSpend = hasValue && value > 0
  const isLowerSpend = hasValue && value < 0
  const tone = isHigherSpend ? 'text-rose-400' : isLowerSpend ? 'text-emerald-400' : 'text-slate-500'
  const icon = isHigherSpend ? '↗' : isLowerSpend ? '↘' : '→'

  let display
  if (type === 'money') {
    display = isPrivate ? '••••••' : `${value > 0 ? '+' : ''}${formatCLP(value || 0)}`
  } else if (previous === 0 && value !== 0) {
    display = value > 0 ? '+100.0%' : '-100.0%'
  } else {
    display = formatPercent(value || 0)
  }

  return (
    <div className="flex items-center gap-1 text-sm text-slate-500">
      <span>{display} {label}</span>
      <span className={tone}>{icon}</span>
    </div>
  )
}

function StackedTooltip({ active, payload, label, isPrivate }) {
  if (!active || !payload?.length) return null

  const items = payload
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="min-w-[220px] rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="font-medium text-slate-300">{formatCiclo(label)}</span>
        <span className="font-mono-numbers font-bold text-white">
          {privacyFormat(total, isPrivate)}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <div className="text-xs text-slate-500">Sin gastos</div>
        ) : items.map(item => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-slate-400">{item.dataKey}</span>
            </div>
            <span className="font-mono-numbers font-semibold text-slate-100">
              {privacyFormat(item.value, isPrivate)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangeTooltip({ active, payload, isPrivate, mode }) {
  if (!active || !payload?.length) return null

  const point = payload[0].payload
  const change = point.change || 0
  const percent = point.percent
  const positive = change > 0
  const negative = change < 0
  const tone = positive ? 'text-rose-400' : negative ? 'text-emerald-400' : 'text-slate-300'

  return (
    <div className="min-w-[180px] rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-xl">
      <div className="font-medium text-slate-300">{formatCiclo(point.mes)}</div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <span className="text-slate-500">Cambio</span>
        <span className={`font-mono-numbers font-semibold ${tone}`}>
          {mode === 'money'
            ? (isPrivate ? '••••••' : `${change > 0 ? '+' : ''}${formatCLP(change)}`)
            : formatPercent(percent)}
        </span>
      </div>
    </div>
  )
}

export function GraficoEvolucionPresupuesto({ gastos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const scrollRef = useRef(null)
  const [vista, setVista] = useState('stacked')
  const ahora = new Date()
  const fechaHoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  const diaHoy = obtenerDiaDelCiclo(fechaHoy)
  const VIEW_OPTIONS = getViewOptions(diaHoy)

  const {
    data,
    grupos,
    colores,
    totalUltimoMes,
    cambioMes,
    porcentajeMes,
    porcentajePeriodo,
    cambioData,
  } = useMemo(() => {
    const fechaCorte = new Date()
    const fechaCorteLocal = `${fechaCorte.getFullYear()}-${String(fechaCorte.getMonth() + 1).padStart(2, '0')}-${String(fechaCorte.getDate()).padStart(2, '0')}`
    const diaCorte = obtenerDiaDelCiclo(fechaCorteLocal)
    const gastosBase = vista === 'dia'
      ? gastos.filter(g => obtenerDiaDelCiclo(g.fecha) <= diaCorte)
      : gastos

    const ultimoMes = [...new Set(gastosBase.map(gasto => gasto.ciclo_financiero).filter(Boolean))]
      .filter(mes => mes >= DESDE_MES)
      .sort()
      .at(-1)

    const meses = generarMeses(DESDE_MES, ultimoMes)
    const gruposSet = new Set()

    const rows = meses.map(mes => {
      const porGrupo = calcularGastosPorGrupo(gastosBase, mes)
      Object.keys(porGrupo).forEach(grupo => gruposSet.add(grupo))
      return {
        mes,
        ...porGrupo,
      }
    })

    const gruposOrdenados = [...gruposSet].sort((a, b) => {
      const totalA = rows.reduce((sum, row) => sum + (row[a] || 0), 0)
      const totalB = rows.reduce((sum, row) => sum + (row[b] || 0), 0)
      return totalB - totalA
    })

    const colorPorGrupo = Object.fromEntries(
      gruposOrdenados.map((grupo, index) => [
        grupo,
        COLOR_GRUPO[grupo] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      ]),
    )

    const ultimo = rows.at(-1)
    const total = ultimo
      ? gruposOrdenados.reduce((sum, grupo) => sum + (ultimo[grupo] || 0), 0)
      : 0
    const rowsConTotal = rows.map(row => ({
      ...row,
      total: gruposOrdenados.reduce((sum, grupo) => sum + (row[grupo] || 0), 0),
    }))
    const ultimoConTotal = rowsConTotal.at(-1)
    const anteriorConTotal = rowsConTotal.at(-2)
    const primerConTotal = rowsConTotal[0]
    const cambio = ultimoConTotal && anteriorConTotal
      ? ultimoConTotal.total - anteriorConTotal.total
      : 0
    const porcentaje = anteriorConTotal?.total
      ? (cambio / Math.abs(anteriorConTotal.total)) * 100
      : 0
    const cambioPeriodo = ultimoConTotal && primerConTotal
      ? ultimoConTotal.total - primerConTotal.total
      : 0
    const porcentajeDesdeInicio = primerConTotal?.total
      ? (cambioPeriodo / Math.abs(primerConTotal.total)) * 100
      : 0
    const changes = rowsConTotal.map((row, index) => {
      const prev = rowsConTotal[index - 1]
      const change = prev ? row.total - prev.total : 0
      const percent = prev?.total ? (change / Math.abs(prev.total)) * 100 : 0
      return {
        mes: row.mes,
        change,
        percent,
      }
    })

    return {
      data: rowsConTotal,
      grupos: gruposOrdenados,
      colores: colorPorGrupo,
      totalUltimoMes: total,
      cambioMes: cambio,
      porcentajeMes: porcentaje,
      porcentajePeriodo: porcentajeDesdeInicio,
      cambioData: changes,
    }
  }, [gastos, vista])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [data])

  if (!data.length || !grupos.length) {
    return (
      <section className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold text-slate-200">Evolución por ciclo y categoría</h2>
        <div className="mt-6 flex h-[260px] items-center justify-center text-sm text-slate-500">
          Sin datos desde enero 2026.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-900/40">
      <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-200">Evolución por ciclo y categoría</h2>
          <div className="mt-2 font-mono-numbers text-3xl font-bold tracking-tight text-white">
            {privacyFormat(totalUltimoMes, isPrivacyModeEnabled)}
          </div>
          {vista === 'dia' && (
            <div className="mt-1 text-xs text-slate-500">
              Gastos hasta el día {diaHoy} de cada ciclo
            </div>
          )}
          <div className="mt-2 space-y-1">
            <TrendLine
              label="este ciclo"
              value={porcentajeMes}
              previous={totalUltimoMes - cambioMes}
              type="percent"
              isPrivate={isPrivacyModeEnabled}
            />
            <TrendLine
              label="desde enero 2026"
              value={porcentajePeriodo}
              previous={data[0]?.total || 0}
              type="percent"
              isPrivate={isPrivacyModeEnabled}
            />
          </div>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg border border-slate-700/50 bg-slate-800/50 p-1">
          {VIEW_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setVista(option.id)}
              className={vista === option.id
                ? 'rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors'
                : 'rounded-md px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-white'}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto px-3 py-5 scrollbar-thin">
        <div style={{ minWidth: `${data.length * 60}px` }}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={vista === 'stacked' || vista === 'dia' ? data : cambioData} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
              <XAxis
                dataKey="mes"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatMes}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={value => vista === 'percent' ? `${value.toFixed(0)}%` : `$${(value / 1000).toFixed(0)}k`}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                content={vista === 'stacked' || vista === 'dia'
                  ? <StackedTooltip isPrivate={isPrivacyModeEnabled} />
                  : <ChangeTooltip isPrivate={isPrivacyModeEnabled} mode={vista} />}
                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
              />
              {vista !== 'stacked' && vista !== 'dia' && (
                <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
              )}
              {(vista === 'stacked' || vista === 'dia') && (
                <>
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 14 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  {grupos.map(grupo => (
                    <Bar
                      key={grupo}
                      dataKey={grupo}
                      stackId="presupuesto"
                      fill={colores[grupo]}
                      radius={0}
                    >
                      {data.map(row => (
                        <Cell key={`${grupo}-${row.mes}`} fill={colores[grupo]} />
                      ))}
                    </Bar>
                  ))}
                </>
              )}
              {vista !== 'stacked' && vista !== 'dia' && (
                <Bar dataKey={vista === 'money' ? 'change' : 'percent'} radius={[4, 4, 0, 0]}>
                  {cambioData.map(row => {
                    const value = vista === 'money' ? row.change : row.percent
                    return (
                      <Cell
                        key={`${vista}-${row.mes}`}
                        fill={value > 0 ? '#fb7185' : value < 0 ? '#34d399' : '#64748b'}
                      />
                    )
                  })}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}
