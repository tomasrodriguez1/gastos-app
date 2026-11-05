import { useState } from 'react'
import { formatFecha, privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { resumirViaje, sugerirGastosParaViaje } from '../../utils/viajes'
import { montoReal } from '../../utils/calculos'
import { TablaGastos } from '../Gastos/TablaGastos'

function Kpi({ label, valor, detalle, tono = 'text-slate-100' }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`mt-1 text-xl font-semibold font-mono-numbers ${tono}`}>{valor}</div>
      {detalle && <div className="mt-0.5 text-xs text-slate-500">{detalle}</div>}
    </div>
  )
}

function DesgloseGrupos({ porGrupo, total, privado }) {
  const grupos = Object.entries(porGrupo).sort((a, b) => b[1].total - a[1].total)
  if (grupos.length === 0) return null
  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-300">De qué presupuesto salió</h3>
      <div className="mt-3 space-y-6">
        {grupos.map(([grupo, { total: totalGrupo, subcategorias }]) => (
          <div key={grupo}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-slate-200">{grupo}</span>
              <span className="text-sm font-mono-numbers text-slate-200">
                {privacyFormat(totalGrupo, privado)}
                <span className="ml-2 text-xs text-slate-500">{total ? Math.round((totalGrupo / total) * 100) : 0}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
              <div className="h-full rounded-full bg-teal-400/70" style={{ width: `${total ? (totalGrupo / total) * 100 : 0}%` }} />
            </div>
            <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {Object.entries(subcategorias).sort((a, b) => b[1] - a[1]).map(([sub, monto]) => (
                <div key={sub} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
                  <span className="truncate text-xs text-slate-400" title={sub}>{sub}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/50">
                    <div className="h-full rounded-full bg-indigo-400/80" style={{ width: `${totalGrupo ? (monto / totalGrupo) * 100 : 0}%` }} />
                  </div>
                  <span className="text-right text-xs font-mono-numbers text-slate-300">
                    {privacyFormat(monto, privado)}
                    <span className="ml-1.5 text-slate-500">{totalGrupo ? Math.round((monto / totalGrupo) * 100) : 0}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Sugerencias({ sugeridos, descartados, onAsignar, onDescartar, privado }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  if (sugeridos.length === 0 && descartados.length === 0) return null

  async function ejecutar(accion) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="bg-teal-500/[0.04] border border-teal-500/25 rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Posibles gastos del viaje</h3>
          <p className="text-xs text-slate-500">Sin viaje, dentro de las fechas, o pasajes de los 6 meses anteriores.</p>
        </div>
        <button
          type="button"
          disabled={ocupado || sugeridos.length === 0}
          onClick={() => ejecutar(() => onAsignar(sugeridos.map(g => g.id)))}
          className="text-xs px-3 py-1.5 rounded-lg border font-medium text-teal-300 border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 disabled:opacity-40"
        >
          Asignar todos ({sugeridos.length})
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="text-xs text-slate-500">Descartar solo oculta la sugerencia; el gasto se conserva.</p>
        {sugeridos.length > 0 && (
          <button type="button" disabled={ocupado}
            onClick={() => ejecutar(() => onDescartar(sugeridos.map(g => g.id), true))}
            className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40">
            Descartar todos ({sugeridos.length})
          </button>
        )}
        {descartados.length > 0 && (
          <button type="button" disabled={ocupado}
            onClick={() => ejecutar(() => onDescartar(descartados, false))}
            className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40">
            Volver a mostrar descartados ({descartados.length})
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      <ul className="mt-3 divide-y divide-slate-700/30">
        {sugeridos.map(g => (
          <li key={g.id} className="flex items-center gap-3 py-2">
            <span className="w-12 shrink-0 text-xs font-mono-numbers text-slate-500">{formatFecha(g.fecha)}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-300" title={g.motivo}>{g.motivo}</span>
            <span className="shrink-0 text-sm font-mono-numbers text-slate-300">
              {g.usd > 0 && !g.monto ? `USD ${g.usd}` : privacyFormat(montoReal(g), privado)}
            </span>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => ejecutar(() => onAsignar([g.id]))}
              className="shrink-0 text-xs px-2 py-0.5 rounded-full border text-teal-300 border-teal-500/30 hover:bg-teal-500/10 disabled:opacity-40"
            >
              Asignar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => ejecutar(() => onDescartar([g.id], true))}
              aria-label={`Descartar sugerencia de ${g.motivo}`}
              className="shrink-0 text-xs px-2 py-0.5 rounded-full border text-slate-400 border-slate-600/50 hover:bg-slate-700/50 disabled:opacity-40"
            >
              Descartar
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DetalleViaje({ viaje, gastos, catalogos, onActualizarGasto, onAsignar, onDescartarSugerencias }) {
  const { isPrivacyModeEnabled: privado } = usePrivacyMode()
  const r = resumirViaje(viaje, gastos)
  const sugeridos = sugerirGastosParaViaje(viaje, gastos)
  const restante = viaje.presupuesto != null ? viaje.presupuesto - r.total : null
  const gastosOrdenados = [...r.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Total"
          valor={privacyFormat(r.total, privado)}
          detalle={r.usd > 0 ? `+ USD ${r.usd.toFixed(2)} sin convertir` : `${r.gastos.length} gastos`}
        />
        <Kpi
          label={restante == null ? 'Presupuesto' : restante >= 0 ? 'Queda' : 'Te pasaste'}
          valor={restante == null ? '—' : privacyFormat(Math.abs(restante), privado)}
          detalle={viaje.presupuesto != null ? `de ${privacyFormat(viaje.presupuesto, privado)}` : 'Sin presupuesto definido'}
          tono={restante == null ? 'text-slate-500' : restante >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
        <Kpi label="Antes de viajar" valor={privacyFormat(r.antes, privado)} detalle="Pasajes, reservas, seguros" />
        <Kpi
          label="Durante"
          valor={privacyFormat(r.durante, privado)}
          detalle={`${privacyFormat(r.promedioDiario, privado)} por día · ${r.dias} día${r.dias === 1 ? '' : 's'}`}
        />
      </div>

      <DesgloseGrupos porGrupo={r.porGrupo} total={r.total} privado={privado} />

      <Sugerencias
        key={viaje.id}
        sugeridos={sugeridos}
        descartados={viaje.sugerencias_descartadas || []}
        onAsignar={ids => onAsignar(viaje.id, ids)}
        onDescartar={(ids, activo) => onDescartarSugerencias(viaje.id, ids, activo)}
        privado={privado}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-300">Gastos del viaje</h3>
        <TablaGastos
          gastos={gastosOrdenados}
          onActualizar={onActualizarGasto}
          catalogos={catalogos}
          seleccionable
        />
      </section>
    </div>
  )
}
