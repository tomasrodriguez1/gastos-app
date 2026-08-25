/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

// Estado de la conversación del agente, compartido entre la página completa
// (/agente) y el widget flotante (AgenteFlotante) — una sola conversación
// activa a la vez, visible desde cualquier parte de la app, no dos chats
// independientes. La conversación activa persiste en localStorage y en la
// tabla agente_conversaciones/agente_mensajes (server/agente/historial.js),
// así sobrevive a un refresh y se puede volver a una anterior desde el
// historial (ver HistorialConversaciones).

const AgenteChatContext = createContext(undefined)

const CLAVE_CONVERSACION_ACTUAL = 'agenteConversacionActual'

function idConversacionInicial() {
  try {
    return localStorage.getItem(CLAVE_CONVERSACION_ACTUAL) || crypto.randomUUID()
  } catch {
    return crypto.randomUUID()
  }
}

function archivoAFileUIPart(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ type: 'file', mediaType: archivo.file.type, filename: archivo.file.name, url: reader.result })
    reader.onerror = reject
    reader.readAsDataURL(archivo.file)
  })
}

export function AgenteChatProvider({ onRefetchGastos, children }) {
  const [input, setInput] = useState('')
  const [archivos, setArchivos] = useState([]) // [{ id, file, previewUrl }] — adjuntos sin enviar aún
  const [conversacionId, setConversacionId] = useState(idConversacionInicial)
  const [historial, setHistorial] = useState({ items: [], cargando: false })
  const gastosNotificados = useRef(new Set())

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: conversacionId,
    transport: new DefaultChatTransport({ api: '/api/agente/chat', body: { conversacionId } }),
  })

  useEffect(() => {
    try { localStorage.setItem(CLAVE_CONVERSACION_ACTUAL, conversacionId) } catch { /* localStorage no disponible */ }
  }, [conversacionId])

  // Trae los mensajes guardados de la conversación activa (al montar, o al
  // cambiar de conversación desde el historial). Si todavía no existe en el
  // servidor (recién creada, nunca se mandó un mensaje) el fetch da 404 y no
  // hace nada — el chat ya arranca vacío al recrearse por el cambio de id.
  useEffect(() => {
    let cancelado = false
    fetch(`/api/agente/conversaciones/${conversacionId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelado && data?.mensajes) setMessages(data.mensajes)
      })
      .catch(() => {})
    return () => { cancelado = true }
  }, [conversacionId, setMessages])

  function nuevaConversacion() {
    setConversacionId(crypto.randomUUID())
  }

  function cambiarConversacion(id) {
    setConversacionId(id)
  }

  function cargarHistorial() {
    setHistorial(h => ({ ...h, cargando: true }))
    fetch('/api/agente/conversaciones')
      .then(res => (res.ok ? res.json() : []))
      .then(items => setHistorial({ items, cargando: false }))
      .catch(() => setHistorial(h => ({ ...h, cargando: false })))
  }

  // Cada vez que crear_gasto o editar_gasto terminan, la bandeja embebida y el
  // badge de /bandeja deben reflejar el cambio sin recargar la página.
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
        if (part.type === 'tool-editar_gasto' && part.state === 'output-available' && part.output?.ok) {
          const key = `edit:${part.toolCallId}`
          if (!gastosNotificados.current.has(key)) {
            gastosNotificados.current.add(key)
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

  const value = {
    input, setInput,
    archivos, agregarArchivos, quitarArchivo,
    messages, status, error, enviando,
    handlePaste, handleSubmit,
    conversacionId, nuevaConversacion, cambiarConversacion,
    historial, cargarHistorial,
  }

  return <AgenteChatContext.Provider value={value}>{children}</AgenteChatContext.Provider>
}

export function useAgenteChat() {
  const ctx = useContext(AgenteChatContext)
  if (!ctx) throw new Error('useAgenteChat must be used within an AgenteChatProvider')
  return ctx
}
