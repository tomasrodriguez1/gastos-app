import { useState } from 'react'
import { INPUT, BOTON_PRIMARIO, BOTON_SECUNDARIO } from '../Clases/estilos'

// Campos de un ingreso (fuente del catálogo, monto, fecha, nota y, para "Uso de fondos", el fondo).
// Lo usan el alta manual y la edición de un pendiente o de un ingreso confirmado.
export function EditorIngreso({ inicial, fuentes, fondosSugeridos = [], textoBoton, onGuardar, onCancelar, children }) {
  const registrables = fuentes.filter(f => f.activa && !f.automatica)
  const [form, setForm] = useState({
    fuente: inicial.fuente || registrables[0]?.nombre || '',
    monto: inicial.monto != null ? String(inicial.monto) : '',
    fecha: inicial.fecha,
    nota: inicial.nota || '',
    fondo: inicial.fondo || '',
  })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))
  const esFondos = fuentes.find(f => f.nombre === form.fuente)?.tipo === 'fondos'

  async function enviar(e) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await onGuardar({
        fuente: form.fuente,
        monto: Number(form.monto),
        fecha: form.fecha,
        nota: form.nota.trim() || null,
        fondo: esFondos ? form.fondo.trim() || null : null,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <select value={form.fuente} onChange={set('fuente')} required aria-label="Fuente" className={`${INPUT} col-span-2`}>
          {/* Una fuente desactivada que ya tiene el ingreso se conserva visible para no perderla al editar. */}
          {!registrables.some(f => f.nombre === form.fuente) && form.fuente && <option value={form.fuente}>{form.fuente}</option>}
          {registrables.map(f => <option key={f.id} value={f.nombre}>{f.nombre}</option>)}
        </select>
        <input type="number" min="1" step="1" value={form.monto} onChange={set('monto')} required placeholder="Monto" aria-label="Monto" className={`${INPUT} font-mono-numbers`} />
        <input type="date" value={form.fecha} onChange={set('fecha')} required aria-label="Fecha" className={INPUT} />
      </div>
      {esFondos && (
        <>
          <input
            type="text" list="fondos-sugeridos" value={form.fondo} onChange={set('fondo')} maxLength={120}
            placeholder="¿De qué fondo sacaste? (opcional)" aria-label="Fondo" className={`${INPUT} w-full`}
          />
          <datalist id="fondos-sugeridos">{fondosSugeridos.map(n => <option key={n} value={n} />)}</datalist>
          <p className="text-xs text-amber-400/90">
            Suma a tu saldo pero no es un ingreso nuevo. Si el gasto ya está marcado como financiado por ese fondo, no lo registres acá además: se contaría doble. Esto no descuenta el saldo del fondo.
          </p>
        </>
      )}
      <input type="text" value={form.nota} onChange={set('nota')} placeholder="Nota (opcional)" maxLength={300} className={`${INPUT} w-full`} />
      {children}
      <div className="flex justify-end gap-2">
        {onCancelar && <button type="button" onClick={onCancelar} className={BOTON_SECUNDARIO}>Cancelar</button>}
        <button type="submit" disabled={guardando || !form.fuente} className={BOTON_PRIMARIO}>{textoBoton}</button>
      </div>
    </form>
  )
}
