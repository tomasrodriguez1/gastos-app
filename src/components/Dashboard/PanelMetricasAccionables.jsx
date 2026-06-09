import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { calcularTotalPrevisto, esGastoUsdPuro, montoReal } from '../../utils/calculos'
import { formatCLP, formatFecha, privacyFormat } from '../../utils/formatters'
import { getSubcategoriaPresupuesto } from '../../utils/mapeo'

const DIA_CIERRE = 31

function getMesPrevio(mes) {
  const [yr, mo] = mes.split('-').map(Number)
  const prevMo = mo === 1 ? 12 : mo - 1
  const prevYr = mo === 1 ? yr - 1 : yr
  return `${prevYr}-${String(prevMo).padStart(2, '0')}`
}

function getDiaCorte(gastosMes, mes) {
  const hoy = new Date()
  const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  if (mes === mesHoy) {
    return Math.min(hoy.getDate(), DIA_CIERRE)
  }

  return gastosMes.reduce((max, gasto) => {
    const dia = Number(gasto.fecha?.split('-')[2] || 0)
    return Math.max(max, Math.min(dia, DIA_CIERRE))
  }, 0)
}

function getCategoria(gasto) {
  const asignacion = gasto.presupuesto_manual || getSubcategoriaPresupuesto(
    gasto.tipos || [],
    gasto.contexto_override || gasto.contexto || '',
    gasto.banco || '',
  )

  if (!asignacion) return 'Sin categoria'
  return `${asignacion.grupo} / ${asignacion.subcategoria}`
}

function MetricBlock({ label, value, detail, tone = 'text-slate-200' }) {
  return (
    <div className="rounded-lg border border-slate-700/45 bg-slate-950/25 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-2 font-mono-numbers text-xl font-bold ${tone}`}>{value}</div>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </div>
  )
}

export function PanelMetricasAccionables({ gastos, mes, presupuestoMes }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const presupuestoTotal = calcularTotalPrevisto(presupuestoMes)
  const gastosMes = gastos
    .filter(gasto => gasto.mes === mes)
    .filter(gasto => !esGastoUsdPuro(gasto))
    .map(gasto => ({ ...gasto, montoCalculado: montoReal(gasto) || 0 }))
    .filter(gasto => gasto.montoCalculado > 0)

  const diaCorte = getDiaCorte(gastosMes, mes)
  const gastoAcumulado = gastosMes
    .filter(gasto => {
      const dia = Number(gasto.fecha?.split('-')[2] || 0)
      return diaCorte === 0 || dia <= diaCorte
    })
    .reduce((sum, gasto) => sum + gasto.montoCalculado, 0)

  const proyeccionCierre = diaCorte > 0
    ? Math.round((gastoAcumulado / diaCorte) * DIA_CIERRE)
    : 0
  const desviacionProyectada = proyeccionCierre - presupuestoTotal
  const restante = presupuestoTotal - gastoAcumulado
  const diasRestantes = diaCorte > 0 ? Math.max(1, DIA_CIERRE - diaCorte + 1) : DIA_CIERRE
  const ritmoDiario = presupuestoTotal > 0 ? Math.floor(restante / diasRestantes) : 0
  const topGastos = [...gastosMes]
    .sort((a, b) => b.montoCalculado - a.montoCalculado)
    .slice(0, 5)

  const pctMes = diaCorte > 0 ? Math.round((diaCorte / DIA_CIERRE) * 100) : 0
  const pctPresupuesto = presupuestoTotal > 0 && diaCorte > 0
    ? Math.round((gastoAcumulado / presupuestoTotal) * 100)
    : null
  const diferenciaPct = pctPresupuesto !== null ? pctPresupuesto - pctMes : null

  const mesPrevio = getMesPrevio(mes)
  const gastoMesPrevio = gastos
    .filter(g => g.mes === mesPrevio && !esGastoUsdPuro(g))
    .filter(g => {
      const dia = Number(g.fecha?.split('-')[2] || 0)
      return diaCorte === 0 || dia <= diaCorte
    })
    .reduce((sum, g) => sum + montoReal(g), 0)
  const hayDatosPrevio = gastos.some(g => g.mes === mesPrevio)
  const deltaMesPrevio = gastoAcumulado - gastoMesPrevio

  const sinPresupuesto = presupuestoTotal <= 0
  const proyeccionTone = sinPresupuesto
    ? 'text-slate-400'
    : desviacionProyectada <= 0
      ? 'text-emerald-400'
      : 'text-rose-400'
  const ritmoTone = sinPresupuesto
    ? 'text-slate-400'
    : ritmoDiario < 0
      ? 'text-rose-400'
      : ritmoDiario < presupuestoTotal * 0.01
        ? 'text-orange-400'
        : 'text-emerald-400'

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          Metricas accionables
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Corte dia {diaCorte || 0} de {DIA_CIERRE}
        </p>
      </div>

      <div className="space-y-4">
        <MetricBlock
          label="Proyeccion de cierre"
          value={sinPresupuesto ? 'Sin presupuesto' : privacyFormat(proyeccionCierre, isPrivacyModeEnabled)}
          detail={
            sinPresupuesto
              ? 'Carga un presupuesto para comparar'
              : isPrivacyModeEnabled
                ? 'Desvio vs presupuesto oculto'
                : `${desviacionProyectada > 0 ? '+' : ''}${formatCLP(desviacionProyectada)} vs presupuesto`
          }
          tone={proyeccionTone}
        />

        <MetricBlock
          label="Ritmo diario disponible"
          value={sinPresupuesto ? 'Sin presupuesto' : privacyFormat(ritmoDiario, isPrivacyModeEnabled)}
          detail={
            sinPresupuesto
              ? 'No hay presupuesto total'
              : `${diasRestantes} dias restantes incluido hoy`
          }
          tone={ritmoTone}
        />

        <MetricBlock
          label="Ritmo del mes"
          value={
            pctPresupuesto !== null
              ? `${pctPresupuesto}% del presupuesto`
              : diaCorte > 0
                ? `Día ${diaCorte} de ${DIA_CIERRE}`
                : 'Sin datos'
          }
          detail={
            pctPresupuesto !== null
              ? `Día ${diaCorte}/${DIA_CIERRE} — ${pctMes}% del mes transcurrido`
              : 'Carga un presupuesto para comparar'
          }
          tone={
            diferenciaPct === null
              ? 'text-slate-400'
              : diferenciaPct <= 5
                ? 'text-emerald-400'
                : diferenciaPct <= 15
                  ? 'text-orange-400'
                  : 'text-rose-400'
          }
        />

        <MetricBlock
          label={`vs mes anterior${diaCorte > 0 ? ` (día ${diaCorte})` : ''}`}
          value={
            !hayDatosPrevio
              ? 'Sin datos'
              : privacyFormat(gastoMesPrevio, isPrivacyModeEnabled)
          }
          detail={
            !hayDatosPrevio
              ? 'No hay gastos del mes anterior'
              : isPrivacyModeEnabled
                ? 'Delta oculto'
                : `${deltaMesPrevio > 0 ? '+' : ''}${formatCLP(deltaMesPrevio)} vs el mismo período`
          }
          tone={
            !hayDatosPrevio
              ? 'text-slate-400'
              : deltaMesPrevio <= 0
                ? 'text-emerald-400'
                : 'text-rose-400'
          }
        />

        <div className="rounded-lg border border-slate-700/45 bg-slate-950/25">
          <div className="border-b border-slate-700/45 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Top 5 gastos del mes
            </div>
          </div>
          <div className="divide-y divide-slate-700/35">
            {topGastos.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">Sin gastos para este mes.</div>
            ) : topGastos.map(gasto => (
              <div key={gasto.id || `${gasto.fecha}-${gasto.motivo}-${gasto.montoCalculado}`} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-200">
                    {gasto.motivo || 'Sin descripcion'}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {formatFecha(gasto.fecha)} / {getCategoria(gasto)}
                  </div>
                </div>
                <div className="shrink-0 font-mono-numbers text-sm font-semibold text-slate-200">
                  {privacyFormat(gasto.montoCalculado, isPrivacyModeEnabled)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
