import { useState } from 'react'

const TITULOS = { aporte: 'Nuevo aporte en CLP', retiro: 'Monto a retirar en CLP', saldo: 'Saldo real en CLP' }

// Aportar, retirar y corregir el fondo TC. Mismo componente en /tarjeta y /fondos.
export function ControlesFondo({ saldo, onAportar, onRetirar, onAjustarSaldo }) {
  const [modo, setModo] = useState(null)
  const [valor, setValor] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function abrir(nuevoModo) {
    setModo(nuevoModo)
    setValor(nuevoModo === 'saldo' ? String(saldo || 0) : '')
    setNota('')
    setError('')
  }

  async function confirmar(event) {
    event.preventDefault()
    const numero = Number(valor)
    if (valor.trim() === '' || Number.isNaN(numero)) { setError('Ingresá un monto'); return }
    if (modo !== 'saldo' && numero <= 0) { setError('El monto debe ser positivo'); return }
    if (modo === 'retiro' && numero > (saldo || 0)) { setError('El retiro supera el saldo del fondo'); return }
    setGuardando(true)
    try {
      if (modo === 'aporte') await onAportar('CLP', numero, nota)
      else if (modo === 'retiro') await onRetirar('CLP', numero, nota)
      else await onAjustarSaldo('CLP', numero)
      setModo(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-950/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Administrar fondo</div>
          <p className="mt-1 text-sm text-slate-500">Aportes, retiros y correcciones se registran siempre en CLP.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => abrir('aporte')} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 active:translate-y-px">+ Aportar</button>
          {onRetirar && <button type="button" onClick={() => abrir('retiro')} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/20 active:translate-y-px">− Retirar</button>}
          <button type="button" onClick={() => abrir('saldo')} title="Corregir saldo CLP" className="rounded-lg border border-slate-600/50 px-3 py-2 text-sm text-slate-400 hover:text-slate-200">✎</button>
        </div>
      </div>
      {modo && (
        <form onSubmit={confirmar} className="mt-3 space-y-2 border-t border-slate-700/40 pt-3">
          <label className="block text-[10px] uppercase tracking-wider text-slate-500">{TITULOS[modo]}</label>
          <input type="number" step="1" autoFocus value={valor} onChange={event => setValor(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setModo(null) }} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-right font-mono-numbers text-sm text-slate-200 outline-none focus:border-emerald-500" />
          {modo !== 'saldo' && <input type="text" value={nota} maxLength={200} onChange={event => setNota(event.target.value)} placeholder={modo === 'retiro' ? 'Para qué se retira (opcional)' : 'Nota (opcional)'} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500" />}
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={guardando} className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-400 disabled:opacity-40">Guardar</button>
            <button type="button" onClick={() => setModo(null)} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  )
}
