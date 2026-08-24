import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AgenteChat } from './AgenteChat'
import { BotonBandeja } from '../shared/BotonBandeja'
import { usePendientes } from '../../hooks/usePendientes'

function IconAgente() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="10" x2="8" y2="10.01" />
      <line x1="12" y1="10" x2="12" y2="10.01" />
      <line x1="16" y1="10" x2="16" y2="10.01" />
    </svg>
  )
}

function IconCerrar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// Acceso al agente desde cualquier página: botón flotante que abre un panel
// deslizable sobre la página actual, sin navegar. Comparte la misma
// conversación que /agente (AgenteChatContext) — no es un chat aparte.
// Oculto en /agente mismo, donde el chat ya está a pantalla completa.
export function AgenteFlotante({ gastos, gastosLocales }) {
  const [abierto, setAbierto] = useState(false)
  const location = useLocation()
  const enPaginaAgente = location.pathname === '/agente'

  // Si el usuario navega a /agente mientras el panel está abierto, se cierra
  // solo — al volver a otra página debe arrancar cerrado, no reaparecer
  // abierto de sorpresa. Ajuste de estado durante el render (no en un
  // efecto): es el patrón recomendado por React para resetear estado cuando
  // cambia una condición derivada de props/route.
  const [enPaginaAgenteAnterior, setEnPaginaAgenteAnterior] = useState(enPaginaAgente)
  if (enPaginaAgente !== enPaginaAgenteAnterior) {
    setEnPaginaAgenteAnterior(enPaginaAgente)
    if (enPaginaAgente) setAbierto(false)
  }

  const pendientes = usePendientes(gastos, gastosLocales)

  if (enPaginaAgente) return null

  return (
    <>
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title="Agente"
          className="fixed z-[250] bottom-20 right-4 md:bottom-6 md:right-6 w-12 h-12 rounded-full bg-emerald-500 text-slate-900 shadow-lg shadow-black/30 flex items-center justify-center hover:bg-emerald-400 transition-colors"
        >
          <IconAgente />
          {pendientes.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-900 px-1">
              {pendientes.length}
            </span>
          )}
        </button>
      )}

      {abierto && (
        <>
          <div
            className="fixed inset-0 z-[290] bg-black/40"
            onClick={() => setAbierto(false)}
          />
          <div className="fixed inset-y-0 right-0 z-[300] w-full sm:max-w-md bg-[var(--background)] border-l border-slate-800 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-heading text-white">Agente</h2>
              <div className="flex items-center gap-2">
                <BotonBandeja gastos={[...gastos, ...gastosLocales]} compact />
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  title="Cerrar"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
                >
                  <IconCerrar />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-4">
              <AgenteChat />
            </div>
          </div>
        </>
      )}
    </>
  )
}
