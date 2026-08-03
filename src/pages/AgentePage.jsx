import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { PasoAgente } from '../components/Agente/PasoAgente'

const TOOL_PART_TYPES = new Set(['tool-buscar_comercio', 'tool-crear_gasto'])

export function AgentePage({ onRefetchGastos }) {
  const [input, setInput] = useState('')
  const gastosNotificados = useRef(new Set())

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/agente/chat' }),
  })

  // Cada vez que crear_gasto termina, el badge de /bandeja debe reflejar el
  // nuevo pendiente sin recargar la página.
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts || []) {
        if (part.type === 'tool-crear_gasto' && part.state === 'output-available') {
          const gastoId = part.output?.gastoId
          if (gastoId && !gastosNotificados.current.has(gastoId)) {
            gastosNotificados.current.add(gastoId)
            onRefetchGastos?.()
          }
        }
      }
    }
  }, [messages, onRefetchGastos])

  const enviando = status === 'submitted' || status === 'streaming'

  function handleSubmit(e) {
    e.preventDefault()
    const texto = input.trim()
    if (!texto || enviando) return
    sendMessage({ text: texto })
    setInput('')
  }

  return (
    <main className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col gap-4 h-[calc(100vh-4rem)] md:h-screen">
      <div>
        <h1 className="text-lg font-heading text-white">Agente</h1>
        <p className="text-xs text-slate-500">
          Contame un gasto en una frase — "12 lucas almuerzo con la polola BICE". Queda pendiente en la bandeja, nunca se confirma solo.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-12">
            Escribí un gasto para empezar.
          </p>
        )}

        {messages.map(message => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {message.role === 'user' ? (
              <div className="max-w-[85%] rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-100 text-sm px-3 py-2 whitespace-pre-wrap">
                {message.parts.filter(p => p.type === 'text').map(p => p.text).join('')}
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

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="12 lucas almuerzo con la polola BICE"
          className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 px-3 py-2 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
        />
        <button
          type="submit"
          disabled={!input.trim() || enviando}
          className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Enviar
        </button>
      </form>
    </main>
  )
}
