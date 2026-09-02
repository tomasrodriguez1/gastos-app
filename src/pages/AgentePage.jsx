import { useState } from 'react'
import { AgenteChat } from '../components/Agente/AgenteChat'
import { BandejaLista } from '../components/Bandeja/BandejaLista'
import { usePendientes } from '../hooks/usePendientes'

function IconChevron({ abierto }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform lg:rotate-90 ${abierto ? 'rotate-180 lg:rotate-[-90deg]' : ''}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function AgentePage({ gastos, gastosLocales, catalogos, onActualizarGasto, onEliminarGasto }) {
  const [bandejaAbierta, setBandejaAbierta] = useState(true)
  const pendientes = usePendientes(gastos, gastosLocales)

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
        <section className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 order-1">
          <div>
            <h1 className="text-lg font-heading text-white">Agente</h1>
            <p className="text-xs text-slate-500">
              Contame un gasto en una frase — "12 lucas almuerzo con la polola BICE" — o mandá fotos de boletas (podés adjuntar, pegar con Ctrl+V o mandar varias juntas). Queda pendiente en la bandeja, nunca se confirma solo. También podés pedirme que corrija un gasto que ya quedó pendiente.
            </p>
          </div>
          <div className="flex-1 min-h-0">
            <AgenteChat />
          </div>
        </section>

        <aside className={`flex flex-col min-h-0 order-2 ${bandejaAbierta ? 'lg:w-[min(52%,44rem)]' : 'lg:w-64'} shrink-0`}>
          <button
            type="button"
            onClick={() => setBandejaAbierta(o => !o)}
            className="flex items-center justify-between w-full rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2 text-sm text-slate-300 hover:border-slate-600 transition-colors"
          >
            <span>
              Bandeja
              {pendientes.length > 0 && (
                <span className="ml-2 text-xs text-amber-400">
                  {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
                </span>
              )}
            </span>
            <IconChevron abierto={bandejaAbierta} />
          </button>

          {bandejaAbierta && (
            <div className="mt-2 flex-1 min-h-0 overflow-y-auto space-y-3 max-h-72 lg:max-h-none">
              <BandejaLista
                gastos={gastos}
                gastosLocales={gastosLocales}
                catalogos={catalogos}
                onActualizarGasto={onActualizarGasto}
                onEliminarGasto={onEliminarGasto}
              />
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
