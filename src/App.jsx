import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/shared/Header'
import { DashboardPage } from './pages/DashboardPage'
import { CashflowPage } from './pages/CashflowPage'
import { AnalisisPage } from './pages/AnalisisPage'
import { GastosPage } from './pages/GastosPage'
import { LogPage } from './pages/LogPage'
import { BandejaPage } from './pages/BandejaPage'
import { AgentePage } from './pages/AgentePage'
import { PresupuestoPage } from './pages/PresupuestoPage'
import { TarjetaPage } from './pages/TarjetaPage'
import { PasskeysPage } from './pages/PasskeysPage'
import { useGastos } from './hooks/useGastos'
import { useGastosLocales } from './hooks/useGastosLocales'
import { usePresupuesto } from './hooks/usePresupuesto'
import { useSyncN8n } from './hooks/useSyncN8n'
import { useCatalogos } from './hooks/useCatalogos'
import { useReconciliacionTarjeta } from './hooks/useReconciliacionTarjeta'
import { cargarReglas } from './utils/mapeo'
import { obtenerCicloActual } from './utils/ciclos'

// Pre-cargar reglas de mapeo al iniciar la app
cargarReglas()

export default function App() {
  const { gastos, setGastos, actualizarGasto, eliminarGasto, recargar: recargarGastos, loading, ciclosDisponibles, mesesCalendarioDisponibles } = useGastos()

  const { gastosLocales, agregar, actualizar: actualizarLocal, eliminar, recargar: recargarLocales } = useGastosLocales()

  async function refetchGastos() {
    await Promise.all([recargarGastos(), recargarLocales()])
  }

  function eliminarCualquierGasto(id) {
    if (gastosLocales.some(g => g.id === id)) eliminar(id)
    else eliminarGasto(id)
  }

  function actualizarCualquierGasto(id, changes) {
    if (gastosLocales.some(g => g.id === id)) return actualizarLocal(id, changes)
    return actualizarGasto(id, changes)
  }
  const { obtenerCiclo, guardar, copiarCicloAnterior, cargado: presupuestoCargado, errorGuardado } = usePresupuesto()
  const { sincronizar, syncing, syncError, pendingSync, confirmarSync, cancelarSync } = useSyncN8n(setGastos)
  const catalogos = useCatalogos()
  const reconciliacion = useReconciliacionTarjeta()

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

  const ciclosLocales = [...new Set(gastosLocales.map(g => g.ciclo_financiero).filter(Boolean))]
  const ciclosUnion = [...new Set([...ciclosDisponibles, ...ciclosLocales])].sort().reverse()
  const ciclos = [...new Set([obtenerCicloActual(), ...ciclosUnion])].sort().reverse()
  const mesesCalendarioLocales = [...new Set(gastosLocales.map(g => g.mes).filter(Boolean))]
  const mesesCalendario = [...new Set([...mesesCalendarioDisponibles, ...mesesCalendarioLocales])].sort().reverse()

  const todoLosGastos = [...gastos, ...gastosLocales]

  const sharedProps = {
    ciclos,
    mesesCalendario,
    obtenerPresupuesto: obtenerCiclo,
    guardarPresupuesto: guardar,
    copiarCicloAnterior,
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
            path="/analisis"
            element={<AnalisisPage {...sharedProps} gastos={todoLosGastos} />}
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
            path="/log"
            element={
              <LogPage
                {...sharedProps}
                gastos={gastos}
                gastosLocales={gastosLocales}
                onActualizarGasto={actualizarCualquierGasto}
                onEliminarGasto={eliminarCualquierGasto}
              />
            }
          />
          <Route
            path="/bandeja"
            element={
              <BandejaPage
                {...sharedProps}
                gastos={gastos}
                gastosLocales={gastosLocales}
                onActualizarGasto={actualizarCualquierGasto}
                onEliminarGasto={eliminarCualquierGasto}
              />
            }
          />
          <Route
            path="/agente"
            element={<AgentePage {...sharedProps} />}
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
          <Route
            path="/tarjeta"
            element={
              <TarjetaPage
                {...sharedProps}
                gastos={todoLosGastos}
                reconciliacion={reconciliacion}
                onActualizarGasto={actualizarCualquierGasto}
              />
            }
          />
          <Route path="/passkeys" element={<PasskeysPage />} />
        </Routes>
      </div>
    </div>
  )
}
