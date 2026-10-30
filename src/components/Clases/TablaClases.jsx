import { useEffect, useRef, useState } from 'react'
import { formatFecha, privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatHoras } from './estilos'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function diaSemana(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  return DIAS[new Date(y, m - 1, d).getDay()]
}

function ChipCobro({ clase }) {
  if (clase.estado === 'cancelada') return <span className="text-xs text-slate-500">Cancelada</span>
  if (clase.pago_estado === 'pendiente') return <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20" title="Un pago registrado por el agente o el MCP espera tu aprobación en Ingresos">Pago por confirmar</span>
  if (clase.cobro === 'pagado') return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Pagado</span>
  if (clase.cobro === 'cobrado') return <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">Cobrado</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">No cobrado</span>
}

function opcionesDe(clase) {
  const cancelada = clase.estado === 'cancelada'
  const sinPagar = (clase.cobro === 'pendiente' || clase.cobro === 'cobrado') && !clase.pago_id
  const opciones = []
  if (clase.estado === 'programada' && clase.cobro === 'pendiente') {
    opciones.push({ id: 'mover', label: 'Mover', titulo: 'Cambiar fecha, hora, duración, modalidad o precio' })
  }
  if (clase.estado === 'dictada' && clase.cobro === 'pendiente' && !clase.pago_id) {
    opciones.push({ id: 'cobrar', label: 'Marcar cobrada', titulo: 'Ya pediste la plata; sigue sin pagar y no crea ingreso', tono: 'text-violet-300' })
  }
  if (clase.estado === 'dictada' && clase.cobro === 'cobrado' && !clase.pago_id) {
    opciones.push({ id: 'desmarcar', label: 'Desmarcar', titulo: 'Vuelve a no cobrada' })
  }
  if (!cancelada && sinPagar) {
    opciones.push({ id: 'cancelar', label: 'Cancelar', titulo: 'Queda en la lista como cancelada', tono: 'text-amber-300' })
  }
  if (sinPagar) {
    opciones.push({ id: 'eliminar', label: 'Eliminar', titulo: 'Borrarla del todo', tono: 'text-red-400' })
  }
  return opciones
}

function MenuFila({ clase, abierto, onAbrir, onCerrar, onElegir }) {
  const botonRef = useRef(null)
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const opciones = opcionesDe(clase)

  useEffect(() => {
    if (!abierto) return undefined
    function colocar() {
      const rect = botonRef.current?.getBoundingClientRect()
      if (!rect) return
      const ancho = 176
      const alto = opciones.length * 36 + 8
      let top = rect.bottom + 4
      if (top + alto > window.innerHeight - 8) top = Math.max(8, rect.top - alto - 4)
      let left = rect.right - ancho
      if (left < 8) left = 8
      setPos({ top, left })
    }
    colocar()
    function fuera(e) {
      if (menuRef.current?.contains(e.target) || botonRef.current?.contains(e.target)) return
      onCerrar()
    }
    function tecla(e) {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', colocar, true)
    window.addEventListener('resize', colocar)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', colocar, true)
      window.removeEventListener('resize', colocar)
    }
  }, [abierto, onCerrar, opciones.length])

  if (opciones.length === 0) return null

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        aria-label={`Acciones de ${clase.alumno}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => (abierto ? onCerrar() : onAbrir())}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700/70 hover:text-slate-100"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="8" cy="13" r="1.25" />
        </svg>
      </button>
      {abierto && pos && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-44 rounded-lg border border-slate-600/70 bg-slate-800 py-1 shadow-xl"
        >
          {opciones.map(op => (
            <button
              key={op.id}
              type="button"
              role="menuitem"
              title={op.titulo}
              onClick={() => onElegir(op.id)}
              className={`block w-full px-3 py-2 text-left text-xs hover:bg-slate-700/70 ${op.tono || 'text-slate-200'}`}
            >
              {op.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// Misma vista que la base de Notion: una fila por clase. El checkbox "dictada" solo pasa
// programada → dictada (no se desmarca). Pie: cantidad, suma de precios y lo ya dictado
// ("$ till now"); las canceladas no suman.
export function TablaClases({ clases, onMarcarDictada, onMarcarCobrada, onDesmarcarCobrada, onEditar, onCancelar, onEliminar }) {
  const [menuId, setMenuId] = useState(null)
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const vigentes = clases.filter(c => c.estado !== 'cancelada')
  const totalPrecio = vigentes.reduce((s, c) => s + c.monto, 0)
  const totalDictado = vigentes.filter(c => c.estado === 'dictada').reduce((s, c) => s + c.monto, 0)
  const totalHoras = vigentes.reduce((s, c) => s + c.horas, 0)

  if (clases.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-6">No hay clases con estos filtros.</p>
  }

  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
            <th className="py-2 pr-3 font-medium">Alumno</th>
            <th className="py-2 pr-3 font-medium">Fecha</th>
            <th className="py-2 pr-3 font-medium">Hora</th>
            <th className="py-2 pr-3 font-medium">Modalidad</th>
            <th className="py-2 pr-3 font-medium text-center">Dictada</th>
            <th className="py-2 pr-3 font-medium">Cobro</th>
            <th className="py-2 pr-3 font-medium text-right">Precio</th>
            <th className="py-2 pr-3 font-medium text-right">Horas</th>
            <th className="py-2 font-medium" aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {clases.map(c => {
            const cancelada = c.estado === 'cancelada'
            return (
              <tr key={c.id} className={`border-b border-slate-700/30 ${cancelada ? 'opacity-40' : ''}`}>
                <td className={`py-2 pr-3 text-slate-200 ${cancelada ? 'line-through' : ''}`}>{c.alumno}</td>
                <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">
                  <span className="text-slate-500 text-xs mr-1">{diaSemana(c.fecha)}</span>{formatFecha(c.fecha)}
                </td>
                <td className="py-2 pr-3 font-mono-numbers text-slate-300">{c.hora_inicio}</td>
                <td className="py-2 pr-3 text-slate-400">{c.modalidad === 'online' ? 'Online' : 'Presencial'}</td>
                <td className="py-2 pr-3 text-center">
                  <input
                    type="checkbox"
                    checked={c.estado === 'dictada'}
                    disabled={c.estado !== 'programada'}
                    onChange={() => onMarcarDictada(c)}
                    title={c.estado === 'programada' ? 'Marcar como dictada' : undefined}
                    className="w-4 h-4 accent-emerald-500 disabled:cursor-not-allowed"
                  />
                </td>
                <td className="py-2 pr-3" title={c.notion_status ? `Status en Notion: ${c.notion_status}` : undefined}>
                  <ChipCobro clase={c} />
                </td>
                <td className="py-2 pr-3 text-right font-mono-numbers text-slate-200">{privacyFormat(c.monto, isPrivacyModeEnabled)}</td>
                <td className="py-2 pr-3 text-right font-mono-numbers text-slate-400">{formatHoras(c.horas)}</td>
                <td className="py-2 text-right">
                  <MenuFila
                    clase={c}
                    abierto={menuId === c.id}
                    onAbrir={() => setMenuId(c.id)}
                    onCerrar={() => setMenuId(abierto => (abierto === c.id ? null : abierto))}
                    onElegir={(id) => {
                      setMenuId(null)
                      if (id === 'mover') onEditar(c)
                      if (id === 'cobrar') onMarcarCobrada(c)
                      if (id === 'desmarcar') onDesmarcarCobrada(c)
                      if (id === 'cancelar') onCancelar(c)
                      if (id === 'eliminar') onEliminar(c)
                    }}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="text-xs text-slate-400">
            <td className="pt-3 pr-3" colSpan={4}>{vigentes.length} clase{vigentes.length === 1 ? '' : 's'}</td>
            <td className="pt-3 pr-3 text-center" colSpan={2}>
              Dictado <span className="font-mono-numbers text-emerald-400">{privacyFormat(totalDictado, isPrivacyModeEnabled)}</span>
            </td>
            <td className="pt-3 pr-3 text-right font-mono-numbers text-slate-200 font-semibold">{privacyFormat(totalPrecio, isPrivacyModeEnabled)}</td>
            <td className="pt-3 pr-3 text-right font-mono-numbers">{formatHoras(totalHoras)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
