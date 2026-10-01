import { useState } from 'react'
import { useCountUp } from '../../hooks/useCountUp'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatMontoTarjeta } from './formato'

function Monto({ valor, moneda, className = '' }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  return <span className={`font-mono-numbers ${className}`}>{isPrivacyModeEnabled ? '••••••' : formatMontoTarjeta(valor, moneda)}</span>
}

function Card({ label, value, moneda, color = 'text-slate-200', children, accion }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const animatedValue = useCountUp(value || 0)
  // useCountUp redondea a entero: en USD se pierden los centavos.
  const mostrado = moneda === 'USD' ? value : animatedValue
  return (
    <div className="flex flex-col rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
        {accion}
      </div>
      <div className={`font-mono-numbers text-xl font-bold sm:text-2xl ${color}`}>
        {isPrivacyModeEnabled ? '••••••' : formatMontoTarjeta(mostrado, moneda)}
      </div>
      {children && <div className="mt-1 space-y-0.5 text-xs text-slate-500">{children}</div>}
    </div>
  )
}

function FondoCard({ saldo, moneda, onAportar, onAjustarSaldo }) {
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
      if (modo === 'aporte') await onAportar(moneda, numero, nota)
      else await onAjustarSaldo(moneda, numero)
      setModo(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const acciones = (
    <div className="flex gap-1">
      <button type="button" onClick={() => abrir('aporte')} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20">+ Aportar</button>
      <button type="button" onClick={() => abrir('saldo')} title="Corregir saldo" className="rounded-md border border-slate-600/50 px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-slate-200">✎</button>
    </div>
  )

  return (
    <Card label="Fondo aportado" value={saldo} moneda={moneda} color={saldo < 0 ? 'text-rose-400' : 'text-emerald-400'} accion={acciones}>
      {modo ? (
        <form onSubmit={confirmar} className="mt-2 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{modo === 'aporte' ? `Nuevo aporte ${moneda}` : `Saldo real hoy ${moneda}`}</div>
          <input
            type="number"
            step={moneda === 'USD' ? '0.01' : '1'}
            autoFocus
            value={valor}
            onChange={event => setValor(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') setModo(null) }}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-right font-mono-numbers text-sm text-slate-200 outline-none focus:border-emerald-500"
          />
          {modo === 'aporte' && (
            <input
              type="text"
              value={nota}
              maxLength={200}
              onChange={event => setNota(event.target.value)}
              placeholder="Nota (opcional)"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-emerald-500"
            />
          )}
          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={guardando} className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-400 disabled:opacity-40">Guardar</button>
            <button type="button" onClick={() => setModo(null)} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">Cancelar</button>
          </div>
        </form>
      ) : (
        <div>Fondo común · todas las tarjetas</div>
      )}
    </Card>
  )
}

function porcentaje(parte, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, (parte / total) * 100))
}

function CoberturaFondo({ global, saldo, moneda }) {
  const facturado = global.monto_facturado || 0
  const total = global.por_pagar || 0
  const escala = Math.max(total, saldo, 1)
  const faltaFacturado = facturado - saldo
  const faltaTotal = total - saldo

  let estado
  if (total === 0) estado = <span className="text-slate-500">Sin deuda pendiente en {moneda}.</span>
  else if (faltaTotal <= 0) estado = <span className="text-emerald-400">El fondo cubre toda la deuda pendiente.</span>
  else if (faltaFacturado <= 0) estado = <span className="text-emerald-400">El fondo cubre lo ya facturado · faltan <Monto valor={faltaTotal} moneda={moneda} /> para lo no facturado.</span>
  else estado = <span className="text-rose-400">Faltan <Monto valor={faltaFacturado} moneda={moneda} /> para cubrir lo ya facturado.</span>

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="uppercase tracking-wider text-slate-500">Cobertura · todas las tarjetas</span>
        {estado}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">Deuda</span>
          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-slate-900/60">
            <div className="h-full bg-violet-500/70" style={{ width: `${porcentaje(facturado, escala)}%` }} title="Ya facturado" />
            <div className="h-full bg-amber-500/50" style={{ width: `${porcentaje(total - facturado, escala)}%` }} title="No facturado" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">Fondo</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-900/60">
            <div className="h-full bg-emerald-500/70" style={{ width: `${porcentaje(saldo, escala)}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500/70" />Facturado</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500/50" />No facturado</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500/70" />Fondo aportado</span>
      </div>
    </div>
  )
}

function DesgloseBancos({ filas, total, moneda }) {
  const columnas = [
    { key: 'monto_facturado', label: 'Facturado', color: 'text-violet-400' },
    { key: 'monto_no_facturado', label: 'No facturado', color: 'text-amber-400' },
    { key: 'por_pagar', label: 'Total', color: 'text-slate-200' },
    ...(moneda === 'CLP' ? [{ key: 'por_cobrar', label: 'Por cobrar', color: 'text-sky-400' }] : []),
  ]
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/50 scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5 text-left">Tarjeta</th>
            {columnas.map(col => <th key={col.key} className="px-4 py-2.5 text-right">{col.label}</th>)}
            <th className="px-4 py-2.5 text-right">Movs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {filas.map(({ banco, metricas }) => (
            <tr key={banco}>
              <td className="px-4 py-2 text-slate-300">{banco}</td>
              {columnas.map(col => <td key={col.key} className="px-4 py-2 text-right"><Monto valor={metricas[col.key]} moneda={moneda} className={col.color} /></td>)}
              <td className="px-4 py-2 text-right font-mono-numbers text-xs text-slate-500">{metricas.conciliados + metricas.sin_conciliar}</td>
            </tr>
          ))}
          <tr className="bg-slate-900/30 font-semibold">
            <td className="px-4 py-2 text-slate-300">Total</td>
            {columnas.map(col => <td key={col.key} className="px-4 py-2 text-right"><Monto valor={total[col.key]} moneda={moneda} className={col.color} /></td>)}
            <td className="px-4 py-2 text-right font-mono-numbers text-xs text-slate-500">{total.conciliados + total.sin_conciliar}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function TilesTarjeta({ moneda, etiquetaSeleccion, metricas, global, porBanco, saldoFondo, onAportar, onAjustarSaldo }) {
  const movimientos = metricas.conciliados + metricas.sin_conciliar
  const faltaAportar = (global.por_pagar || 0) - saldoFondo
  const conCiclo = metricas.facturados + metricas.no_facturados > 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Gasto total" value={metricas.por_pagar} moneda={moneda}>
          <div>{etiquetaSeleccion} · {movimientos} movimientos por pagar</div>
          {moneda === 'CLP' && metricas.por_cobrar > 0 && (
            <div>Por cobrar <Monto valor={metricas.por_cobrar} moneda={moneda} className="text-sky-400" /> · propio <Monto valor={metricas.gasto_propio_neto} moneda={moneda} className="text-slate-300" /></div>
          )}
        </Card>
        <Card label="Ya facturado" value={metricas.monto_facturado} moneda={moneda} color="text-violet-400">
          {conCiclo ? (
            <>
              <div>{metricas.facturados} movs · corte pasado</div>
              <div>No facturado <Monto valor={metricas.monto_no_facturado} moneda={moneda} className="text-amber-400" /> · {metricas.no_facturados} movs</div>
            </>
          ) : <div>Configurá el día de cierre para separar lo facturado.</div>}
        </Card>
        <FondoCard saldo={saldoFondo} moneda={moneda} onAportar={onAportar} onAjustarSaldo={onAjustarSaldo} />
        <Card label={faltaAportar > 0 ? 'Falta aportar' : 'Sobra en el fondo'} value={Math.abs(faltaAportar)} moneda={moneda} color={faltaAportar > 0 ? 'text-rose-400' : 'text-emerald-400'}>
          <div>Deuda total de todas las tarjetas − fondo</div>
        </Card>
      </div>

      <CoberturaFondo global={global} saldo={saldoFondo} moneda={moneda} />

      {porBanco.length > 1 && <DesgloseBancos filas={porBanco} total={metricas} moneda={moneda} />}
    </div>
  )
}
