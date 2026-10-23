import { useState } from 'react'
import { useViajesContext } from '../contexts/ViajesContext'
import { FormViaje } from '../components/Viajes/FormViaje'
import { DetalleViaje } from '../components/Viajes/DetalleViaje'
import { ResumenViajes } from '../components/Viajes/ResumenViajes'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'
import { formatFecha, privacyFormat } from '../utils/formatters'
import { diasDeViaje, resumirViaje } from '../utils/viajes'

const ETIQUETA_ESTADO = {
  planificado: { label: 'Planificado', cls: 'bg-slate-700/60 text-slate-400' },
  en_curso: { label: 'En curso', cls: 'bg-teal-500/20 text-teal-300' },
  cerrado: { label: 'Cerrado', cls: 'bg-slate-800 text-slate-500' },
}

const PESTANAS = [
  { valor: 'resumen', label: 'Resumen' },
  { valor: 'viaje', label: 'Por viaje' },
]

function TarjetaViaje({ viaje, total, seleccionado, onClick, privado }) {
  const estado = ETIQUETA_ESTADO[viaje.estado] || ETIQUETA_ESTADO.planificado
  const pct = viaje.presupuesto ? Math.min(100, (total / viaje.presupuesto) * 100) : null
  const pasado = viaje.presupuesto != null && total > viaje.presupuesto
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full rounded-xl border p-4 transition-colors ${
        seleccionado
          ? 'border-teal-500/50 bg-teal-500/[0.06]'
          : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-slate-100">
            {viaje.emoji && <span className="mr-1.5">{viaje.emoji}</span>}{viaje.nombre}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 font-mono-numbers">
            {formatFecha(viaje.fecha_desde)}/{viaje.fecha_desde.slice(2, 4)} → {formatFecha(viaje.fecha_hasta)}/{viaje.fecha_hasta.slice(2, 4)}
            <span className="ml-1.5">· {diasDeViaje(viaje)} días</span>
          </div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${estado.cls}`}>
          {estado.label}
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className={`text-lg font-semibold font-mono-numbers ${pasado ? 'text-rose-400' : 'text-slate-100'}`}>{privacyFormat(total, privado)}</span>
        {viaje.presupuesto != null && (
          <span className="text-xs text-slate-500 font-mono-numbers">de {privacyFormat(viaje.presupuesto, privado)}</span>
        )}
      </div>
      {pct != null && (
        <div className="mt-2 h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
          <div className={`h-full rounded-full ${pasado ? 'bg-rose-400' : 'bg-teal-400/70'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </button>
  )
}

export function ViajesPage({ gastos, catalogos, onActualizarGasto }) {
  const { viajes, cargando, error, crear, editar, eliminar, asignar } = useViajesContext()
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [form, setForm] = useState(null) // null | { viaje: null | viaje }
  const [errorForm, setErrorForm] = useState(null)
  const [pestana, setPestana] = useState('resumen')
  const { isPrivacyModeEnabled: privado } = usePrivacyMode()

  // El primero en curso, si no el más reciente — la lista viene ordenada por fecha_desde DESC.
  const porDefecto = viajes.find(v => v.estado === 'en_curso') || viajes[0]
  const seleccionado = viajes.find(v => v.id === seleccionadoId) || porDefecto

  async function guardar(payload) {
    setErrorForm(null)
    try {
      if (form?.viaje) await editar(form.viaje.id, payload)
      else {
        const nuevo = await crear(payload)
        setSeleccionadoId(nuevo.id)
        setPestana('viaje')
      }
      setForm(null)
    } catch (e) {
      setErrorForm(e.message)
    }
  }

  async function borrar() {
    setErrorForm(null)
    try {
      await eliminar(form.viaje.id)
      setSeleccionadoId(null)
      setForm(null)
    } catch (e) {
      setErrorForm(e.message)
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl text-white">Viajes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cuánto costó cada viaje. Es una etiqueta sobre los gastos: con la Ale salen de ALE, si no de
            VIAJES — el presupuesto del ciclo los cuenta igual que siempre.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setErrorForm(null); setForm({ viaje: null }) }}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30"
        >
          + Nuevo viaje
        </button>
      </div>

      {error && <div className="text-sm text-rose-400">{error}</div>}

      {cargando ? (
        <div className="h-28 animate-pulse rounded-xl bg-slate-800/50 border border-slate-700/50" />
      ) : viajes.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-10 text-center text-sm text-slate-500">
          Todavía no hay viajes. Creá uno y asignale gastos desde acá, desde /gastos (selección múltiple) o
          editando un gasto.
        </div>
      ) : (
        <>
          <div role="tablist" className="inline-flex rounded-lg border border-slate-700/60 bg-slate-800/50 p-0.5">
            {PESTANAS.map(p => (
              <button
                key={p.valor}
                type="button"
                role="tab"
                aria-selected={pestana === p.valor}
                onClick={() => setPestana(p.valor)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pestana === p.valor ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {pestana === 'resumen' ? (
            <ResumenViajes
              viajes={viajes}
              gastos={gastos}
              catalogos={catalogos}
              onActualizarGasto={onActualizarGasto}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {viajes.map(v => (
                  <TarjetaViaje
                    key={v.id}
                    viaje={v}
                    total={resumirViaje(v, gastos).total}
                    seleccionado={seleccionado?.id === v.id}
                    onClick={() => setSeleccionadoId(v.id)}
                    privado={privado}
                  />
                ))}
              </div>

              {seleccionado && (
                <section className="space-y-4 border-t border-slate-700/50 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold text-slate-100">
                      {seleccionado.emoji && <span className="mr-2">{seleccionado.emoji}</span>}{seleccionado.nombre}
                    </h2>
                    <button
                      type="button"
                      onClick={() => { setErrorForm(null); setForm({ viaje: seleccionado }) }}
                      className="text-xs px-3 py-1.5 rounded-lg border text-slate-400 border-slate-600/50 hover:bg-slate-700/50"
                    >
                      Editar viaje
                    </button>
                  </div>
                  {seleccionado.nota && <p className="text-sm text-slate-500">{seleccionado.nota}</p>}
                  <DetalleViaje
                    viaje={seleccionado}
                    gastos={gastos}
                    catalogos={catalogos}
                    onActualizarGasto={onActualizarGasto}
                    onAsignar={asignar}
                  />
                </section>
              )}
            </>
          )}
        </>
      )}

      {form && (
        <FormViaje
          key={form.viaje?.id || 'nuevo'}
          viajeInicial={form.viaje}
          onGuardar={guardar}
          onCerrar={() => setForm(null)}
          onEliminar={form.viaje ? borrar : undefined}
          error={errorForm}
        />
      )}
    </main>
  )
}
