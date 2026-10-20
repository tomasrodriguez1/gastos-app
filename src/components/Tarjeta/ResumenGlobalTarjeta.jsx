import { useState } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatCLP } from '../../utils/formatters'
import { formatMontoTarjeta } from './formato'

function porcentaje(parte, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round((parte / total) * 100)))
}

function ControlesFondoClp({ saldo, onAportar, onAjustarSaldo }) {
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
    if (modo === 'aporte' && numero <= 0) { setError('El aporte debe ser positivo'); return }
    setGuardando(true)
    try {
      if (modo === 'aporte') await onAportar('CLP', numero, nota)
      else await onAjustarSaldo('CLP', numero)
      setModo(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-950/25 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600">Administrar fondo</div>
          <p className="mt-1 text-[11px] text-slate-600">Aportes y correcciones se registran siempre en CLP.</p>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => abrir('aporte')} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 active:translate-y-px">+ Aportar</button>
          <button type="button" onClick={() => abrir('saldo')} title="Corregir saldo CLP" className="rounded-md border border-slate-600/50 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200">✎</button>
        </div>
      </div>
      {modo && (
        <form onSubmit={confirmar} className="mt-3 space-y-2 border-t border-slate-700/40 pt-3">
          <label className="block text-[10px] uppercase tracking-wider text-slate-500">{modo === 'aporte' ? 'Nuevo aporte en CLP' : 'Saldo real en CLP'}</label>
          <input type="number" step="1" autoFocus value={valor} onChange={event => setValor(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setModo(null) }} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-right font-mono-numbers text-sm text-slate-200 outline-none focus:border-emerald-500" />
          {modo === 'aporte' && <input type="text" value={nota} maxLength={200} onChange={event => setNota(event.target.value)} placeholder="Nota (opcional)" className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500" />}
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

function BancoCard({ banco, clp, usd, deudaPesos, totalGlobal }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const oculto = valor => (isPrivacyModeEnabled ? '••••••' : valor)
  const total = deudaPesos.total || 0
  const facturado = deudaPesos.facturado || 0
  const noFacturado = Math.max(0, total - facturado)
  const movimientos = (clp.movimientos || 0) + (usd.movimientos || 0)

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700/40 bg-slate-900/20 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-200">{banco}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{movimientos} movimientos pendientes</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-600">{deudaPesos.parcial ? 'Total parcial' : 'Total estimado'}</div>
          <div className="mt-1 font-mono-numbers text-lg font-bold text-slate-200">{oculto(formatCLP(total))}</div>
          {totalGlobal > 0 && !deudaPesos.parcial && <div className="text-[11px] text-slate-600">{porcentaje(total, totalGlobal)}% de la deuda global</div>}
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-700/30 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-600">Deuda CLP</div>
          <div className="mt-1 font-mono-numbers text-xl font-bold text-sky-300">{oculto(formatMontoTarjeta(clp.por_pagar, 'CLP'))}</div>
          <div className="mt-1 text-xs text-slate-500">{clp.movimientos || 0} movimientos</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-600">Deuda USD</div>
          <div className="mt-1 font-mono-numbers text-xl font-bold text-violet-300">{oculto(formatMontoTarjeta(usd.por_pagar, 'USD'))}</div>
          <div className="mt-1 text-xs text-slate-500">{usd.movimientos || 0} movimientos</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-slate-700/40 px-4 py-3 text-xs sm:px-5">
        <div><div className="text-slate-600">Facturado</div><div className="mt-0.5 font-mono-numbers text-slate-300">{oculto(formatCLP(facturado))}</div></div>
        <div><div className="text-slate-600">No facturado</div><div className="mt-0.5 font-mono-numbers text-slate-300">{oculto(formatCLP(noFacturado))}</div></div>
        <div><div className="text-slate-600">Equivalencia</div><div className="mt-0.5 text-slate-400">CLP + USD</div></div>
      </div>
    </article>
  )
}

export function ResumenGlobalTarjeta({ deuda, totales, porBanco, tipoCambio, onTipoCambio, fondoSaldos, onAportar, onAjustarSaldo }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const clp = totales?.CLP || {}
  const usd = totales?.USD || {}
  const fondoDisponible = Math.round(Number(fondoSaldos?.CLP) || 0)
  const deudaClp = deuda.clp || 0
  const deudaUsdClp = (deuda.usdPropioClp || 0) + (deuda.usdTasaClp || 0)
  const saldoDespues = fondoDisponible - (deuda.total || 0)
  const oculto = valor => (isPrivacyModeEnabled ? '••••••' : valor)
  const mostrarTasa = deuda.pideTipoCambio || usd.por_pagar > 0
  const baseBarra = Math.max(fondoDisponible, deuda.total || 0, 1)
  const anchoClp = Math.min(100, Math.max(0, (deudaClp / baseBarra) * 100))
  const anchoUsd = Math.min(100 - anchoClp, Math.max(0, (deudaUsdClp / baseBarra) * 100))

  let estadoCobertura
  if (deuda.parcial) estadoCobertura = <span className="text-amber-400">El total es parcial: faltan movimientos USD por convertir.</span>
  else if (deuda.total === 0) estadoCobertura = <span className="text-slate-500">No hay deuda pendiente: todo el fondo está libre.</span>
  else if (saldoDespues >= 0) estadoCobertura = <span className="text-emerald-400">Después de pagar pesos y comprar los USD, quedan {oculto(formatCLP(saldoDespues))} libres.</span>
  else estadoCobertura = <span className="text-rose-400">Faltan {oculto(formatCLP(Math.abs(saldoDespues)))} para cubrir toda la deuda.</span>

  return (
    <div className="space-y-3">
      <section className="grid overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]" aria-labelledby="deuda-global-title">
        <div className="p-4 sm:p-5">
          <div id="deuda-global-title" className="text-xs uppercase tracking-wider text-slate-500">Deuda global estimada</div>
          <div className="mt-1 font-mono-numbers text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">{oculto(formatCLP(deuda.total || 0))}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <strong className="font-mono-numbers text-sky-300">{oculto(formatMontoTarjeta(clp.por_pagar || 0, 'CLP'))}</strong>
            <span>+</span>
            <strong className="font-mono-numbers text-violet-300">{oculto(formatMontoTarjeta(usd.por_pagar || 0, 'USD'))}</strong>
            <span>convertidos para planificar</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-700/40 bg-slate-950/25 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Deuda en CLP</div>
              <div className="mt-1 font-mono-numbers text-lg font-bold text-sky-300">{oculto(formatMontoTarjeta(clp.por_pagar || 0, 'CLP'))}</div>
              <div className="mt-1 text-xs text-slate-500">{clp.movimientos || 0} movimientos</div>
            </div>
            <div className="rounded-lg border border-slate-700/40 bg-slate-950/25 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Deuda en USD</div>
              <div className="mt-1 font-mono-numbers text-lg font-bold text-violet-300">{oculto(formatMontoTarjeta(usd.por_pagar || 0, 'USD'))}</div>
              <div className="mt-1 text-xs text-slate-500">{usd.movimientos || 0} movimientos</div>
            </div>
          </div>
          {deuda.parcial && <p className="mt-3 text-xs text-amber-400">{deuda.sinConvertir} movimientos ({oculto(formatMontoTarjeta(deuda.sinConvertirUsd, 'USD'))}) todavía no tienen tipo de cambio.</p>}
        </div>

        <div className="border-t border-slate-700/50 bg-slate-900/20 p-4 sm:p-5 lg:border-t-0 lg:border-l">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Fondo disponible</div>
              <div className="mt-1 font-mono-numbers text-2xl font-bold text-emerald-400">{oculto(formatCLP(fondoDisponible))}</div>
              <p className="mt-1 text-[11px] text-slate-600">Un único saldo CLP para ambas monedas</p>
            </div>
            {mostrarTasa && (
              <label className="grid gap-1 text-[10px] uppercase tracking-wider text-slate-600">
                CLP por USD
                <input type="number" min="0" step="0.01" inputMode="decimal" value={isPrivacyModeEnabled ? '' : tipoCambio} onChange={event => onTipoCambio(event.target.value)} placeholder={isPrivacyModeEnabled ? '••••' : '950'} className="w-28 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-right font-mono-numbers text-sm normal-case tracking-normal text-slate-200 outline-none focus:border-sky-500" />
              </label>
            )}
          </div>
          <div className="mt-3 text-xs">{estadoCobertura}</div>

          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/25 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Destino del fondo</div>
              <div className="text-[10px] text-slate-600">Deuda total {oculto(formatCLP(deuda.total || 0))}</div>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
              <span className="bg-sky-400/80" style={{ width: `${anchoClp}%` }} />
              <span className="bg-violet-400/80" style={{ width: `${anchoUsd}%` }} />
            </div>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-full bg-sky-400" />Deuda en CLP</span>
                <strong className="font-mono-numbers font-medium text-slate-300">{oculto(formatCLP(deudaClp))}</strong>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-500"><span className="mt-1 h-2 w-2 rounded-full bg-violet-400" />USD por comprar</span>
                <div className="text-right">
                  <strong className="block font-mono-numbers font-medium text-violet-300">{oculto(formatMontoTarjeta(usd.por_pagar || 0, 'USD'))}</strong>
                  <span className="font-mono-numbers text-[11px] text-slate-600">{deuda.parcial ? 'Conversión pendiente' : `≈ ${oculto(formatCLP(deudaUsdClp))}`}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-700/50 pt-2.5">
                <span className="font-medium text-slate-400">Saldo después de pagar</span>
                <strong className={`font-mono-numbers text-sm ${saldoDespues < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{deuda.parcial ? 'Por definir' : oculto(formatCLP(saldoDespues))}</strong>
              </div>
            </div>
          </div>

          <div className="mt-2">
            <ControlesFondoClp saldo={fondoDisponible} onAportar={onAportar} onAjustarSaldo={onAjustarSaldo} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2" aria-label="Resumen por banco">
        {porBanco.map(item => <BancoCard key={item.banco} {...item} totalGlobal={deuda.total || 0} />)}
      </section>
    </div>
  )
}
