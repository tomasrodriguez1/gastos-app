import { useState } from 'react'
import { ReservasList } from '../components/Fondos/ReservasList'
import { FondoTarjetaResumen } from '../components/Fondos/FondoTarjetaResumen'
import { FondoFGPPanel } from '../components/Fondos/FondoFGPPanel'
import { FondosAhorro } from '../components/Dashboard/FondosAhorro'
import { useReservas } from '../hooks/useReservas'
import { obtenerCicloActual } from '../utils/ciclos'

export function FondosPage({
  catalogos, reconciliacion, gastos, obtenerPresupuesto, guardarPresupuesto,
  onAgregarGasto, onRefetchGastos, onActualizarGasto, fgp, resumenFGP,
}) {
  const { reservas, cargando, error, crear, editar, cargarSaldos, registrarSaldo } = useReservas()
  const ciclo = obtenerCicloActual()
  const presupuestoMes = obtenerPresupuesto(ciclo)
  // Una cobertura del FGP desde un fondo de ahorro escribe en su libro: remonta FondosAhorro para releerlo.
  const [versionAhorro, setVersionAhorro] = useState(0)

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div>
        <h1 className="font-heading text-3xl text-white">Fondos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todo lo que es "plata guardada": el FGP, fondos de ahorro del presupuesto (los mismos del
          Dashboard, mismo dato), reservas externas y el fondo común de tarjeta.
        </p>
      </div>

      {resumenFGP && (
        <FondoFGPPanel
          resumen={resumenFGP}
          fgp={fgp}
          cicloActual={ciclo}
          fondosPresupuesto={presupuestoMes?.fondos}
          gastos={gastos}
          onCambioFondoAhorro={() => setVersionAhorro(v => v + 1)}
        />
      )}

      <FondosAhorro
        key={versionAhorro}
        presupuestoMes={presupuestoMes}
        mes={ciclo}
        onGuardarPresupuesto={guardarPresupuesto}
        catalogos={catalogos}
        gastos={gastos}
        onAgregarGasto={onAgregarGasto}
        onRefetchGastos={onRefetchGastos}
        onActualizarGasto={onActualizarGasto}
      />

      <ReservasList
        reservas={reservas}
        cargando={cargando}
        error={error}
        gruposPresupuesto={catalogos?.gruposPresupuesto}
        onCrear={crear}
        onEditar={editar}
        onCargarSaldos={cargarSaldos}
        onRegistrarSaldo={registrarSaldo}
      />

      <FondoTarjetaResumen fondo={reconciliacion?.fondo} onEliminarMovimiento={reconciliacion?.eliminarMovimientoFondo} />
    </main>
  )
}
