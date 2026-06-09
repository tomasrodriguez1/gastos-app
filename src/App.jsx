import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/shared/Header'
import { DashboardPage } from './pages/DashboardPage'
import { CashflowPage } from './pages/CashflowPage'
import { GastosPage } from './pages/GastosPage'
import { PresupuestoPage } from './pages/PresupuestoPage'
import { useGastos } from './hooks/useGastos'
import { useGastosLocales } from './hooks/useGastosLocales'
import { usePresupuesto } from './hooks/usePresupuesto'
import { useSyncN8n } from './hooks/useSyncN8n'
import { useCatalogos } from './hooks/useCatalogos'
import { cargarReglas } from './utils/mapeo'
import { cargarDeDisco } from './utils/persistencia'
import { getMesActual } from './utils/formatters'

// Pre-cargar reglas de mapeo al iniciar la app
cargarReglas()

export default function App() {
  const { gastos, setGastos, actualizarGasto, eliminarGasto, loading, mesesDisponibles } = useGastos()

  async function refetchGastos() {
    const data = await cargarDeDisco('gastos')
    if (data?.length) setGastos(data)
  }
  const { gastosLocales, agregar, actualizar: actualizarLocal, eliminar } = useGastosLocales()

  function eliminarCualquierGasto(id) {
    if (gastosLocales.some(g => g.id === id)) eliminar(id)
    else eliminarGasto(id)
  }

  function actualizarCualquierGasto(id, changes) {
    if (gastosLocales.some(g => g.id === id)) actualizarLocal(id, changes)
    else actualizarGasto(id, changes)
  }
  const { obtenerMes, guardar, copiarMesAnterior, cargado: presupuestoCargado, errorGuardado } = usePresupuesto()
  const { sincronizar, syncing, syncError, pendingSync, confirmarSync, cancelarSync } = useSyncN8n(setGastos)
  const catalogos = useCatalogos()

  if (loading || !presupuestoCargado) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-800" />
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-700" />
                <div className="h-7 w-32 animate-pulse rounded bg-slate-700" />
              </div>
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-slate-800/50 border border-slate-700/50" />
        </div>
      </div>
    )
  }

  const mesesLocales = [...new Set(gastosLocales.map(g => g.mes))]
  const mesesUnion = [...new Set([...mesesDisponibles, ...mesesLocales])].sort().reverse()
  const meses = [...new Set([getMesActual(), ...mesesUnion])].sort().reverse()

  const todoLosGastos = [...gastos, ...gastosLocales]

  const sharedProps = {
    meses,
    obtenerPresupuesto: obtenerMes,
    guardarPresupuesto: guardar,
    copiarMesAnterior,
    catalogos,
    onAgregarGasto: agregar,
    onRefetchGastos: refetchGastos,
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar />
      <div className="pb-16 md:pb-0 md:pl-64">
        {errorGuardado && (
          <div className="bg-red-500/20 border-b border-red-500/30 text-red-400 text-sm px-6 py-2 text-center">
            {errorGuardado} — recargá la página y volvé a intentarlo
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={<DashboardPage {...sharedProps} gastos={todoLosGastos} />}
          />
          <Route
            path="/cashflow"
            element={
              <CashflowPage
                {...sharedProps}
                gastos={todoLosGastos}
                onSync={sincronizar}
                syncing={syncing}
                syncError={syncError}
                pendingSync={pendingSync}
                onConfirmarSync={confirmarSync}
                onCancelarSync={cancelarSync}
              />
            }
          />
          <Route
            path="/gastos"
            element={
              <GastosPage
                {...sharedProps}
                gastos={gastos}
                gastosLocales={gastosLocales}
                onAgregarGasto={agregar}
                onEliminarGasto={eliminarCualquierGasto}
                onActualizarGasto={actualizarCualquierGasto}
                onSync={sincronizar}
                syncing={syncing}
                syncError={syncError}
                pendingSync={pendingSync}
                onConfirmarSync={confirmarSync}
                onCancelarSync={cancelarSync}
              />
            }
          />
          <Route
            path="/presupuesto"
            element={
              <PresupuestoPage
                {...sharedProps}
                gastos={todoLosGastos}
              />
            }
          />
        </Routes>
      </div>
    </div>
  )
}
