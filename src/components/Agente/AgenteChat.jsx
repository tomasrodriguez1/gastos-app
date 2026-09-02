import { useRef } from 'react'
import { PasoAgente } from './PasoAgente'
import { HistorialConversaciones } from './HistorialConversaciones'
import { useAgenteChat } from '../../contexts/AgenteChatContext'

const TOOL_PART_TYPES = new Set([
  'tool-buscar_comercio',
  'tool-crear_gasto',
  'tool-buscar_gastos_pendientes',
  'tool-editar_gasto',
  'tool-registrar_saldos_reserva',
  'tool-listar_reservas',
  'tool-crear_reserva',
  'tool-editar_reserva',
  'tool-listar_saldos_reserva',
])

function IconAdjuntar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function IconMicrofono() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function IconGrabando() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  )
}

// UI del chat del agente — sin cromo de página, para poder montarse tanto en
// AgentePage (página completa) como en AgenteFlotante (panel deslizable),
// ambos consumiendo la misma conversación vía AgenteChatContext.
export function AgenteChat() {
  const {
    input, setInput,
    archivos, agregarArchivos, quitarArchivo,
    messages, status, error, enviando,
    handlePaste, handleSubmit,
    grabando, transcribiendo, errorGrabacion, iniciarGrabacion, detenerGrabacion,
    nuevaConversacion,
  } = useAgenteChat()
  const fileInputRef = useRef(null)

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <HistorialConversaciones />
        <button
          type="button"
          onClick={nuevaConversacion}
          className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          + Nueva conversación
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-12">
            Escribí un gasto para empezar.
          </p>
        )}

        {messages.map(message => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {message.role === 'user' ? (
              <div className="max-w-[85%] flex flex-col items-end gap-1.5">
                {message.parts.some(p => p.type === 'file') && (
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {message.parts.filter(p => p.type === 'file').map((p, i) => (
                      <img
                        key={i}
                        src={p.url}
                        alt={p.filename || 'Imagen adjunta'}
                        className="w-20 h-20 object-cover rounded-lg border border-emerald-500/30"
                      />
                    ))}
                  </div>
                )}
                {message.parts.some(p => p.type === 'text' && p.text) && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-100 text-sm px-3 py-2 whitespace-pre-wrap">
                    {message.parts.filter(p => p.type === 'text').map(p => p.text).join('')}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[85%] space-y-1.5">
                {message.parts.map((part, i) => {
                  if (part.type === 'text' && part.text) {
                    return (
                      <div key={i} className="rounded-xl bg-slate-800 border border-slate-700/50 text-slate-200 text-sm px-3 py-2 whitespace-pre-wrap">
                        {part.text}
                      </div>
                    )
                  }
                  if (TOOL_PART_TYPES.has(part.type)) {
                    return <PasoAgente key={i} part={part} />
                  }
                  return null
                })}
              </div>
            )}
          </div>
        ))}

        {status === 'submitted' && (
          <div className="text-xs text-slate-500 pl-3">Pensando…</div>
        )}
      </div>

      {error && (
        <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {error.message || 'Algo falló hablando con el agente'}
        </div>
      )}

      {errorGrabacion && (
        <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {errorGrabacion}
        </div>
      )}

      {archivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {archivos.map(a => (
            <div key={a.id} className="relative">
              <img src={a.previewUrl} alt={a.file.name} className="w-16 h-16 object-cover rounded-lg border border-slate-700" />
              <button
                type="button"
                onClick={() => quitarArchivo(a.id)}
                title="Quitar imagen"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 text-xs leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={e => { agregarArchivos(e.target.files); e.target.value = '' }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={enviando}
          title="Adjuntar fotos de boletas"
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <IconAdjuntar />
        </button>
        <button
          type="button"
          onClick={grabando ? detenerGrabacion : iniciarGrabacion}
          disabled={enviando || transcribiendo}
          title={grabando ? 'Detener grabación' : 'Grabar nota de voz'}
          className={
            grabando
              ? 'px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-400 animate-pulse transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
              : 'px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
          }
        >
          {grabando ? <IconGrabando /> : <IconMicrofono />}
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onPaste={handlePaste}
          placeholder={transcribiendo ? 'Transcribiendo…' : '12 lucas almuerzo con la polola BICE'}
          disabled={transcribiendo}
          className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 px-3 py-2 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={(!input.trim() && archivos.length === 0) || enviando || transcribiendo}
          className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
