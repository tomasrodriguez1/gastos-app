import { useState, useMemo } from 'react'
import { TilesTarjeta } from '../components/Tarjeta/TilesTarjeta'
import { TablaTarjeta } from '../components/Tarjeta/TablaTarjeta'
import { esGastoUsdPuro } from '../utils/calculos'

const SIN_BANCOS = []

export function TarjetaPage({ gastos, catalogos, reservas, onGuardarReserva, onActualizarGasto }) {
  const bancos = catalogos?.bancos || SIN_BANCOS

  // Default: la tarjeta con más gastos pendientes, o la primera del catálogo.
  const bancoDefault = useMemo(() => {
    if (bancos.length === 0) return ''
    const conteo = {}
    gastos.forEach(g => {
      if (g.banco && !g.pagado) conteo[g.banco] = (conteo[g.banco] || 0) + 1
    })
    const masPendientes = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0]
    return masPendientes || bancos[0]
  }, [bancos, gastos])

  const [bancoElegido, setBancoElegido] = useState(null)
  const banco = bancoElegido || bancoDefault

  const pendientes = useMemo(() => {
    if (!banco) return []
    return gastos
      .filter(g => g.banco === banco && !g.pagado && !esGastoUsdPuro(g))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [gastos, banco])

  const porPagar = pendientes.reduce((s, g) => s + (g.monto || 0), 0)
  const porCobrar = pendientes.reduce((s, g) => s + (g.split || 0), 0)
  const reservado = reservas?.[banco] || 0

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-heading text-xl text-white">Tarjeta</h1>
        <select
          value={banco}
          onChange={e => setBancoElegido(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
        >
          {bancos.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {banco && (
        <>
          <TilesTarjeta
            banco={banco}
            porPagar={porPagar}
            porCobrar={porCobrar}
            reservado={reservado}
            onGuardarReserva={onGuardarReserva}
          />
          <TablaTarjeta gastos={pendientes} onActualizarGasto={onActualizarGasto} />
        </>
      )}
    </main>
  )
}
