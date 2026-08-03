import { Link } from 'react-router-dom'
import { AlertasPresupuesto } from '../components/Dashboard/AlertasPresupuesto'
import { BotonBandeja } from '../components/shared/BotonBandeja'
import { FondosAhorro } from '../components/Dashboard/FondosAhorro'
import { GraficoEvolucionPresupuesto } from '../components/Dashboard/GraficoEvolucionPresupuesto'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'
import { calcularTotalIngresos, calcularTotalMes, calcularTotalPrevisto } from '../utils/calculos'
import { formatCLP, formatFecha, privacyFormat } from '../utils/formatters'
import { formatCiclo, formatRangoCiclo, obtenerCicloActual } from '../utils/ciclos'

function MetricCard({ label, value, detail, tone = 'text-slate-200' }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 sm:p-5">
      <div className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1.5 sm:mt-3 font-mono-numbers text-lg sm:text-2xl font-bold leading-tight ${tone}`}>{value}</div>
      {detail && <div className="hidden sm:block mt-2 text-sm text-slate-500">{detail}</div>}
    </div>
  )
}

function MontoMovimiento({ gasto, isPrivacyModeEnabled }) {
  if (isPrivacyModeEnabled) {
    return <div className="font-mono-numbers text-sm font-semibold text-slate-300">••••••</div>
  }

  if (gasto.usd > 0 && !gasto.monto) {
    return (
      <div className="text-right">
        <div className="font-mono-numbers text-sm font-semibold text-slate-300">
          {formatCLP(gasto.monto_clp_manual ?? gasto.monto_real ?? 0)}
        </div>
        <div className="mt-0.5 font-mono-numbers text-xs text-sky-300">
          USD {gasto.usd.toFixed(2)}
        </div>
      </div>
    )
  }

  const monto = gasto.monto_real ?? gasto.monto ?? 0

  return (
    <div className="text-right">
      <div className="font-mono-numbers text-sm font-semibold text-slate-300">
        {formatCLP(monto)}
      </div>
    </div>
  )
}

export function DashboardPage({ gastos, obtenerPresupuesto, guardarPresupuesto, catalogos, onAgregarGasto, onRefetchGastos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const ciclo = obtenerCicloActual()
  const presupuestoMes = obtenerPresupuesto(ciclo)
  const gastosMes = gastos.filter(g => g.ciclo_financiero === ciclo).sort((a, b) => b.fecha.localeCompare(a.fecha))

  const ingresos = calcularTotalIngresos(presupuestoMes)
  const previsto = calcularTotalPrevisto(presupuestoMes)
  const real = calcularTotalMes(gastos, ciclo)
  const saldo = ingresos - real
  const avance = previsto > 0 ? Math.round((real / previsto) * 100) : 0

  const ultimosGastos = gastosMes.slice(0, 5)
  const conErrorParseo = gastos.filter(g => g.estado === 'error_parseo').length

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-slate-500">{formatCiclo(ciclo)} · {formatRangoCiclo(ciclo)}</p>
          <h1 className="font-heading text-3xl text-white mt-1">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <BotonBandeja gastos={gastos} />
          <Link
            to="/cashflow"
            className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/15"
          >
            Ver cashflow
          </Link>
        </div>
      </div>

      {conErrorParseo > 0 && (
        <Link
          to="/bandeja"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm hover:bg-rose-500/15 transition-colors"
        >
          <span className="font-medium">{conErrorParseo}</span>
          gasto{conErrorParseo !== 1 ? 's' : ''} con error de parseo esperando revisión manual — revisar en la bandeja
        </Link>
      )}

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
        <MetricCard label="Ingresos" value={privacyFormat(ingresos, isPrivacyModeEnabled)} detail="Presupuesto del ciclo" tone="text-emerald-400" />
        <MetricCard label="Gasto real" value={privacyFormat(real, isPrivacyModeEnabled)} detail={`${avance}% del presupuesto`} />
        <MetricCard label="Presupuestado" value={privacyFormat(previsto, isPrivacyModeEnabled)} detail="Total planificado" tone="text-sky-300" />
        <MetricCard
          label="Saldo"
          value={privacyFormat(saldo, isPrivacyModeEnabled)}
          detail={saldo >= 0 ? 'Disponible contra ingresos' : 'Sobre ingresos'}
          tone={saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
      </section>

      <GraficoEvolucionPresupuesto gastos={gastos} />

      <FondosAhorro
        presupuestoMes={presupuestoMes}
        mes={ciclo}
        onGuardarPresupuesto={guardarPresupuesto}
        catalogos={catalogos}
        gastos={gastos}
        onAgregarGasto={onAgregarGasto}
        onRefetchGastos={onRefetchGastos}
      />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-200">Ultimos movimientos</h2>
            <Link to="/gastos" className="text-sm text-sky-300 hover:text-sky-200">Abrir gastos</Link>
          </div>
          <div className="divide-y divide-slate-800/80">
            {ultimosGastos.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">Sin movimientos para este ciclo financiero.</div>
            ) : ultimosGastos.map(gasto => (
              <div key={gasto.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-200">{gasto.motivo || 'Sin descripcion'}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{formatFecha(gasto.fecha)} / {gasto.banco || 'Sin banco'}</div>
                </div>
                <MontoMovimiento
                  gasto={gasto}
                  isPrivacyModeEnabled={isPrivacyModeEnabled}
                />
              </div>
            ))}
          </div>
        </div>

        <AlertasPresupuesto gastos={gastos} mes={ciclo} presupuestoMes={presupuestoMes} />
      </section>
    </main>
  )
}
