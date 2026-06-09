import { Link } from 'react-router-dom'
import { AlertasPresupuesto } from '../components/Dashboard/AlertasPresupuesto'
import { FondosAhorro } from '../components/Dashboard/FondosAhorro'
import { GraficoEvolucionPresupuesto } from '../components/Dashboard/GraficoEvolucionPresupuesto'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'
import { calcularTotalIngresos, calcularTotalMes, calcularTotalPrevisto } from '../utils/calculos'
import { formatCLP, formatFecha, formatMesLargo, getMesActual, privacyFormat } from '../utils/formatters'

function MetricCard({ label, value, detail, tone = 'text-slate-200' }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-3 font-mono-numbers text-2xl font-bold ${tone}`}>{value}</div>
      {detail && <div className="mt-2 text-sm text-slate-500">{detail}</div>}
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
  const mes = getMesActual()
  const presupuestoMes = obtenerPresupuesto(mes)
  const gastosMes = gastos.filter(g => g.mes === mes).sort((a, b) => b.fecha.localeCompare(a.fecha))

  const ingresos = calcularTotalIngresos(presupuestoMes)
  const previsto = calcularTotalPrevisto(presupuestoMes)
  const real = calcularTotalMes(gastos, mes)
  const saldo = ingresos - real
  const avance = previsto > 0 ? Math.round((real / previsto) * 100) : 0

  const ultimosGastos = gastosMes.slice(0, 5)

  return (
    <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-slate-500">{formatMesLargo(mes)}</p>
          <h1 className="font-heading text-3xl text-white mt-1">Dashboard</h1>
        </div>
        <Link
          to="/cashflow"
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/15"
        >
          Ver cashflow
        </Link>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Ingresos" value={privacyFormat(ingresos, isPrivacyModeEnabled)} detail="Presupuesto del mes" tone="text-emerald-400" />
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
        mes={mes}
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
              <div className="px-5 py-8 text-sm text-slate-500">Sin movimientos para este mes.</div>
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

        <AlertasPresupuesto gastos={gastos} mes={mes} presupuestoMes={presupuestoMes} />
      </section>
    </main>
  )
}
