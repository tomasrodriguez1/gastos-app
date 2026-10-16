import { useEffect, useState } from 'react'
import { formatCLP, formatFecha } from '../../utils/formatters'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, INPUT, formatHoras } from './estilos'

// Cobro de varias clases dictadas y pendientes de un alumno. El monto es la suma de las clases
// elegidas (no hay pagos parciales); la fecha del pago define el ciclo del ingreso.
export function RegistrarPago({ alumno, cargarClases, onRegistrar, onCerrar }) {
  const [clases, setClases] = useState(null)
  const [elegidas, setElegidas] = useState(new Set())
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    cargarClases(alumno.alumno_id)
      .then(filas => {
        if (!vigente) return
        setClases(filas)
        setElegidas(new Set(filas.map(c => c.id)))
      })
      .catch(e => vigente && setError(e.message))
    return () => { vigente = false }
  }, [alumno.alumno_id, cargarClases])

  const total = (clases || []).filter(c => elegidas.has(c.id)).reduce((s, c) => s + c.monto, 0)

  function alternar(id) {
    setElegidas(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  async function confirmar() {
    setError(null)
    setGuardando(true)
    try {
      await onRegistrar([...elegidas], fecha)
      onCerrar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Cobrar a {alumno.alumno}</h3>
        <button type="button" onClick={onCerrar} className="text-slate-500 hover:text-slate-300" aria-label="Cerrar">×</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {clases === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : clases.length === 0 ? (
        <p className="text-sm text-slate-500">No tiene clases dictadas sin cobrar.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {clases.map(c => (
            <label key={c.id} className="flex items-center gap-3 text-sm cursor-pointer">
              <input type="checkbox" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} className="w-4 h-4 accent-emerald-500" />
              <span className="flex-1 text-slate-300">
                {formatFecha(c.fecha)} · {c.hora_inicio} · {formatHoras(c.horas)}
              </span>
              <span className="font-mono-numbers text-slate-200">{formatCLP(c.monto)}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/50">
        <label className="text-xs text-slate-500">
          Fecha del pago <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={`${INPUT} ml-1`} />
        </label>
        <span className="ml-auto text-sm text-slate-400">
          Total <span className="font-mono-numbers font-bold text-emerald-400">{formatCLP(total)}</span>
        </span>
      </div>
      <p className="text-xs text-slate-500">Se registra como ingreso real "Clases particulares" en el ciclo de la fecha del pago.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>Cancelar</button>
        <button type="button" onClick={confirmar} disabled={guardando || elegidas.size === 0} className={BOTON_PRIMARIO}>
          Registrar pago
        </button>
      </div>
    </div>
  )
}
