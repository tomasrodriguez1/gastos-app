import { Children, createContext, isValidElement, useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'

// Las respuestas del agente llegan como Markdown (listas, tablas, código).
// Esto las pinta al estilo de un chat: prosa con aire, bloques de código con
// encabezado y botón de copiar, y resaltado. El HTML crudo no se interpreta.
// El signo $ se deja como texto: en esta app es un monto en pesos, no una fórmula.

const EnBloque = createContext(false)

function textoPlano(nodo) {
  if (nodo == null || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join('')
  if (isValidElement(nodo)) return textoPlano(nodo.props.children)
  return ''
}

function lenguajeDe(children) {
  const hijo = Children.toArray(children).find(nodo => isValidElement(nodo))
  const className = hijo?.props?.className || ''
  return /language-([\w+-]+)/.exec(className)?.[1] || ''
}

function IconoCopiar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function IconoListo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function BloqueCodigo({ children }) {
  const [copiado, setCopiado] = useState(false)
  const lenguaje = lenguajeDe(children)

  async function copiar() {
    const texto = textoPlano(children).replace(/\n$/, '')
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      const area = document.createElement('textarea')
      area.value = texto
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 1600)
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0d] first:mt-0 last:mb-0">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-3 py-1.5">
        <span className="font-mono text-[11px] lowercase tracking-wide text-slate-400">{lenguaje || 'texto'}</span>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copiado ? <IconoListo /> : <IconoCopiar />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[13px] leading-relaxed text-slate-100">
        {children}
      </pre>
    </div>
  )
}

function Codigo({ className, children }) {
  const enBloque = useContext(EnBloque)
  if (enBloque) return <code className={className}>{children}</code>
  return (
    <code className="rounded-md bg-white/10 px-1.5 py-px font-mono text-[0.86em] text-slate-100">
      {children}
    </code>
  )
}

function Pre({ children }) {
  return (
    <EnBloque.Provider value={true}>
      <BloqueCodigo>{children}</BloqueCodigo>
    </EnBloque.Provider>
  )
}

const claseLink = 'text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]'

function Enlace({ href, children }) {
  if (!href) return <span>{children}</span>
  if (href.startsWith('/') && !href.startsWith('//')) {
    return <Link to={href} className={claseLink}>{children}</Link>
  }
  if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
    return <span>{children}</span>
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={claseLink}>
      {children}
    </a>
  )
}

const componentes = {
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-[1.35rem] font-semibold leading-snug tracking-tight text-white first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-[1.15rem] font-semibold leading-snug tracking-tight text-white first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-base font-semibold leading-snug text-white first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold text-slate-100 first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-2.5 leading-7 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={`my-2.5 list-disc space-y-1 pl-6 marker:text-slate-500 first:mt-0 last:mb-0 ${className || ''}`}>{children}</ul>
  ),
  ol: ({ children, className }) => (
    <ol className={`my-2.5 list-decimal space-y-1 pl-6 marker:text-slate-500 first:mt-0 last:mb-0 ${className || ''}`}>{children}</ol>
  ),
  li: ({ children, className }) => (
    <li className={`leading-7 [&>p]:my-1 ${className || ''}`}>{children}</li>
  ),
  a: Enlace,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-slate-500 pl-3 text-slate-400 first:mt-0 last:mb-0 [&>p]:text-slate-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-0 border-t border-white/10" />,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-slate-500 line-through">{children}</del>,
  input: ({ type, checked }) => (
    type === 'checkbox'
      ? <input type="checkbox" checked={Boolean(checked)} disabled className="mr-2 size-3.5 align-[-2px] accent-emerald-500 pointer-events-none" />
      : null
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-white/10 first:mt-0 last:mb-0">
      <table className="w-max min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.05] text-slate-100">{children}</thead>,
  th: ({ children, style }) => <th style={style} className="border-b border-white/10 px-2.5 py-2 font-semibold">{children}</th>,
  td: ({ children, style }) => <td style={style} className="border-b border-white/[0.06] px-2.5 py-2 align-top text-slate-200">{children}</td>,
  tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>,
  pre: Pre,
  code: Codigo,
  img: ({ src, alt }) => {
    if (!src || !/^(https?:|\/)/i.test(src)) return alt ? <span>{alt}</span> : null
    return <img src={src} alt={alt || ''} className="my-3 max-h-80 max-w-full rounded-xl border border-white/10" />
  },
}

export function MarkdownMensaje({ texto }) {
  return (
    <div className="chat-md min-w-0 break-words text-[15px] text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        components={componentes}
      >
        {texto || ''}
      </ReactMarkdown>
    </div>
  )
}
