import { useEffect, useMemo, useState } from 'react'
import { formatCLP, formatFecha } from '../../utils/formatters'
import { armarMensajeCobro, linkWhatsApp } from '../../utils/mensajeCobro'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, INPUT, formatHoras } from './estilos'

// Cobro de una cuenta (familia o alumno sin familia): clases dictadas y pendientes, todas
// marcadas. Arma el mensaje para WhatsApp con las clases elegidas y, cuando llega la plata,
// registra el pago (monto = suma; la fecha del pago define el ciclo del ingreso).
export function RegistrarPago({ cuenta, cargarClases, onRegistrar, onCerrar }) {
  const [clases, setClases] = useState(null)
  const [elegidas, setElegidas] = useState(new Set())
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensajeEditado, setMensajeEditado] = useState(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let vigente = true
    cargarClases(cuenta)
      .then(filas => {
        if (!vigente) return
        setClases(filas)
        setElegidas(new Set(filas.map(c => c.id)))
      })
      .catch(e => vigente && setError(e.message))
    return () => { vigente = false }
  }, [cuenta, cargarClases])

  const seleccion = useMemo(() => (clases || []).filter(c => elegidas.has(c.id)), [clases, elegidas])
  const total = seleccion.reduce((s, c) => s + c.monto, 0)
  const mensajeGenerado = useMemo(
    () => (seleccion.length ? armarMensajeCobro({ apoderado: cuenta.apoderado_nombre, clases: seleccion }) : ''),
    [seleccion, cuenta.apoderado_nombre],
  )
  const mensaje = mensajeEditado ?? mensajeGenerado
  const whatsapp = mensaje ? linkWhatsApp(cuenta.apoderado_telefono, mensaje) : null

  const porAlumno = useMemo(() => {
    const grupos = new Map()
    for (const c of clases || []) grupos.set(c.alumno, [...(grupos.get(c.alumno) || []), c])
    return [...grupos].sort(([a], [b]) => a.localeCompare(b))
  }, [clases])

  function alternar(id) {
    // Cambiar la selección rearma el mensaje (se pierde la edición manual).
    setMensajeEditado(null)
    setElegidas(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se pudo copiar: seleccioná el texto y copialo a mano')
    }
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
    <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Cobrar a {cuenta.nombre}</h3>
          <p className="text-xs text-slate-500">
            {cuenta.apoderado_nombre ? `Apoderado: ${cuenta.apoderado_nombre}` : 'Sin apoderado registrado'}
            {cuenta.apoderado_telefono && ` · ${cuenta.apoderado_telefono}`}
          </p>
        </div>
        <button type="button" onClick={onCerrar} className="text-slate-500 hover:text-slate-300" aria-label="Cerrar">×</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {clases === null ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : clases.length === 0 ? (
            <p className="text-sm text-slate-500">No hay clases dictadas sin cobrar.</p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {porAlumno.map(([alumno, lista]) => (
                <div key={alumno} className="space-y-1.5">
                  {porAlumno.length > 1 && <p className="text-xs uppercase tracking-wider text-slate-500">{alumno}</p>}
                  {lista.map(c => (
                    <label key={c.id} className="flex items-center gap-3 text-sm cursor-pointer">
                      <input type="checkbox" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} className="w-4 h-4 accent-emerald-500" />
                      <span className="flex-1 text-slate-300">
                        {formatFecha(c.fecha)} · {c.hora_inicio} · {formatHoras(c.horas)}
                      </span>
                      <span className="font-mono-numbers text-slate-200">{formatCLP(c.monto)}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 text-sm text-slate-400">
            <span>{seleccion.length} clase{seleccion.length === 1 ? '' : 's'}</span>
            <span>Total <span className="font-mono-numbers font-bold text-emerald-400">{formatCLP(total)}</span></span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-slate-500">Mensaje para WhatsApp</p>
          <textarea
            value={mensaje}
            onChange={e => setMensajeEditado(e.target.value)}
            rows={12}
            className={`${INPUT} w-full font-mono text-xs leading-relaxed`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copiar} disabled={!mensaje} className={BOTON_SECUNDARIO}>
              {copiado ? '¡Copiado!' : 'Copiar mensaje'}
            </button>
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noreferrer" className={BOTON_PRIMARIO}>Abrir WhatsApp</a>
            ) : (
              <span className="text-xs text-slate-500 self-center">Agregá el teléfono del apoderado en Familias para abrir WhatsApp directo.</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-700/50">
        <span className="text-xs text-slate-500">¿Ya te pagaron?</span>
        <label className="text-xs text-slate-500">
          Fecha del pago <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={`${INPUT} ml-1`} />
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>Cerrar</button>
          <button type="button" onClick={confirmar} disabled={guardando || elegidas.size === 0} className={BOTON_PRIMARIO}>
            Registrar pago de {formatCLP(total)}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">El pago se registra como ingreso real "Clases particulares" en el ciclo de su fecha.</p>
    </div>
  )
}
