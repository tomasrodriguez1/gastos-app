import { useState } from 'react'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CARD, INPUT, TITULO_CARD } from './estilos'

const VACIA = { nombre: '', apoderado_nombre: '', apoderado_telefono: '' }

function FormFamilia({ inicial, onGuardar, onCerrar, textoBoton }) {
  const [form, setForm] = useState(inicial)
  const [error, setError] = useState(null)
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    try {
      await onGuardar({
        nombre: form.nombre.trim(),
        apoderado_nombre: form.apoderado_nombre.trim() || null,
        apoderado_telefono: form.apoderado_telefono.trim() || null,
      })
      onCerrar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-2 pb-3 mb-3 border-b border-slate-700/40">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <input type="text" value={form.nombre} onChange={set('nombre')} placeholder="Familia (ej: Mena)" required autoFocus className={`${INPUT} w-full`} />
      <div className="flex gap-2">
        <input type="text" value={form.apoderado_nombre} onChange={set('apoderado_nombre')} placeholder="Apoderado (ej: Isabel)" className={`${INPUT} flex-1 min-w-0`} />
        <input type="tel" value={form.apoderado_telefono} onChange={set('apoderado_telefono')} placeholder="WhatsApp" className={`${INPUT} w-36`} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>Cancelar</button>
        <button type="submit" className={BOTON_PRIMARIO}>{textoBoton}</button>
      </div>
    </form>
  )
}

// Familias = cuentas de cobro: agrupan hermanos y guardan al apoderado (a quién se le escribe).
// Los alumnos se asignan desde el bloque Alumnos.
export function Familias({ familias, onCrear, onEditar, onEliminar }) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [error, setError] = useState(null)

  async function eliminar(f) {
    if (!window.confirm(`¿Eliminar la familia ${f.nombre}?`)) return
    setError(null)
    try {
      await onEliminar(f.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={TITULO_CARD}>Familias</h3>
        <button
          type="button"
          onClick={() => { setCreando(!creando); setEditando(null) }}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
        >
          + Familia
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {creando && <FormFamilia inicial={VACIA} onGuardar={onCrear} onCerrar={() => setCreando(false)} textoBoton="Crear" />}

      {familias.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-2">
          Sin familias. Creá una para cobrar juntos a hermanos y guardar al apoderado.
        </p>
      ) : (
        <div className="space-y-2.5">
          {familias.map(f => editando === f.id ? (
            <FormFamilia
              key={f.id}
              inicial={{ nombre: f.nombre, apoderado_nombre: f.apoderado_nombre || '', apoderado_telefono: f.apoderado_telefono || '' }}
              onGuardar={(datos) => onEditar(f.id, datos)}
              onCerrar={() => setEditando(null)}
              textoBoton="Guardar"
            />
          ) : (
            <div key={f.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="text-slate-200 truncate">Familia {f.nombre}</p>
                <p className="text-xs text-slate-500 truncate">
                  {f.apoderado_nombre || 'Sin apoderado'}{f.apoderado_telefono && ` · ${f.apoderado_telefono}`}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {f.alumnos.length ? f.alumnos.map(a => a.nombre).join(', ') : 'Sin alumnos asignados'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => { setEditando(f.id); setCreando(false) }} className="text-xs text-slate-500 hover:text-emerald-400">Editar</button>
                {f.alumnos.length === 0 && (
                  <button type="button" onClick={() => eliminar(f)} className="text-xs text-slate-500 hover:text-red-400">Eliminar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
