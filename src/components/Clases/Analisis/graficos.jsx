/* eslint-disable react-refresh/only-export-components */
// Piezas compartidas de /clases/analisis. Colores: paleta categórica de referencia (dataviz),
// columna oscura, validada contra la superficie de la app (#151a1f): ΔE CVD ≥ 8,4, contraste ≥ 3:1.
// Los años toman el color por orden cronológico (el color sigue al año, no al ranking).

export const SERIE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
export const UNA_SERIE = SERIE[0]
export const EN_CURSO = SERIE[2]
export const NEUTRO = '#64748b'

export const EJE = { tick: { fill: '#64748b', fontSize: 11 }, axisLine: false, tickLine: false }
export const GRILLA = { stroke: '#334155', strokeOpacity: 0.35, vertical: false }
export const CURSOR = { fill: 'rgba(148, 163, 184, 0.10)' }

export const miles = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)

export function Card({ titulo, subtitulo, children, className = '' }) {
  return (
    <section className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 ${className}`}>
      {titulo && <h2 className="text-sm font-medium text-slate-300">{titulo}</h2>}
      {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
      <div className={titulo ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

export function Tile({ valor, etiqueta, detalle, tono = 'text-slate-100' }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <p className={`text-2xl font-bold font-mono-numbers ${tono}`}>{valor}</p>
      <p className="mt-1 text-xs text-slate-500 uppercase tracking-wider">{etiqueta}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  )
}

// Tooltip oscuro con el formato de la app. `filas(payload)` → [{ color?, etiqueta, valor }].
export function TooltipOscuro({ active, payload, label, filas, titulo }) {
  if (!active || !payload?.length) return null
  const lineas = filas ? filas(payload) : payload.map(p => ({ color: p.color || p.fill, etiqueta: p.name, valor: p.value }))
  return (
    <div className="rounded-lg border border-slate-600/60 bg-slate-900/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-200">{titulo ? titulo(label, payload) : label}</p>
      {lineas.map((l, i) => (
        <p key={i} className="flex items-center gap-2 text-slate-300">
          {l.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />}
          <span className="text-slate-400">{l.etiqueta}</span>
          <span className="ml-auto font-mono-numbers text-slate-100">{l.valor}</span>
        </p>
      ))}
    </div>
  )
}

export function Variacion({ valor }) {
  if (valor == null) return <span className="text-slate-600">—</span>
  const sube = valor >= 0
  return (
    <span className={sube ? 'text-emerald-400' : 'text-red-400'}>
      {sube ? '▲' : '▼'} {Math.abs(valor)}%
    </span>
  )
}
