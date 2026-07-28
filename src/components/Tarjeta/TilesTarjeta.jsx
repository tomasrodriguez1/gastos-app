import { useState } from 'react'
import { useCountUp } from '../../hooks/useCountUp'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { privacyFormat } from '../../utils/formatters'

function Card({ label, rawValue, sub, color = 'text-slate-200' }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const animatedValue = useCountUp(rawValue)
  const displayValue = privacyFormat(animatedValue, isPrivacyModeEnabled)

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-mono-numbers font-bold ${color}`}>{displayValue}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

function CardReservado({ banco, monto, onGuardar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(monto || 0))

  function confirmar() {
    const n = Number(valor)
    if (!Number.isNaN(n)) onGuardar(banco, n)
    setEditando(false)
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Reservado</div>
      {editando ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            autoFocus
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-lg font-mono-numbers text-slate-200"
            value={valor}
            onChange={e => setValor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false) }}
            onBlur={confirmar}
          />
        </div>
      ) : (
        <button
          onClick={() => { setValor(String(monto || 0)); setEditando(true) }}
          className="text-2xl font-mono-numbers font-bold text-slate-200 hover:text-white transition-colors"
          title="Editar saldo reservado"
        >
          {privacyFormat(monto || 0, isPrivacyModeEnabled)}
        </button>
      )}
      <div className="text-xs text-slate-500 mt-1">Toca para editar</div>
    </div>
  )
}

export function TilesTarjeta({ banco, porPagar, porCobrar, reservado, onGuardarReserva }) {
  const gastoNeto = porPagar - porCobrar
  const faltaSobra = reservado - porPagar

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
      <Card
        label="Por pagar"
        rawValue={porPagar}
        color="text-slate-200"
        sub="Cargos no pagados"
      />
      <Card
        label="Por cobrar"
        rawValue={porCobrar}
        color="text-sky-400"
        sub="Te lo deben"
      />
      <Card
        label="Gasto mío neto"
        rawValue={gastoNeto}
        color="text-slate-200"
        sub="Por pagar − por cobrar"
      />
      <CardReservado banco={banco} monto={reservado} onGuardar={onGuardarReserva} />
      <Card
        label={faltaSobra >= 0 ? 'Sobra' : 'Falta'}
        rawValue={Math.abs(faltaSobra)}
        color={faltaSobra >= 0 ? 'text-emerald-400' : 'text-red-400'}
        sub="Reservado − por pagar"
      />
    </div>
  )
}
