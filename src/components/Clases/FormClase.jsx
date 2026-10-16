import { useState } from 'react'
import { formatCLP } from '../../utils/formatters'
import { INPUT, BOTON_PRIMARIO, BOTON_SECUNDARIO } from './estilos'

const DURACIONES = [0.5, 1, 1.5, 2, 2.5, 3]

// Alta (clase = null) o edición de una clase programada y sin cobrar.
export function FormClase({ clase, alumnos, onGuardar, onCerrar }) {
  const activos = alumnos.filter(a => a.activo || a.id === clase?.alumno_id)
  const hoy = new Date().toLocaleDateString('en-CA')
  const [form, setForm] = useState(() => clase ? {
    alumno_id: String(clase.alumno_id),
    fecha: clase.fecha,
    hora_inicio: clase.hora_inicio,
    horas: clase.horas,
    modalidad: clase.modalidad,
    precio_hora: String(clase.precio_hora),
    nota: clase.nota || '',
  } : {
    alumno_id: activos[0] ? String(activos[0].id) : '',
    fecha: hoy,
    hora_inicio: '19:00',
    horas: 1,
    modalidad: 'presencial',
    precio_hora: activos[0] ? String(activos[0].precio_hora_default) : '',
    nota: '',
  })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  function elegirAlumno(e) {
    const alumno = alumnos.find(a => String(a.id) === e.target.value)
    setForm(f => ({ ...f, alumno_id: e.target.value, precio_hora: alumno ? String(alumno.precio_hora_default) : f.precio_hora }))
  }

  const monto = Math.round(Number(form.precio_hora || 0) * Number(form.horas))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    const datos = {
      fecha: form.fecha,
      hora_inicio: form.hora_inicio,
      duracion_minutos: Math.round(Number(form.horas) * 60),
      modalidad: form.modalidad,
      precio_hora: Number(form.precio_hora),
      nota: form.nota.trim() || null,
    }
    try {
      await onGuardar(clase ? datos : { ...datos, alumno_id: Number(form.alumno_id) })
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pb-4 mb-4 border-b border-slate-700/40">
      <p className="text-sm font-medium text-slate-300">{clase ? `Mover clase de ${clase.alumno}` : 'Agendar clase'}</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <select value={form.alumno_id} onChange={elegirAlumno} disabled={Boolean(clase)} required className={`${INPUT} col-span-2 sm:col-span-1`}>
          {activos.length === 0 && <option value="">Primero creá un alumno</option>}
          {activos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <input type="date" value={form.fecha} onChange={set('fecha')} required className={INPUT} />
        <input type="time" value={form.hora_inicio} onChange={set('hora_inicio')} required className={INPUT} />
        <select value={form.horas} onChange={set('horas')} className={INPUT} aria-label="Duración">
          {[...new Set([...DURACIONES, Number(form.horas)])].sort((a, b) => a - b).map(h => <option key={h} value={h}>{String(h).replace('.', ',')} h</option>)}
        </select>
        <select value={form.modalidad} onChange={set('modalidad')} className={INPUT}>
          <option value="presencial">Presencial</option>
          <option value="online">Online</option>
        </select>
        <input
          type="number" min="0" step="500" value={form.precio_hora} onChange={set('precio_hora')} required
          placeholder="Precio/hora" aria-label="Precio por hora" className={`${INPUT} font-mono-numbers`}
        />
      </div>
      <input type="text" value={form.nota} onChange={set('nota')} placeholder="Nota (opcional)" className={`${INPUT} w-full`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Monto de la clase: <span className="font-mono-numbers text-slate-300">{formatCLP(monto)}</span></span>
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>Cancelar</button>
          <button type="submit" disabled={guardando || !form.alumno_id} className={BOTON_PRIMARIO}>{clase ? 'Guardar' : 'Agendar'}</button>
        </div>
      </div>
    </form>
  )
}
