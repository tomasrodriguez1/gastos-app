import { useMemo, useRef, useState } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { GraficoTendenciaCategoria } from '../Dashboard/GraficoTendenciaCategoria'
import { calcularTendenciasCategorias, obtenerMesAnterior } from '../../utils/calculos'
import { COLOR_GRUPO } from '../../utils/categorias'
import { formatCLP, formatMes, privacyFormat } from '../../utils/formatters'
import { obtenerCicloActual } from '../../utils/ciclos'

const COLOR_TOTAL = '#38bdf8'
const GRUPOS_SIN_ALARMA = new Set(['AHORROS O INVERSIONES', 'EMPRENDIMIENTO'])

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

function formatDelta(valor, isPrivate) {
  if (isPrivate) return '••••••'
  const redondeado = Math.round(valor)
  if (redondeado > 0) return `+${formatCLP(redondeado)}`
  return formatCLP(redondeado)
}

function mesCorto(mes) {
  return formatMes(mes).split(' ')[0]
}

function BadgeDireccion({ direccion, pct, pico, picoMes, neutro }) {
  if (pico) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
        pico · {mesCorto(picoMes)}
      </span>
    )
  }
  if (direccion === 'alza') {
    const tone = neutro
      ? 'border-slate-600 bg-slate-800/80 text-slate-300'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
        ↗ +{pct.toFixed(0)}%
      </span>
    )
  }
  if (direccion === 'baja') {
    const tone = neutro
      ? 'border-slate-600 bg-slate-800/80 text-slate-300'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
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

function tonoDelta(direccion, neutro, pico) {
  if (neutro || pico || direccion === 'estable') return 'text-slate-400'
  if (direccion === 'alza') return 'text-rose-400'
  if (direccion === 'baja') return 'text-emerald-400'
  return 'text-slate-400'
}

export function TendenciasCategorias({ gastos, mes, cantidad = 6 }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const graficoRef = useRef(null)
  const [seleccion, setSeleccion] = useState(null)
  const esCicloAbierto = mes === obtenerCicloActual()
  const mesHasta = esCicloAbierto ? obtenerMesAnterior(mes) : mes
  const tendencias = useMemo(
    () => calcularTendenciasCategorias(gastos, mesHasta, cantidad),
    [gastos, mesHasta, cantidad],
  )

  const cuenta = (direccion) => tendencias.filter(t =>
    t.direccion === direccion && !t.pico && !GRUPOS_SIN_ALARMA.has(t.grupo)
  ).length
  const enAlza = cuenta('alza')
  const enBaja = cuenta('baja')
  const picos = tendencias.filter(t => t.pico).length

  const filaActiva = tendencias.find(t => t.grupo === seleccion) || null
  const meses = tendencias[0]?.meses || []
  const data = meses.map((ciclo, i) => ({
    mes: formatMes(ciclo),
    valor: filaActiva
      ? filaActiva.valores[i] || 0
      : tendencias.reduce((suma, fila) => suma + (fila.valores[i] || 0), 0),
  }))
  const nombre = filaActiva ? filaActiva.grupo : 'Todas las categorías'
  const color = filaActiva ? (COLOR_GRUPO[filaActiva.grupo] || '#64748b') : COLOR_TOTAL

  function elegir(grupo) {
    setSeleccion(actual => (actual === grupo ? null : grupo))
    graficoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Promedio y tendencia por categoría</h2>
          <p className="mt-1 text-xs text-slate-500">
            Últimos {cantidad} ciclos hasta {formatMes(mesHasta)}
            {esCicloAbierto ? ', sin el ciclo en curso' : ''}.
            {' '}El cambio compara el promedio de los 3 ciclos recientes con los 3 anteriores.
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
          {picos > 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-300">
              {picos} {picos === 1 ? 'pico' : 'picos'}
            </span>
          )}
        </div>
      </div>

      {tendencias.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-500">Sin datos suficientes para calcular tendencias.</div>
      ) : (
        <>
          <div ref={graficoRef} className="border-b border-slate-800 px-5 pt-4 pb-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium" style={{ color }}>{nombre}</p>
              {filaActiva ? (
                <button
                  type="button"
                  onClick={() => setSeleccion(null)}
                  className="text-xs text-sky-300 hover:text-sky-200"
                >
                  Ver total
                </button>
              ) : (
                <p className="text-xs text-slate-500">Elige una fila para ver solo esa categoría</p>
              )}
            </div>
            <GraficoTendenciaCategoria data={data} nombre={nombre} color={color} />
          </div>

          <div className="divide-y divide-slate-800/80">
            {tendencias.map(t => {
              const colorFila = COLOR_GRUPO[t.grupo] || '#64748b'
              const activa = seleccion === t.grupo
              const neutro = GRUPOS_SIN_ALARMA.has(t.grupo)
              return (
                <button
                  key={t.grupo}
                  type="button"
                  onClick={() => elegir(t.grupo)}
                  aria-pressed={activa}
                  className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-800/40 ${
                    activa ? 'bg-slate-800/70' : ''
                  }`}
                  style={activa ? { boxShadow: `inset 3px 0 0 ${colorFila}` } : undefined}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorFila }} />
                    <span className="truncate text-sm text-slate-300">{t.grupo}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="hidden sm:block">
                      <Sparkline valores={t.valores} color={colorFila} />
                    </div>
                    <div className="w-24 text-right">
                      <div className="font-mono-numbers text-sm font-semibold text-slate-200">
                        {privacyFormat(Math.round(t.promedio), isPrivacyModeEnabled)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-600">prom/ciclo</div>
                    </div>
                    <div className="flex w-[8.5rem] flex-col items-end gap-1">
                      <div className={`font-mono-numbers text-sm font-medium ${tonoDelta(t.direccion, neutro, t.pico)}`}>
                        {formatDelta(t.delta, isPrivacyModeEnabled)}
                      </div>
                      <BadgeDireccion
                        direccion={t.direccion}
                        pct={t.pct}
                        pico={t.pico}
                        picoMes={t.picoMes}
                        neutro={neutro}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
