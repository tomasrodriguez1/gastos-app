import { Link, useLocation } from 'react-router-dom'
import { formatCLP } from '../../utils/formatters'

// Recordatorio global del FGP: gastos con tarjeta que todavía hay que pasar al fondo TC, y saldo
// en rojo sin cubrir. Se oculta en /fondos, donde está el panel para resolverlo.
export function AvisoFGP({ resumen }) {
  const { pathname } = useLocation()
  if (!resumen || pathname === '/fondos') return null
  const pendientes = resumen.pendientesTC.length
  const enRojo = resumen.saldo < 0
  if (!pendientes && !enRojo) return null

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 flex flex-wrap items-center gap-x-4 gap-y-1">
      {pendientes > 0 && (
        <span>
          ⚠️ Mover <span className="font-mono-numbers font-semibold">{formatCLP(resumen.totalPendienteTC)}</span> de FGP al fondo TC
          <span className="text-amber-200/70"> ({pendientes} gasto{pendientes === 1 ? '' : 's'})</span>
        </span>
      )}
      {enRojo && (
        <span className="text-red-300">
          FGP en rojo: faltan <span className="font-mono-numbers font-semibold">{formatCLP(Math.abs(resumen.saldo))}</span>
        </span>
      )}
      <Link to="/fondos#fgp" className="ml-auto text-xs font-medium text-amber-100 underline underline-offset-2 hover:text-white">Resolver en Fondos →</Link>
    </div>
  )
}
