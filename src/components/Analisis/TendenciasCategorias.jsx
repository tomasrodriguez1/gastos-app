import { useMemo } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { calcularTendenciasCategorias, obtenerMesAnterior } from '../../utils/calculos'
import { COLOR_GRUPO } from '../../utils/categorias'
import { getMesActual, privacyFormat } from '../../utils/formatters'

function Sparkline({ valores, color }) {
  if (valores.length < 2) return null
  const w = 90
  const h = 26
  const max = Math.max(...valores, 1)
  const puntos = valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * (w - 4) + 2
      const y = h - 3 - (v / max) * (h - 6)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={puntos}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BadgeDireccion({ direccion, pct }) {
  if (direccion === 'alza') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-400">
        ↗ +{pct.toFixed(0)}%
      </span>
    )
  }
  if (direccion === 'baja') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
        ↘ {pct.toFixed(0)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-500">
      → estable
    </span>
  )
}

export function TendenciasCategorias({ gastos, mes, cantidad = 6 }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  // El mes en curso está incompleto: la tendencia se calcula hasta el mes anterior
  const mesHasta = mes === getMesActual() ? obtenerMesAnterior(mes) : mes
  const tendencias = useMemo(
    () => calcularTendenciasCategorias(gastos, mesHasta, cantidad),
    [gastos, mesHasta, cantidad],
  )

  const enAlza = tendencias.filter(t => t.direccion === 'alza').length
  const enBaja = tendencias.filter(t => t.direccion === 'baja').length

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Promedio y tendencia por categoría</h2>
          <p className="mt-1 text-xs text-slate-500">
            Últimos {cantidad} meses hasta {mesHasta} — sin contar el mes en curso
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {enAlza > 0 && (
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-rose-400">
              {enAlza} en alza
            </span>
          )}
          {enBaja > 0 && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
              {enBaja} a la baja
            </span>
          )}
        </div>
      </div>

      {tendencias.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-500">Sin datos suficientes para calcular tendencias.</div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {tendencias.map(t => {
            const color = COLOR_GRUPO[t.grupo] || '#64748b'
            return (
              <div key={t.grupo} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="truncate text-sm text-slate-300">{t.grupo}</span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="hidden sm:block">
                    <Sparkline valores={t.valores} color={color} />
                  </div>
                  <div className="w-24 text-right">
                    <div className="font-mono-numbers text-sm font-semibold text-slate-200">
                      {privacyFormat(Math.round(t.promedio), isPrivacyModeEnabled)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-600">prom/mes</div>
                  </div>
                  <div className="w-24 text-right">
                    <BadgeDireccion direccion={t.direccion} pct={t.pct} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
