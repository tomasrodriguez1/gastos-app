import { privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatearFechaCorta } from '../../utils/vencimientosTarjeta'

const TONOS = {
  vencido: 'border-red-500/30 bg-red-500/10 text-red-200',
  cerca: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  lejos: 'border-slate-700/60 bg-slate-800/50 text-slate-300',
}

function plazo(dias) {
  if (dias < 0) return `vencido hace ${-dias} día${dias === -1 ? '' : 's'}`
  if (dias === 0) return 'vence hoy'
  return `en ${dias} día${dias === 1 ? '' : 's'}`
}

// Indicador siempre visible (a diferencia del aviso global, que solo salta cerca del vencimiento):
// próximo vencimiento de cada tarjeta y si el fondo TC alcanza para cubrirlo.
export function ProximoVencimiento({ vencimientos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  if (!vencimientos) return null
  const fmt = n => privacyFormat(n, isPrivacyModeEnabled)
  const { vencimientos: lista, proximo, sinFecha, usdSinConvertir, usdEstimado } = vencimientos

  if (lista.length === 0) {
    if (sinFecha.movimientos === 0) return null
    return (
      <div className={`rounded-lg border px-4 py-2.5 text-xs ${TONOS.cerca}`}>
        Configurá el cierre y el pago de cada tarjeta (chips de arriba) para ver cuándo vence la deuda.
      </div>
    )
  }

  const siguiente = lista[0]
  const nivel = (proximo || siguiente).nivel
  return (
    <div className={`rounded-lg border px-4 py-2.5 text-xs space-y-1 ${TONOS[proximo ? nivel : 'lejos']}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium">Próximo vencimiento</span>
        <span>
          {formatearFechaCorta(siguiente.fecha)} · {siguiente.banco} · <span className="font-mono-numbers">{fmt(siguiente.total)}</span>
          <span className="opacity-70"> · {plazo(siguiente.dias)}</span>
        </span>
        <span className="ml-auto">
          {proximo
            ? <>Faltan <span className="font-mono-numbers font-semibold">{fmt(proximo.faltante)}</span> en el fondo para el {formatearFechaCorta(proximo.fecha)} ({proximo.banco})</>
            : <span className="text-emerald-400">El fondo TC cubre todo lo que vence</span>}
        </span>
      </div>
      {lista.length > 1 && (
        <div className="opacity-70">
          Luego: {lista.slice(1, 4).map(v => `${formatearFechaCorta(v.fecha)} ${v.banco}`).join(' · ')}
        </div>
      )}
      {(sinFecha.movimientos > 0 || usdSinConvertir > 0 || usdEstimado?.movimientos > 0) && (
        <div className="opacity-70">
          {sinFecha.movimientos > 0 && `${sinFecha.movimientos} movimiento${sinFecha.movimientos === 1 ? '' : 's'} sin fecha de pago (falta configurar la tarjeta). `}
          {usdEstimado?.movimientos > 0 && `${usdEstimado.movimientos} en USD sin monto en pesos, estimado${usdEstimado.movimientos === 1 ? '' : 's'} a $${usdEstimado.tipoCambio} el dólar. `}
          {usdSinConvertir > 0 && `${usdSinConvertir} en USD sin monto en pesos, fuera de este cálculo.`}
        </div>
      )}
    </div>
  )
}
