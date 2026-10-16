import { useState } from 'react'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CARD, INPUT, TITULO_CARD } from '../Clases/estilos'

const TIPOS = [
  { id: 'fijo', etiqueta: 'Fijo', ayuda: 'Llega todos los meses; avisa si se atrasa' },
  { id: 'variable', etiqueta: 'Variable', ayuda: 'Monto y fecha que cambian' },
  { id: 'fondos', etiqueta: 'Uso de fondos', ayuda: 'Plata de tus fondos; no es ingreso nuevo' },
]

function FormFuente({ inicial, onGuardar, onCerrar, textoBoton }) {
  const [form, setForm] = useState(inicial)
  const [error, setError] = useState(null)
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    try {
      await onGuardar({
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        dia_esperado: form.tipo === 'fijo' && form.dia_esperado !== '' ? Number(form.dia_esperado) : null,
      })
      onCerrar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-2 pb-3 mb-3 border-b border-slate-700/40">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <input type="text" value={form.nombre} onChange={set('nombre')} placeholder="Nombre (ej: Arriendo)" required autoFocus maxLength={80} className={`${INPUT} w-full`} />
      <div className="flex gap-2">
        <select value={form.tipo} onChange={set('tipo')} aria-label="Tipo" className={`${INPUT} flex-1`}>
          {TIPOS.map(t => <option key={t.id} value={t.id}>{t.etiqueta} — {t.ayuda}</option>)}
        </select>
        {form.tipo === 'fijo' && (
          <input type="number" min="1" max="31" value={form.dia_esperado} onChange={set('dia_esperado')} placeholder="Día" aria-label="Día esperado" className={`${INPUT} w-20 font-mono-numbers`} />
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>Cancelar</button>
        <button type="submit" className={BOTON_PRIMARIO}>{textoBoton}</button>
      </div>
    </form>
  )
}

// Catálogo de fuentes de ingreso. Las automáticas (Clases particulares) no se editan ni se
// desactivan; una fuente no se borra, se desactiva. Renombrar actualiza ingresos y previsto.
export function Fuentes({ fuentes, onCrear, onEditar }) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [error, setError] = useState(null)

  async function alternar(f) {
    setError(null)
    try {
      await onEditar(f.id, { activa: !f.activa })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={TITULO_CARD}>Fuentes de ingreso</h2>
        <button
          type="button"
          onClick={() => { setCreando(!creando); setEditando(null) }}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
        >
          + Fuente
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {creando && (
        <FormFuente inicial={{ nombre: '', tipo: 'variable', dia_esperado: '' }} onGuardar={onCrear} onCerrar={() => setCreando(false)} textoBoton="Crear" />
      )}
      <div className="space-y-2">
        {fuentes.map(f => editando === f.id ? (
          <FormFuente
            key={f.id}
            inicial={{ nombre: f.nombre, tipo: f.tipo, dia_esperado: f.dia_esperado ?? '' }}
            onGuardar={(datos) => onEditar(f.id, datos)}
            onCerrar={() => setEditando(null)}
            textoBoton="Guardar"
          />
        ) : (
          <div key={f.id} className={`flex items-center justify-between gap-2 text-sm ${f.activa ? '' : 'opacity-50'}`}>
            <div className="min-w-0">
              <p className="text-slate-200 truncate">{f.nombre}</p>
              <p className="text-xs text-slate-500">
                {f.automatica ? 'Automática · se registra con los pagos de clases' : TIPOS.find(t => t.id === f.tipo)?.etiqueta}
                {f.dia_esperado && ` · día ${f.dia_esperado}`}
              </p>
            </div>
            {!f.automatica && (
              <div className="flex gap-3 shrink-0">
                <button type="button" onClick={() => { setEditando(f.id); setCreando(false) }} className="text-xs text-slate-500 hover:text-emerald-400">Editar</button>
                <button type="button" onClick={() => alternar(f)} className="text-xs text-slate-500 hover:text-slate-300">{f.activa ? 'Desactivar' : 'Activar'}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
