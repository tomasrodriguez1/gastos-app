import { useState } from 'react'

export function CicloChip({ banco, diaCierre, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(diaCierre || ''))

  async function confirmar() {
    const numero = Number(valor)
    if (Number.isInteger(numero) && numero >= 1 && numero <= 28 && numero !== diaCierre) await onGuardar(banco, numero)
    setEditando(false)
  }

  if (editando) {
    return (
      <label className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-slate-800 px-2 py-1 text-xs text-slate-400">
        {banco} · cierre
        <input
          type="number"
          min={1}
          max={28}
          autoFocus
          value={valor}
          onChange={event => setValor(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') confirmar(); if (event.key === 'Escape') setEditando(false) }}
          onBlur={confirmar}
          className="w-10 rounded border border-slate-600 bg-slate-900 px-1 text-right font-mono-numbers text-slate-200 outline-none"
        />
      </label>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setValor(String(diaCierre || '')); setEditando(true) }}
      title="Día de cierre del estado de cuenta (1–28)"
      className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
    >
      {banco} · {diaCierre ? <>cierre <span className="font-mono-numbers text-slate-200">{diaCierre}</span></> : <span className="text-amber-400">sin cierre</span>} <span className="text-slate-600">✎</span>
    </button>
  )
}
