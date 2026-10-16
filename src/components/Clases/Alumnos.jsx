import { useState } from 'react'
import { formatCLP } from '../../utils/formatters'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CARD, INPUT, TITULO_CARD } from './estilos'

// Alumnos: alta, precio por hora por defecto y activar/desactivar. No se borran.
export function Alumnos({ alumnos, familias = [], onCrear, onEditar }) {
  const [form, setForm] = useState(null)
  const [editando, setEditando] = useState(null)
  const [error, setError] = useState(null)

  async function crear(e) {
    e.preventDefault()
    setError(null)
    try {
      await onCrear({ nombre: form.nombre.trim(), precio_hora_default: Number(form.precio) })
      setForm(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function guardarPrecio(alumno) {
    setError(null)
    try {
      await onEditar(alumno.id, { precio_hora_default: Number(editando.precio) })
      setEditando(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function cambiarFamilia(alumno, valor) {
    setError(null)
    try {
      await onEditar(alumno.id, { familia_id: valor ? Number(valor) : null })
    } catch (err) {
      setError(err.message)
    }
  }

  async function alternarActivo(alumno) {
    setError(null)
    try {
      await onEditar(alumno.id, { activo: !alumno.activo })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={TITULO_CARD}>Alumnos</h3>
        <button
          type="button"
          onClick={() => setForm(form ? null : { nombre: '', precio: '25000' })}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
        >
          + Alumno
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {form && (
        <form onSubmit={crear} className="flex flex-wrap gap-2 pb-3 mb-3 border-b border-slate-700/40">
          <input
            type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Nombre" required autoFocus className={`${INPUT} flex-1 min-w-32`}
          />
          <input
            type="number" min="1" step="500" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
            required aria-label="Precio por hora" className={`${INPUT} w-28 font-mono-numbers`}
          />
          <button type="submit" className={BOTON_PRIMARIO}>Crear</button>
        </form>
      )}

      {alumnos.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-2">Sin alumnos todavía.</p>
      ) : (
        <div className="space-y-1.5">
          {alumnos.map(a => (
            <div key={a.id} className={`flex items-center justify-between gap-2 text-sm ${a.activo ? '' : 'opacity-50'}`}>
              <div className="min-w-0">
                <p className="text-slate-200 truncate">{a.nombre}</p>
                <select
                  value={a.familia_id ?? ''}
                  onChange={e => cambiarFamilia(a, e.target.value)}
                  aria-label={`Familia de ${a.nombre}`}
                  className="bg-transparent text-xs text-slate-500 hover:text-slate-300 outline-none cursor-pointer max-w-full"
                >
                  <option value="">Sin familia</option>
                  {familias.map(f => <option key={f.id} value={f.id}>Familia {f.nombre}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editando?.id === a.id ? (
                  <>
                    <input
                      type="number" min="1" step="500" value={editando.precio} autoFocus
                      onChange={e => setEditando(ed => ({ ...ed, precio: e.target.value }))}
                      className={`${INPUT} w-24 py-1 font-mono-numbers`} aria-label="Precio por hora"
                    />
                    <button type="button" onClick={() => guardarPrecio(a)} className={BOTON_PRIMARIO}>OK</button>
                    <button type="button" onClick={() => setEditando(null)} className={BOTON_SECUNDARIO}>×</button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditando({ id: a.id, precio: String(a.precio_hora_default) })}
                    title="Cambiar precio por hora (no cambia clases ya agendadas)"
                    className="font-mono-numbers text-slate-400 hover:text-emerald-400"
                  >
                    {formatCLP(a.precio_hora_default)}/h
                  </button>
                )}
                <button type="button" onClick={() => alternarActivo(a)} className="text-xs text-slate-500 hover:text-slate-300">
                  {a.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
