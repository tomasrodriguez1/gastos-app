import { useState } from 'react'
import { useCountUp } from '../../hooks/useCountUp'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatCLP } from '../../utils/formatters'

function formatMonto(valor, moneda) {
  if (moneda === 'USD') return `USD ${(valor || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return formatCLP(valor || 0)
}

function Card({ label, value, moneda, sub, color = 'text-slate-200' }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const animatedValue = useCountUp(value || 0)
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-mono-numbers font-bold ${color}`}>
        {isPrivacyModeEnabled ? '••••••' : formatMonto(animatedValue, moneda)}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

function ReservaLegacy({ banco, monto, onGuardar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(monto || 0))

  async function confirmar() {
    const numero = Number(valor)
    if (!Number.isNaN(numero)) await onGuardar(banco, numero)
    setEditando(false)
  }

  return (
    <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/70">Referencia manual legacy</div>
      {editando ? (
        <input
          type="number"
          autoFocus
          value={valor}
          onChange={event => setValor(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') confirmar(); if (event.key === 'Escape') setEditando(false) }}
          onBlur={confirmar}
          className="mt-2 w-40 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-right font-mono-numbers text-slate-200"
        />
      ) : (
        <button onClick={() => { setValor(String(monto || 0)); setEditando(true) }} className="mt-2 font-mono-numbers text-lg text-slate-300 hover:text-white">
          {isPrivacyModeEnabled ? '••••••' : formatCLP(monto || 0)}
        </button>
      )}
      <p className="mt-1 text-xs text-slate-600">No participa en los cálculos derivados.</p>
    </div>
  )
}

export function TilesTarjeta({ banco, moneda, metricas, globales, reservaLegacy, onGuardarReserva }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Card label="Fondo actual" value={metricas.fondo_actual} moneda={moneda} color="text-emerald-400" sub={`${banco} · ya reservado`} />
        <Card label="Falta depositar" value={metricas.falta_depositar} moneda={moneda} color="text-rose-400" sub={`${banco} · acción pendiente`} />
        <Card label="Por pagar" value={metricas.por_pagar} moneda={moneda} sub="Deuda no pagada" />
        <Card label="Por cobrar" value={metricas.por_cobrar} moneda={moneda} color="text-sky-400" sub={moneda === 'USD' ? 'Split solo se registra en CLP' : 'Compras de terceros'} />
        <Card label="Gasto propio neto" value={metricas.gasto_propio_neto} moneda={moneda} sub="Por pagar − por cobrar" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Card label="Fondo total tarjetas" value={globales.fondo_actual} moneda={moneda} sub="Edwards + BICE" color="text-emerald-400" />
        <Card label="Falta total tarjetas" value={globales.falta_depositar} moneda={moneda} sub="Edwards + BICE" color="text-rose-400" />
        <ReservaLegacy banco={banco} monto={reservaLegacy} onGuardar={onGuardarReserva} />
      </div>
    </div>
  )
}
