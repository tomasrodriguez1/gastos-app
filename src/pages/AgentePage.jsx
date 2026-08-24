import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { PasoAgente } from '../components/Agente/PasoAgente'

const TOOL_PART_TYPES = new Set(['tool-buscar_comercio', 'tool-crear_gasto'])

function IconAdjuntar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function archivoAFileUIPart(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ type: 'file', mediaType: archivo.file.type, filename: archivo.file.name, url: reader.result })
    reader.onerror = reject
    reader.readAsDataURL(archivo.file)
  })
}

export function AgentePage({ onRefetchGastos }) {
  const [input, setInput] = useState('')
  const [archivos, setArchivos] = useState([]) // [{ id, file, previewUrl }] — adjuntos sin enviar aún
  const gastosNotificados = useRef(new Set())
  const fileInputRef = useRef(null)

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

  function agregarArchivos(fileList) {
    const nuevos = Array.from(fileList || [])
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) }))
    if (nuevos.length) setArchivos(prev => [...prev, ...nuevos])
  }

  function quitarArchivo(id) {
    setArchivos(prev => {
      const objetivo = prev.find(a => a.id === id)
      if (objetivo) URL.revokeObjectURL(objetivo.previewUrl)
      return prev.filter(a => a.id !== id)
    })
  }

  function handlePaste(e) {
    const imagenes = Array.from(e.clipboardData?.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean)
    if (imagenes.length === 0) return
    e.preventDefault()
    agregarArchivos(imagenes)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const texto = input.trim()
    if ((!texto && archivos.length === 0) || enviando) return

    const files = archivos.length ? await Promise.all(archivos.map(archivoAFileUIPart)) : undefined
    if (texto) {
      sendMessage({ text: texto, files })
    } else {
      sendMessage({ files })
    }

    archivos.forEach(a => URL.revokeObjectURL(a.previewUrl))
    setArchivos([])
    setInput('')
  }

  return (
    <main className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col gap-4 h-[calc(100vh-4rem)] md:h-screen">
      <div>
        <h1 className="text-lg font-heading text-white">Agente</h1>
        <p className="text-xs text-slate-500">
          Contame un gasto en una frase — "12 lucas almuerzo con la polola BICE" — o mandá fotos de boletas (podés adjuntar, pegar con Ctrl+V o mandar varias juntas). Queda pendiente en la bandeja, nunca se confirma solo.
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
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onPaste={handlePaste}
          placeholder="12 lucas almuerzo con la polola BICE"
          className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 px-3 py-2 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
        />
        <button
          type="submit"
          disabled={(!input.trim() && archivos.length === 0) || enviando}
          className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Enviar
        </button>
      </form>
    </main>
  )
}
