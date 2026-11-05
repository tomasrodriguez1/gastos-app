import { useState } from 'react'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { formatFecha } from '../../utils/formatters'
import { hoyLocalISO } from '../../utils/vencimientosTarjeta'
import { formatMontoTarjeta } from './formato'

const MONEDAS = ['CLP', 'USD']
const VISIBLES = 5
const ETIQUETAS = { abono: 'Abono', aplicacion: 'Aplicado' }

function Opciones({ opciones, valor, onChange, ariaLabel }) {
  return (
    <div className="flex rounded-lg border border-slate-700 bg-slate-900/70 p-1" role="group" aria-label={ariaLabel}>
      {opciones.map(opcion => (
        <button
          type="button"
          key={opcion}
          onClick={() => onChange(opcion)}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors active:translate-y-px ${valor === opcion ? 'bg-sky-500/15 text-sky-300' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {opcion}
        </button>
      ))}
    </div>
  )
}

// Abonos depositados directo en la tarjeta (ej. 170 USD en el banco). Bajan la deuda de ese banco y
// moneda sin elegir movimientos; después se aplican a los movimientos con "Con abonos".
export function AbonosTarjeta({ bancos, abonos, onAbonar, onEliminar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const oculto = valor => (isPrivacyModeEnabled ? '••••••' : valor)
  const [banco, setBanco] = useState(bancos[0])
  const [moneda, setMoneda] = useState('USD')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(() => hoyLocalISO())
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [verTodos, setVerTodos] = useState(false)

  const movimientos = abonos?.movimientos || []
  const visibles = verTodos ? movimientos : movimientos.slice(0, VISIBLES)
  const saldosConValor = bancos.flatMap(b => MONEDAS.map(m => ({ banco: b, moneda: m, saldo: Number(abonos?.saldos?.[b]?.[m]) || 0 }))).filter(item => item.saldo > 0)

  async function guardar(event) {
    event.preventDefault()
    const numero = Number(monto)
    if (monto.trim() === '' || !Number.isFinite(numero) || numero <= 0) { setError('Ingresá un monto positivo'); return }
    setGuardando(true)
    setError('')
    try {
      await onAbonar(banco, moneda, numero, nota, fecha)
      setMonto('')
      setNota('')
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(mov) {
    if (!window.confirm(`¿Borrar el abono de ${formatMontoTarjeta(mov.monto, mov.moneda)} en ${mov.banco}?`)) return
    setError('')
    try {
      await onEliminar(mov.id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50" aria-labelledby="abonos-tarjeta-title">
      <div className="border-b border-slate-700/50 bg-slate-900/20 p-4 sm:p-5">
        <h2 id="abonos-tarjeta-title" className="text-sm font-semibold text-slate-200">Abonos a la tarjeta</h2>
        <p className="mt-1 text-xs text-slate-500">Plata que ya depositaste en la tarjeta, en pesos o dólares. Baja la deuda de ese banco y moneda sin tocar el fondo.</p>
        {saldosConValor.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {saldosConValor.map(item => (
              <span key={`${item.banco}-${item.moneda}`} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                {item.banco} · <strong className="font-mono-numbers">{oculto(formatMontoTarjeta(item.saldo, item.moneda))}</strong> sin aplicar
              </span>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={guardar} className="flex flex-wrap items-end gap-3 border-b border-slate-700/50 p-4 sm:p-5">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Tarjeta</div>
          <Opciones opciones={bancos} valor={banco} onChange={setBanco} ariaLabel="Tarjeta del abono" />
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Moneda</div>
          <Opciones opciones={MONEDAS} valor={moneda} onChange={setMoneda} ariaLabel="Moneda del abono" />
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">Monto abonado</span>
          <input type="number" min="0" step={moneda === 'USD' ? '0.01' : '1'} inputMode="decimal" value={monto} onChange={event => setMonto(event.target.value)} placeholder={moneda === 'USD' ? '170' : '50000'} className="w-40 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-right font-mono-numbers text-base text-slate-100 outline-none focus:border-sky-500" />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">Fecha</span>
          <input type="date" value={fecha} max={hoyLocalISO()} onChange={event => setFecha(event.target.value)} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
        </label>
        <label className="block min-w-40 flex-1">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">Nota (opcional)</span>
          <input type="text" maxLength={200} value={nota} onChange={event => setNota(event.target.value)} placeholder="Depósito en el banco" className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
        </label>
        <button type="submit" disabled={guardando} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30">Registrar abono</button>
      </form>

      {error && <p className="border-b border-slate-700/40 px-4 py-3 text-xs text-rose-400">{error}</p>}

      {movimientos.length > 0 && (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="w-24 px-4 py-3 text-left">Fecha</th>
                <th className="w-24 px-4 py-3 text-left">Tipo</th>
                <th className="w-24 px-4 py-3 text-left">Tarjeta</th>
                <th className="w-20 px-4 py-3 text-center">Moneda</th>
                <th className="px-4 py-3 text-left">Detalle</th>
                <th className="w-36 px-4 py-3 text-right">Monto</th>
                <th className="w-14 px-4 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {visibles.map(mov => (
                <tr key={mov.id} className="group hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono-numbers text-xs text-slate-500">{formatFecha(mov.fecha)}</td>
                  <td className={`px-4 py-3 ${mov.tipo === 'abono' ? 'text-emerald-400' : 'text-amber-400'}`}>{ETIQUETAS[mov.tipo]}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{mov.banco}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-md bg-slate-700/40 px-2 py-1 font-mono-numbers text-[10px] font-semibold ${mov.moneda === 'USD' ? 'text-violet-300' : 'text-sky-300'}`}>{mov.moneda}</span></td>
                  <td className="px-4 py-3 text-slate-400">{mov.nota || 'Sin nota'}</td>
                  <td className={`px-4 py-3 text-right font-mono-numbers font-medium ${mov.monto < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{oculto(`${mov.monto > 0 ? '+' : ''}${formatMontoTarjeta(mov.monto, mov.moneda)}`)}</td>
                  <td className="px-4 py-3 text-right">{mov.tipo === 'abono' && <button type="button" onClick={() => eliminar(mov)} title="Borrar abono" className="text-slate-600 transition-colors hover:text-rose-400 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100">×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {movimientos.length > VISIBLES && (
        <div className="border-t border-slate-700/40 px-4 py-3">
          <button type="button" onClick={() => setVerTodos(!verTodos)} className="text-[11px] text-slate-500 hover:text-slate-300">{verTodos ? 'Ver menos' : `Ver ${movimientos.length - VISIBLES} más`}</button>
        </div>
      )}
    </section>
  )
}
