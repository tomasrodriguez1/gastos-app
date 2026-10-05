import { useState } from 'react'
import { formatCLP, formatFecha } from '../../utils/formatters'

const EMOJIS = ['💰', '🚗', '✈️', '🏠', '🎓', '💍', '🔧', '📋', '🏖️', '💻', '🎯', '🏥']

function FormReserva({ modo = 'crear', reservaInicial = null, onGuardar, onCerrar, gruposPresupuesto, error }) {
  const esEditar = modo === 'editar'
  const [form, setForm] = useState(() => ({
    nombre: reservaInicial?.nombre || '',
    emoji: reservaInicial?.emoji || '💰',
    grupo: reservaInicial?.vinculado?.grupo || '',
    subcategoria: reservaInicial?.vinculado?.subcategoria || '',
    tasa_anual: reservaInicial?.tasa_anual != null ? String(reservaInicial.tasa_anual) : '0.03',
  }))

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const grupos = Object.keys(gruposPresupuesto || {})
  const subcategorias = form.grupo ? (gruposPresupuesto[form.grupo] || []) : []

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    if (!esEditar && !form.grupo) return
    const payload = {
      nombre: form.nombre.trim(),
      emoji: form.emoji,
      tasa_anual: Number(form.tasa_anual) || 0,
    }
    if (!esEditar) {
      payload.vinculado = { grupo: form.grupo, subcategoria: form.subcategoria || undefined }
    }
    onGuardar(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-base font-semibold text-slate-200">
            {esEditar ? 'Editar reserva' : 'Nueva reserva'}
          </h2>
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
                placeholder="Ej: Vacaciones"
                autoFocus
                className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Rendimiento anual</label>
            <input
              type="number"
              step="0.01"
              value={form.tasa_anual}
              onChange={e => set('tasa_anual', e.target.value)}
              placeholder="0.03"
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono-numbers text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
            />
            <p className="text-xs text-slate-600 mt-1">0.03 = 3% anual, típico de Mercado Pago. 0 si no rinde.</p>
          </div>

          {esEditar ? (
            reservaInicial?.vinculado && (
              <div className="text-xs text-slate-500">
                Vinculado a <span className="text-slate-300">{reservaInicial.vinculado.grupo}{reservaInicial.vinculado.subcategoria ? ` / ${reservaInicial.vinculado.subcategoria}` : ''}</span> — no se puede cambiar después de crear.
              </div>
            )
          ) : (
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
                Vinculado al presupuesto
              </label>
              <div className="flex gap-2">
                <select
                  value={form.grupo}
                  onChange={e => { set('grupo', e.target.value); set('subcategoria', '') }}
                  required
                  className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  <option value="">Elegí un grupo…</option>
                  {grupos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {form.grupo && (
                  <select
                    value={form.subcategoria}
                    onChange={e => set('subcategoria', e.target.value)}
                    className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                  >
                    <option value="">Todo el grupo</option>
                    {subcategorias.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">Los retiros esperados se calculan desde los gastos de esta categoría.</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCerrar}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
              {esEditar ? 'Guardar cambios' : 'Crear reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TarjetaReserva({ reserva, onEditar, onArchivar, onReabrir, onRegistrarSaldo, onCargarSaldos }) {
  const [formSaldo, setFormSaldo] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [resultadoSaldo, setResultadoSaldo] = useState(null)
  const [errorSaldo, setErrorSaldo] = useState(null)
  const cerrada = !reserva.activa
  const hoy = new Date().toISOString().slice(0, 10)

  async function toggleHistorial() {
    if (historial) { setHistorial(null); return }
    setCargandoHistorial(true)
    try {
      const saldos = await onCargarSaldos(reserva.id)
      setHistorial(saldos)
    } finally {
      setCargandoHistorial(false)
    }
  }

  async function handleRegistrarSaldo(e) {
    e.preventDefault()
    const monto = Number(formSaldo.monto)
    if (!Number.isFinite(monto) || monto < 0) return
    setErrorSaldo(null)
    try {
      const resultado = await onRegistrarSaldo(reserva.id, { monto, fecha: formSaldo.fecha })
      setResultadoSaldo(resultado)
      setFormSaldo(null)
      if (historial) setHistorial(await onCargarSaldos(reserva.id))
    } catch (err) {
      setErrorSaldo(err.message)
    }
  }

  return (
    <div className="bg-slate-700/30 border border-slate-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none shrink-0">{reserva.emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{reserva.nombre}</div>
            <div className="text-xs text-slate-600 truncate">
              {reserva.vinculado?.grupo}{reserva.vinculado?.subcategoria ? ` / ${reserva.vinculado.subcategoria}` : ''}
              {reserva.tasa_anual > 0 && <span> · {(reserva.tasa_anual * 100).toFixed(1)}%/año</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEditar} className="text-xs px-2 py-1 rounded-lg border bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-slate-500 hover:text-slate-300 transition-colors" title="Editar">
            ✎
          </button>
          {!cerrada && (
            <button
              onClick={() => { setErrorSaldo(null); setResultadoSaldo(null); setFormSaldo(f => f ? null : { monto: '', fecha: hoy }) }}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors font-medium ${
                formSaldo ? 'bg-slate-600/50 text-slate-400 border-slate-600' : 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
              }`}
            >
              Registrar saldo
            </button>
          )}
          {cerrada ? (
            <button onClick={() => onReabrir(reserva.id)} className="text-xs px-2 py-1 rounded-lg border bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-sky-500/40 hover:text-sky-300 transition-colors">
              Reabrir
            </button>
          ) : (
            <button onClick={() => onArchivar(reserva.id)} className="text-xs px-2 py-1 rounded-lg border border-slate-700/50 text-slate-600 hover:text-amber-400 hover:border-amber-500/30 transition-colors">
              Archivar
            </button>
          )}
        </div>
      </div>

      {formSaldo && (
        <form onSubmit={handleRegistrarSaldo} className="space-y-2 pt-1 border-t border-slate-700/40">
          {errorSaldo && <p className="text-xs text-red-400">{errorSaldo}</p>}
          <div className="flex gap-2">
            <input
              type="number"
              value={formSaldo.monto}
              onChange={e => setFormSaldo(f => ({ ...f, monto: e.target.value }))}
              placeholder="Monto leído"
              autoFocus
              required
              className="flex-1 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-mono-numbers text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500"
            />
            <input
              type="date"
              value={formSaldo.fecha}
              onChange={e => setFormSaldo(f => ({ ...f, fecha: e.target.value }))}
              className="bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-sky-500"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setFormSaldo(null)} className="flex-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
              Registrar
            </button>
          </div>
        </form>
      )}

      {resultadoSaldo && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          resultadoSaldo.no_calza ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          {resultadoSaldo.monto_esperado == null ? (
            'Primera lectura, sin línea base para comparar.'
          ) : (
            <>Leído {formatCLP(resultadoSaldo.monto_leido)} vs esperado {formatCLP(resultadoSaldo.monto_esperado)}
              {resultadoSaldo.no_calza ? ` — no calza (dif. ${formatCLP(resultadoSaldo.diferencia)})` : ' — cuadra'}</>
          )}
        </div>
      )}

      <button type="button" onClick={toggleHistorial} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
        {cargandoHistorial ? 'Cargando…' : historial ? 'Ocultar historial' : 'Ver historial de saldos'}
      </button>

      {historial && (
        historial.length === 0 ? (
          <p className="text-xs text-slate-600">Sin saldos registrados todavía.</p>
        ) : (
          <div className="space-y-1.5 pt-1 border-t border-slate-700/40">
            {historial.slice(0, 8).map(s => (
              <div key={s.fecha} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">{formatFecha(s.fecha)}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono-numbers text-slate-300">{formatCLP(s.monto_leido)}</span>
                  {s.no_calza && <span className="text-amber-400" title="No calza con lo esperado">⚠</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {cerrada && <div className="text-xs text-slate-500 font-medium">Archivada</div>}
    </div>
  )
}

export function ReservasList({ reservas, cargando, error, gruposPresupuesto, onCrear, onEditar, onCargarSaldos, onRegistrarSaldo }) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [mostrarArchivadas, setMostrarArchivadas] = useState(false)
  const [errorForm, setErrorForm] = useState(null)

  const activas = reservas.filter(r => r.activa)
  const archivadas = reservas.filter(r => !r.activa)

  async function handleCrear(payload) {
    setErrorForm(null)
    try {
      await onCrear(payload)
      setCreando(false)
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  async function handleEditar(payload) {
    setErrorForm(null)
    try {
      await onEditar(editando.id, payload)
      setEditando(null)
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Reservas de ahorro</h3>
          <p className="text-xs text-slate-600 mt-0.5">Bolsillos externos (ej. Mercado Pago) — distinto de los fondos del Dashboard.</p>
        </div>
        <button
          onClick={() => { setErrorForm(null); setCreando(true) }}
          className="text-xs px-3 py-1.5 rounded-lg border bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20 transition-colors font-medium shrink-0"
        >
          + Nueva reserva
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {cargando ? (
        <p className="text-sm text-slate-600 text-center py-4">Cargando…</p>
      ) : activas.length === 0 ? (
        <p className="text-sm text-slate-600 text-center py-4">
          {archivadas.length > 0 ? 'No hay reservas activas.' : 'No hay reservas todavía. Creá una con el botón de arriba.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {activas.map(r => (
            <TarjetaReserva
              key={r.id}
              reserva={r}
              onEditar={() => { setErrorForm(null); setEditando(r) }}
              onArchivar={id => onEditar(id, { activa: false })}
              onReabrir={id => onEditar(id, { activa: true })}
              onCargarSaldos={onCargarSaldos}
              onRegistrarSaldo={onRegistrarSaldo}
            />
          ))}
        </div>
      )}

      {archivadas.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-700/40">
          <button type="button" onClick={() => setMostrarArchivadas(v => !v)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {mostrarArchivadas ? 'Ocultar archivadas' : `Mostrar ${archivadas.length} reserva${archivadas.length === 1 ? '' : 's'} archivada${archivadas.length === 1 ? '' : 's'}`}
          </button>
          {mostrarArchivadas && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 opacity-80">
              {archivadas.map(r => (
                <TarjetaReserva
                  key={r.id}
                  reserva={r}
                  onEditar={() => { setErrorForm(null); setEditando(r) }}
                  onArchivar={id => onEditar(id, { activa: false })}
                  onReabrir={id => onEditar(id, { activa: true })}
                  onCargarSaldos={onCargarSaldos}
                  onRegistrarSaldo={onRegistrarSaldo}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {creando && (
        <FormReserva
          modo="crear"
          onGuardar={handleCrear}
          onCerrar={() => setCreando(false)}
          gruposPresupuesto={gruposPresupuesto}
          error={errorForm}
        />
      )}

      {editando && (
        <FormReserva
          modo="editar"
          reservaInicial={editando}
          onGuardar={handleEditar}
          onCerrar={() => setEditando(null)}
          gruposPresupuesto={gruposPresupuesto}
          error={errorForm}
        />
      )}
    </div>
  )
}
