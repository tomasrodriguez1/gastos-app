import { ReservasList } from '../components/Fondos/ReservasList'
import { FondoTarjetaResumen } from '../components/Fondos/FondoTarjetaResumen'
import { useReservas } from '../hooks/useReservas'

export function FondosPage({ catalogos, reconciliacion }) {
  const { reservas, cargando, error, crear, editar, cargarSaldos, registrarSaldo } = useReservas()

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div>
        <h1 className="font-heading text-3xl text-white">Fondos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reservas de ahorro externas y el fondo común de tarjeta. Los fondos de ahorro del
          presupuesto siguen en el Dashboard.
        </p>
      </div>

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

      <FondoTarjetaResumen fondo={reconciliacion?.fondo} />
    </main>
  )
}
