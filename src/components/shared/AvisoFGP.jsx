import { Link, useLocation } from 'react-router-dom'
import { formatCLP } from '../../utils/formatters'
import { formatearFechaCorta } from '../../utils/vencimientosTarjeta'

function textoPlazo(dias) {
  if (dias < 0) return `vencido hace ${-dias} día${dias === -1 ? '' : 's'}`
  if (dias === 0) return 'vence hoy'
  return `en ${dias} día${dias === 1 ? '' : 's'}`
}

// Recordatorio global: faltante en el fondo de tarjeta cuando se acerca (o pasó) un vencimiento, y
// saldo FGP en rojo sin cubrir. Lejos del vencimiento no avisa: se ve en /tarjeta y /fondos.
// Se oculta en /fondos, donde está el panel para resolverlo.
export function AvisoFGP({ resumen, vencimientos }) {
  const { pathname } = useLocation()
  if (pathname === '/fondos') return null
  const venc = vencimientos?.aviso || null
  const enRojo = !!resumen && resumen.saldo < 0
  if (!venc && !enRojo) return null

  const vencido = venc?.nivel === 'vencido'
  const porMover = resumen?.totalPendienteTC || 0
  const tono = vencido
    ? 'border-red-500/30 bg-red-500/10 text-red-200'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'

  return (
    <div className={`border-b px-4 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${tono}`}>
      {venc && (
        <span>
          {vencido ? '🚨' : '⚠️'} Faltan <span className="font-mono-numbers font-semibold">{formatCLP(venc.faltante)}</span> en el fondo TC para el{' '}
          <span className="font-semibold">{formatearFechaCorta(venc.fecha)}</span> ({venc.banco})
          <span className="opacity-70"> · {textoPlazo(venc.dias)}</span>
          {porMover > 0 && (
            <span className="opacity-70"> · hay <span className="font-mono-numbers">{formatCLP(porMover)}</span> de FGP por mover</span>
          )}
        </span>
      )}
      {enRojo && (
        <span className="text-red-300">
          FGP en rojo: faltan <span className="font-mono-numbers font-semibold">{formatCLP(Math.abs(resumen.saldo))}</span>
        </span>
      )}
      <Link to={venc ? '/tarjeta' : '/fondos#fgp'} className="ml-auto text-xs font-medium text-amber-100 underline underline-offset-2 hover:text-white">
        {venc ? 'Ver tarjeta →' : 'Resolver en Fondos →'}
      </Link>
      {venc && (enRojo || porMover > 0) && (
        <Link to="/fondos#fgp" className="text-xs font-medium text-amber-100 underline underline-offset-2 hover:text-white">Resolver en Fondos →</Link>
      )}
    </div>
  )
}
