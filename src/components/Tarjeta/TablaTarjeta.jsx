import { useMemo, useState } from 'react'
import { getGastoId } from '../../utils/gastosIds'
import { formatCLP, formatFecha } from '../../utils/formatters'

function formatMonto(valor, moneda) {
  return moneda === 'USD'
    ? `USD ${(valor || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : formatCLP(valor || 0)
}

function montoGasto(gasto, moneda) {
  return moneda === 'USD' ? gasto.usd || 0 : gasto.monto || 0
}

function Toggle({ activo, onClick, activoLabel, inactivoLabel, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
        activo
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-slate-600/50 bg-slate-700/30 text-slate-500'
      }`}
    >
      {activo ? activoLabel : inactivoLabel}
    </button>
  )
}

export function TablaTarjeta({ gastos, moneda, onActualizarGasto, onConciliar, onDesconciliar, onPagar }) {
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [totalOperacion, setTotalOperacion] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [valorSplit, setValorSplit] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  const seleccion = useMemo(() => gastos.filter((gasto, indice) => seleccionados.has(getGastoId(gasto, indice))), [gastos, seleccionados])
  const idsSeleccionados = seleccion.map(gasto => gasto.id)
  const todosSinConciliar = seleccion.length > 0 && seleccion.every(gasto => !gasto.conciliado)
  const todosConciliados = seleccion.length > 0 && seleccion.every(gasto => gasto.conciliado)
  const totalSeleccionado = seleccion.reduce((suma, gasto) => suma + montoGasto(gasto, moneda), 0)
  const todosMarcados = gastos.length > 0 && seleccionados.size === gastos.length

  function toggleSeleccion(id) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setError('')
  }

  function toggleTodos() {
    setSeleccionados(todosMarcados ? new Set() : new Set(gastos.map((gasto, indice) => getGastoId(gasto, indice))))
    setError('')
  }

  async function ejecutar(tipo) {
    if ((tipo === 'conciliar' || tipo === 'pagar') && totalOperacion.trim() === '') {
      setError('Ingresá el total del estado o pago.')
      return
    }
    setProcesando(true)
    setError('')
    try {
      if (tipo === 'conciliar') await onConciliar(idsSeleccionados, Number(totalOperacion))
      if (tipo === 'desconciliar') await onDesconciliar(idsSeleccionados)
      if (tipo === 'pagar') await onPagar(idsSeleccionados, Number(totalOperacion))
      setSeleccionados(new Set())
      setTotalOperacion('')
    } catch (e) {
      const detalle = e.detalle
      const diferencia = detalle?.diferencia != null ? ` Diferencia: ${formatMonto(detalle.diferencia, moneda)}.` : ''
      setError(`${e.message}${diferencia}`)
    } finally {
      setProcesando(false)
    }
  }

  function empezarSplit(gasto, id) {
    setEditandoId(id)
    setValorSplit(String(gasto.split || 0))
  }

  async function confirmarSplit(id) {
    const valor = Number(valorSplit)
    if (!Number.isNaN(valor)) await onActualizarGasto(id, { split: valor })
    setEditandoId(null)
  }

  if (gastos.length === 0) {
    return <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-12 text-center text-slate-500">No hay gastos por pagar para esta tarjeta y moneda.</div>
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50">
      <div className="border-b border-slate-700/50 bg-slate-900/30 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Total estado / pago</label>
            <input
              type="number"
              step={moneda === 'USD' ? '0.01' : '1'}
              value={totalOperacion}
              onChange={event => setTotalOperacion(event.target.value)}
              placeholder={String(totalSeleccionado)}
              className="w-44 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-right font-mono-numbers text-sm text-slate-200 outline-none focus:border-sky-500"
            />
          </div>
          <button disabled={!todosSinConciliar || procesando} onClick={() => ejecutar('conciliar')} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-400 disabled:cursor-not-allowed disabled:opacity-30">Conciliar estado</button>
          <button disabled={!todosConciliados || procesando} onClick={() => ejecutar('pagar')} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30">Registrar pago</button>
          <button disabled={!todosConciliados || procesando} onClick={() => ejecutar('desconciliar')} className="rounded-lg border border-slate-600/50 px-3 py-2 text-xs text-slate-400 disabled:cursor-not-allowed disabled:opacity-30">Desconciliar</button>
          <div className="ml-auto text-right text-xs text-slate-500">
            <div>{seleccion.length} seleccionados</div>
            <div className="font-mono-numbers text-slate-300">{formatMonto(totalSeleccionado, moneda)}</div>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="w-10 px-3 py-3"><input type="checkbox" checked={todosMarcados} onChange={toggleTodos} /></th>
              <th className="w-16 px-3 py-3 text-left">Fecha</th>
              <th className="min-w-48 px-3 py-3 text-left">Motivo</th>
              <th className="w-28 px-3 py-3 text-right">Monto</th>
              <th className="w-28 px-3 py-3 text-right">Por cobrar</th>
              <th className="w-28 px-3 py-3 text-center">Fondo</th>
              <th className="w-28 px-3 py-3 text-center">Budget</th>
              <th className="w-24 px-3 py-3 text-center">Conciliación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {gastos.map((gasto, indice) => {
              const id = getGastoId(gasto, indice)
              return (
                <tr key={id} className={seleccionados.has(id) ? 'bg-sky-500/[0.04]' : 'hover:bg-white/[0.02]'}>
                  <td className="px-3 py-2.5 text-center"><input type="checkbox" checked={seleccionados.has(id)} onChange={() => toggleSeleccion(id)} /></td>
                  <td className="px-3 py-2.5 font-mono-numbers text-xs text-slate-500">{formatFecha(gasto.fecha)}</td>
                  <td className="max-w-xs px-3 py-2.5 text-slate-300"><div className="truncate" title={gasto.motivo}>{gasto.motivo}</div></td>
                  <td className="px-3 py-2.5 text-right font-mono-numbers font-medium text-slate-200">{formatMonto(montoGasto(gasto, moneda), moneda)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {moneda === 'USD' ? <span className="text-slate-700">—</span> : editandoId === id ? (
                      <input type="number" autoFocus value={valorSplit} onChange={event => setValorSplit(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') confirmarSplit(id); if (event.key === 'Escape') setEditandoId(null) }} onBlur={() => confirmarSplit(id)} className="w-24 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-right font-mono-numbers text-slate-200" />
                    ) : (
                      <button onClick={() => empezarSplit(gasto, id)} className="font-mono-numbers text-sky-400 hover:text-sky-300">{formatCLP(gasto.split || 0)}</button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center"><Toggle activo={gasto.plata_en_cuenta} onClick={() => onActualizarGasto(id, { plata_en_cuenta: !gasto.plata_en_cuenta })} activoLabel="Reservado" inactivoLabel="Falta" title="El importe completo está reservado" /></td>
                  <td className="px-3 py-2.5 text-center"><Toggle activo={gasto.en_presupuesto !== false} onClick={() => onActualizarGasto(id, { en_presupuesto: gasto.en_presupuesto === false })} activoLabel="Incluido" inactivoLabel="Fuera" title="Impacta el presupuesto" /></td>
                  <td className="px-3 py-2.5 text-center">{gasto.conciliado ? <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-400">Conciliado</span> : <span className="text-[11px] text-amber-500/70">Pendiente</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
