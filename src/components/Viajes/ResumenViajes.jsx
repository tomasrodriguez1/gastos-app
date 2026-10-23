import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatCLP, formatFecha, privacyFormat } from '../../utils/formatters'
import { resumirTodosLosViajes } from '../../utils/viajes'
import { TablaGastos } from '../Gastos/TablaGastos'

// Paleta validada (dataviz validate_palette, modo oscuro): ALE y VIAJES conservan el tono de su
// grupo (rosa / índigo) en un paso que cumple banda de luminosidad y separación CVD.
const SERIES = [
  { clave: 'ale', label: 'ALE (con la Ale)', color: '#db2777' },
  { clave: 'viajes', label: 'VIAJES', color: '#6366f1' },
  { clave: 'otros', label: 'Otros grupos', color: '#0d9488' },
]

function formatCorto(valor, privado) {
  if (privado) return '••••'
  const abs = Math.abs(valor)
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`
  if (abs >= 1000) return `$${Math.round(abs / 1000)}k`
  return formatCLP(valor)
}

function Kpi({ label, valor, detalle }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-semibold font-mono-numbers text-slate-100">{valor}</div>
      {detalle && <div className="mt-0.5 text-xs text-slate-500">{detalle}</div>}
    </div>
  )
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {SERIES.map(s => (
        <span key={s.clave} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

function TooltipViaje({ active, payload, privado }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="min-w-[220px] rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-xl">
      <div className="mb-1.5 font-medium text-slate-200">{d.nombre}</div>
      <div className="space-y-1 text-xs">
        {SERIES.map(s => (
          <div key={s.clave} className="flex items-center justify-between gap-4 text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-mono-numbers text-slate-100">{privacyFormat(d[s.clave], privado)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-4 border-t border-slate-700/60 pt-1 text-slate-300">
          <span>Total</span>
          <span className="font-mono-numbers font-semibold text-slate-100">{privacyFormat(d.total, privado)}</span>
        </div>
      </div>
    </div>
  )
}

function GraficoViajes({ porViaje, privado }) {
  const data = porViaje
    .filter(p => p.resumen.total > 0)
    .map(p => ({
      nombre: `${p.viaje.emoji ? `${p.viaje.emoji} ` : ''}${p.viaje.nombre}`,
      ale: p.ale,
      viajes: p.viajes,
      otros: p.otros,
      total: p.resumen.total,
    }))
  if (data.length === 0) return null

  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-300">Cuánto costó cada viaje</h3>
        <Leyenda />
      </div>
      <div className="mt-3" style={{ height: data.length * 44 + 32 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={10}>
            <CartesianGrid horizontal={false} stroke="#334155" strokeOpacity={0.4} />
            <XAxis
              type="number"
              tickFormatter={v => (v === 0 ? '$0' : formatCorto(v, privado))}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="nombre"
              width={130}
              tick={{ fill: '#cbd5e1', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} content={<TooltipViaje privado={privado} />} />
            {SERIES.map(s => (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                name={s.label}
                stackId="viaje"
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
                maxBarSize={22}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function TablaComparativa({ porViaje, privado }) {
  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <h3 className="px-4 pt-4 text-sm font-semibold text-slate-300 sm:px-5">Comparación</h3>
      <div className="mt-2 overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 text-left font-medium">Viaje</th>
              <th className="px-4 py-2 text-right font-medium">Días</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 text-right font-medium">Por día</th>
              <th className="px-4 py-2 text-right font-medium">Antes</th>
              <th className="px-4 py-2 text-right font-medium">ALE</th>
              <th className="px-4 py-2 text-right font-medium">vs presupuesto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {[...porViaje].reverse().map(p => {
              const dif = p.viaje.presupuesto != null ? p.viaje.presupuesto - p.resumen.total : null
              return (
                <tr key={p.viaje.id}>
                  <td className="px-4 py-2.5 text-slate-200 whitespace-nowrap">
                    {p.viaje.emoji && <span className="mr-1.5">{p.viaje.emoji}</span>}{p.viaje.nombre}
                    <span className="ml-2 text-xs text-slate-500 font-mono-numbers">
                      {formatFecha(p.viaje.fecha_desde)}/{p.viaje.fecha_desde.slice(2, 4)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-numbers text-slate-400">{p.resumen.dias}</td>
                  <td className="px-4 py-2.5 text-right font-mono-numbers text-slate-100">{privacyFormat(p.resumen.total, privado)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-numbers text-slate-300">{privacyFormat(p.porDia, privado)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-numbers text-slate-400">{privacyFormat(p.resumen.antes, privado)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-numbers text-slate-400">
                    {p.resumen.total ? `${Math.round((p.ale / p.resumen.total) * 100)}%` : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono-numbers ${dif == null ? 'text-slate-600' : dif >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dif == null ? '—' : `${dif >= 0 ? 'Sobran ' : 'Pasado '}${privacyFormat(Math.abs(dif), privado)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EnQueSeGasta({ porSubcategoria, total, privado }) {
  if (porSubcategoria.length === 0) return null
  const max = porSubcategoria[0][1]
  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-300">En qué se va la plata de viaje</h3>
      <p className="text-xs text-slate-500">Subcategorías sumando ALE, VIAJES y otros grupos.</p>
      <div className="mt-3 space-y-2.5">
        {porSubcategoria.map(([sub, monto]) => (
          <div key={sub} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
            <span className="truncate text-sm text-slate-300" title={sub}>{sub}</span>
            <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${max ? (monto / max) * 100 : 0}%` }} />
            </div>
            <span className="text-sm font-mono-numbers text-slate-200 text-right">
              {privacyFormat(monto, privado)}
              <span className="ml-1.5 text-xs text-slate-500">{total ? Math.round((monto / total) * 100) : 0}%</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function GastosPorViaje({ porViaje, catalogos, onActualizarGasto, privado }) {
  const [abiertos, setAbiertos] = useState(() => new Set())
  const conGastos = [...porViaje].reverse().filter(p => p.resumen.gastos.length > 0)
  if (conGastos.length === 0) return null

  function toggle(id) {
    setAbiertos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-300">Todos los gastos de viajes</h3>
      {conGastos.map(p => {
        const abierto = abiertos.has(p.viaje.id)
        return (
          <div key={p.viaje.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30">
            <button
              type="button"
              onClick={() => toggle(p.viaje.id)}
              aria-expanded={abierto}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.02]"
            >
              <span className="min-w-0 truncate text-sm text-slate-200">
                <span className={`mr-2 inline-block text-slate-500 transition-transform ${abierto ? 'rotate-90' : ''}`}>›</span>
                {p.viaje.emoji && <span className="mr-1.5">{p.viaje.emoji}</span>}{p.viaje.nombre}
                <span className="ml-2 text-xs text-slate-500">{p.resumen.gastos.length} gastos</span>
              </span>
              <span className="shrink-0 font-mono-numbers text-sm text-slate-100">{privacyFormat(p.resumen.total, privado)}</span>
            </button>
            {abierto && (
              <div className="border-t border-slate-700/50 p-2 sm:p-3">
                <TablaGastos
                  gastos={[...p.resumen.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha))}
                  onActualizar={onActualizarGasto}
                  catalogos={catalogos}
                  seleccionable
                />
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

export function ResumenViajes({ viajes, gastos, catalogos, onActualizarGasto }) {
  const { isPrivacyModeEnabled: privado } = usePrivacyMode()
  const anios = [...new Set(viajes.map(v => v.fecha_desde.slice(0, 4)))].sort().reverse()
  const [anio, setAnio] = useState('')
  const filtrados = anio ? viajes.filter(v => v.fecha_desde.startsWith(anio)) : viajes
  const r = resumirTodosLosViajes(filtrados, gastos)
  const enCurso = filtrados.filter(v => v.estado === 'en_curso').length
  const planificados = filtrados.filter(v => v.estado === 'planificado').length

  return (
    <div className="space-y-5">
      {anios.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {['', ...anios].map(a => (
            <button
              key={a || 'todos'}
              type="button"
              onClick={() => setAnio(a)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                anio === a
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                  : 'bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500'
              }`}
            >
              {a || 'Todos'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi
          label="Total en viajes"
          valor={privacyFormat(r.total, privado)}
          detalle={r.usd > 0 ? `+ USD ${r.usd.toFixed(2)} sin convertir` : null}
        />
        <Kpi
          label="Viajes"
          valor={r.nViajes}
          detalle={[enCurso && `${enCurso} en curso`, planificados && `${planificados} planificado${planificados === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || null}
        />
        <Kpi label="Promedio por viaje" valor={privacyFormat(r.promedioPorViaje, privado)} detalle={`${r.nConGastos} con gastos`} />
        <Kpi label="Gasto por día" valor={privacyFormat(r.promedioDiario, privado)} detalle="Durante el viaje" />
        <Kpi
          label="Con la Ale"
          valor={`${Math.round(r.pctAle * 100)}%`}
          detalle={`${privacyFormat(r.totalAle, privado)} desde ALE`}
        />
      </div>

      <GraficoViajes porViaje={r.porViaje} privado={privado} />

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <TablaComparativa porViaje={r.porViaje} privado={privado} />
        <EnQueSeGasta porSubcategoria={r.porSubcategoria} total={r.total} privado={privado} />
      </div>

      <GastosPorViaje porViaje={r.porViaje} catalogos={catalogos} onActualizarGasto={onActualizarGasto} privado={privado} />
    </div>
  )
}
