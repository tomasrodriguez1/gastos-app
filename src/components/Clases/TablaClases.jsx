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
  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">No cobrado</span>
}

// Misma vista que la base de Notion: una fila por clase. El checkbox "dictada" solo pasa
// programada → dictada (no se desmarca). Pie: cantidad, suma de precios y lo ya dictado
// ("$ till now"); las canceladas no suman.
export function TablaClases({ clases, onMarcarDictada, onEditar, onCancelar, onEliminar }) {
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
            const editable = c.estado === 'programada' && c.cobro === 'pendiente'
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
                <td className="py-2 text-right whitespace-nowrap">
                  {editable && (
                    <button type="button" onClick={() => onEditar(c)} title="Cambiar fecha, hora, duración, modalidad o precio" className="text-xs text-slate-500 hover:text-emerald-400 mr-3">Mover</button>
                  )}
                  {!cancelada && c.cobro === 'pendiente' && (
                    <button type="button" onClick={() => onCancelar(c)} title="Queda en la lista como cancelada" className="text-xs text-slate-500 hover:text-amber-400 mr-3">Cancelar</button>
                  )}
                  {c.cobro === 'pendiente' && (
                    <button type="button" onClick={() => onEliminar(c)} title="Borrarla del todo" className="text-xs text-slate-500 hover:text-red-400">Eliminar</button>
                  )}
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
