import { Link } from 'react-router-dom'
import { BandejaLista } from '../components/Bandeja/BandejaLista'

export function BandejaPage({ gastos, gastosLocales, catalogos, onActualizarGasto, onEliminarGasto }) {
  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-heading text-white">Bandeja</h1>
          <p className="text-xs text-slate-500">
            Gastos ingresados automáticamente (mail, etc.) esperando revisión — nada se confirma solo
          </p>
        </div>
        <Link
          to="/log"
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Ver log completo →
        </Link>
      </div>

      <BandejaLista
        gastos={gastos}
        gastosLocales={gastosLocales}
        catalogos={catalogos}
        onActualizarGasto={onActualizarGasto}
        onEliminarGasto={onEliminarGasto}
      />
    </main>
  )
}
