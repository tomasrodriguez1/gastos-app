import { useState } from 'react'

const enRango = n => Number.isInteger(n) && n >= 1 && n <= 28
const inputClase = 'w-10 rounded border border-slate-600 bg-slate-900 px-1 text-right font-mono-numbers text-slate-200 outline-none'

// Cierre y día de pago de una tarjeta. El pago es el día del mes siguiente al cierre (o el mismo mes
// si es posterior) en que vence el estado de cuenta — ver src/utils/vencimientosTarjeta.js.
export function CicloChip({ banco, diaCierre, diaPago, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [cierre, setCierre] = useState(String(diaCierre || ''))
  const [pago, setPago] = useState(String(diaPago || ''))

  function abrir() {
    setCierre(String(diaCierre || ''))
    setPago(String(diaPago || ''))
    setEditando(true)
  }

  async function confirmar() {
    const nuevoCierre = Number(cierre)
    const pagoVacio = pago.trim() === ''
    const nuevoPago = Number(pago)
    const cierreOk = enRango(nuevoCierre)
    const pagoOk = pagoVacio || enRango(nuevoPago)
    if (cierreOk && pagoOk) {
      // Sin pago escrito: se borra solo si había uno; si no, no se toca.
      const pagoAGuardar = pagoVacio ? (diaPago ? null : undefined) : nuevoPago
      const cambioPago = pagoAGuardar !== undefined && pagoAGuardar !== (diaPago ?? null)
      if (nuevoCierre !== diaCierre || cambioPago) await onGuardar(banco, nuevoCierre, cambioPago ? pagoAGuardar : undefined)
    }
    setEditando(false)
  }

  if (editando) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-slate-800 px-2 py-1 text-xs text-slate-400"
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) confirmar() }}
        onKeyDown={event => { if (event.key === 'Enter') confirmar(); if (event.key === 'Escape') setEditando(false) }}
      >
        {banco} · cierre
        <input type="number" min={1} max={28} autoFocus value={cierre} onChange={event => setCierre(event.target.value)} className={inputClase} />
        · pago
        <input type="number" min={1} max={28} value={pago} onChange={event => setPago(event.target.value)} className={inputClase} />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title="Día de cierre del estado de cuenta y día de pago (1–28)"
      className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
    >
      {banco} · {diaCierre ? <>cierre <span className="font-mono-numbers text-slate-200">{diaCierre}</span></> : <span className="text-amber-400">sin cierre</span>}
      {' · '}
      {diaPago ? <>pago <span className="font-mono-numbers text-slate-200">{diaPago}</span></> : <span className="text-amber-400">sin pago</span>}
      {' '}<span className="text-slate-600">✎</span>
    </button>
  )
}
