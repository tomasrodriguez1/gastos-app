import { useState } from 'react'

const EMOJIS = ['✈️', '🏖️', '🏔️', '🗺️', '🚗', '🏕️', '🌎', '🎒', '🏙️', '🚢']
const ESTADOS = [
  { valor: 'planificado', label: 'Planificado' },
  { valor: 'en_curso', label: 'En curso' },
  { valor: 'cerrado', label: 'Cerrado' },
]

const inputCls = 'w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500'

export function FormViaje({ viajeInicial = null, onGuardar, onCerrar, onEliminar, error }) {
  const esEditar = Boolean(viajeInicial)
  const [form, setForm] = useState(() => ({
    nombre: viajeInicial?.nombre || '',
    emoji: viajeInicial?.emoji || '✈️',
    fecha_desde: viajeInicial?.fecha_desde || '',
    fecha_hasta: viajeInicial?.fecha_hasta || '',
    presupuesto: viajeInicial?.presupuesto != null ? String(viajeInicial.presupuesto) : '',
    estado: viajeInicial?.estado || 'planificado',
    nota: viajeInicial?.nota || '',
  }))
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false)

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const fechasInvalidas = form.fecha_desde && form.fecha_hasta && form.fecha_hasta < form.fecha_desde
  const valido = form.nombre.trim() && form.fecha_desde && form.fecha_hasta && !fechasInvalidas

  function handleSubmit(e) {
    e.preventDefault()
    if (!valido) return
    onGuardar({
      nombre: form.nombre.trim(),
      emoji: form.emoji,
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta,
      presupuesto: form.presupuesto === '' ? null : Number(form.presupuesto),
      estado: form.estado,
      nota: form.nota.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-base font-semibold text-slate-200">{esEditar ? 'Editar viaje' : 'Nuevo viaje'}</h2>
          <button onClick={onCerrar} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Nombre</label>
            <div className="flex gap-2">
              <select
                value={form.emoji}
                onChange={e => set('emoji', e.target.value)}
                className="appearance-none bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-lg outline-none focus:border-sky-500 cursor-pointer"
              >
                {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
              </select>
              <input
                type="text"
                value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Ej: Perú 2026"
                autoFocus
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Desde</label>
              <input type="date" value={form.fecha_desde} onChange={e => set('fecha_desde', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Hasta</label>
              <input type="date" value={form.fecha_hasta} onChange={e => set('fecha_hasta', e.target.value)} className={inputCls} />
            </div>
          </div>
          {fechasInvalidas && <p className="text-xs text-rose-400">La fecha de vuelta es anterior a la de ida.</p>}

          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Presupuesto (opcional)</label>
            <input
              type="number"
              min="0"
              value={form.presupuesto}
              onChange={e => set('presupuesto', e.target.value)}
              placeholder="Sin presupuesto"
              className={`${inputCls} font-mono-numbers`}
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Estado</label>
            <div className="flex gap-1.5">
              {ESTADOS.map(e => (
                <button
                  key={e.valor}
                  type="button"
                  onClick={() => set('estado', e.valor)}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.estado === e.valor
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : 'bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-1.5">
              En curso: los gastos nuevos dentro de las fechas llegan a la bandeja ya marcados con este viaje.
            </p>
          </div>

          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Nota</label>
            <input type="text" value={form.nota} onChange={e => set('nota', e.target.value)} placeholder="Opcional" className={inputCls} />
          </div>

          <div className="flex gap-2 pt-2">
            {esEditar && onEliminar && (
              confirmandoBorrar ? (
                <button
                  type="button"
                  onClick={onEliminar}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
                  title="Los gastos quedan, solo pierden la etiqueta del viaje"
                >
                  Confirmar borrar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrar(true)}
                  className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400"
                >
                  Borrar
                </button>
              )
            )}
            <button
              type="button"
              onClick={onCerrar}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valido}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
