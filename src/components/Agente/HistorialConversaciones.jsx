import { useState } from 'react'
import { useAgenteChat } from '../../contexts/AgenteChatContext'

function formatearFecha(iso) {
  const fecha = new Date(iso)
  return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// Dropdown de conversaciones pasadas del agente — vive dentro de AgenteChat
// para aparecer tanto en /agente como en el panel flotante sin duplicar UI.
export function HistorialConversaciones() {
  const { conversacionId, cambiarConversacion, historial, cargarHistorial } = useAgenteChat()
  const [abierto, setAbierto] = useState(false)

  function alAbrir() {
    const siguiente = !abierto
    setAbierto(siguiente)
    if (siguiente) cargarHistorial()
  }

  function seleccionar(id) {
    cambiarConversacion(id)
    setAbierto(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={alAbrir}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
      >
        Historial
        <IconChevron />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-[310]" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-full mt-1 z-[320] w-72 max-h-80 overflow-y-auto rounded-lg bg-slate-900 border border-slate-700 shadow-xl py-1">
            {historial.cargando && (
              <p className="text-xs text-slate-500 px-3 py-2">Cargando…</p>
            )}
            {!historial.cargando && historial.items.length === 0 && (
              <p className="text-xs text-slate-500 px-3 py-2">Todavía no hay conversaciones guardadas.</p>
            )}
            {historial.items.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => seleccionar(item.id)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors ${item.id === conversacionId ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-300'}`}
              >
                <div className="truncate">{item.titulo || 'Conversación sin título'}</div>
                <div className="text-slate-500">{formatearFecha(item.updated_at)}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
