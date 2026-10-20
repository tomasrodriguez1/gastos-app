import { useMemo, useState } from 'react'
import { getGastoId } from '../../utils/gastosIds'
import { formatCLP, formatFecha } from '../../utils/formatters'
import { EditarAsignacion } from '../Gastos/EditarAsignacion'
import { formatMontoTarjeta as formatMonto } from './formato'

const BANCOS = ['Edwards', 'BICE']
const MONEDAS = ['CLP', 'USD']
const ESTADOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'facturado', label: 'Facturado' },
  { value: 'no_facturado', label: 'No facturado' },
]

function monedaGasto(gasto) {
  return Number(gasto.usd) > 0 && !Number(gasto.monto) ? 'USD' : 'CLP'
}

function montoGasto(gasto) {
  return monedaGasto(gasto) === 'USD' ? Number(gasto.usd) || 0 : Number(gasto.monto) || 0
}

function equivalenteClp(gasto, tipoCambio) {
  if (monedaGasto(gasto) === 'CLP') return Math.round(Number(gasto.monto) || 0)
  const propio = Number(gasto.monto_clp_manual)
  if (propio > 0) return Math.round(propio)
  const tasa = Number(tipoCambio)
  if (tasa > 0) return Math.round((Number(gasto.usd) || 0) * tasa)
  return null
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

function Segmento({ opciones, valor, onChange, ariaLabel }) {
  return (
    <div className="flex rounded-lg border border-slate-700 bg-slate-900/70 p-0.5" role="group" aria-label={ariaLabel}>
      {opciones.map(opcion => {
        const value = typeof opcion === 'string' ? opcion : opcion.value
        const label = typeof opcion === 'string' ? opcion : opcion.label
        return (
          <button
            type="button"
            key={value}
            onClick={() => onChange(value)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors active:translate-y-px ${valor === value ? 'bg-sky-500/15 text-sky-300' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function TablaTarjeta({ gastos, tipoCambio, onActualizarGasto, onPagar, catalogos, nombresFondos = [] }) {
  const [filtroBanco, setFiltroBanco] = useState('Todos')
  const [filtroMoneda, setFiltroMoneda] = useState('Todas')
  const [filtroFacturado, setFiltroFacturado] = useState('todos')
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [totalOperacion, setTotalOperacion] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [editando, setEditando] = useState(null)
  const [valorSplit, setValorSplit] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  const gastosFiltrados = useMemo(() => gastos.filter(gasto => {
    if (filtroBanco !== 'Todos' && gasto.banco !== filtroBanco) return false
    if (filtroMoneda !== 'Todas' && monedaGasto(gasto) !== filtroMoneda) return false
    if (filtroFacturado === 'facturado' && gasto.facturado !== true) return false
    if (filtroFacturado === 'no_facturado' && gasto.facturado !== false) return false
    return true
  }), [gastos, filtroBanco, filtroMoneda, filtroFacturado])

  const seleccion = useMemo(() => gastos.filter((gasto, indice) => seleccionados.has(getGastoId(gasto, indice))), [gastos, seleccionados])
  const idsSeleccionados = seleccion.map(gasto => gasto.id)
  const bancosSeleccion = [...new Set(seleccion.map(gasto => gasto.banco))]
  const monedasSeleccion = [...new Set(seleccion.map(monedaGasto))]
  const bancoUnico = bancosSeleccion.length === 1 ? bancosSeleccion[0] : null
  const monedaUnica = monedasSeleccion.length === 1 ? monedasSeleccion[0] : null
  const totalSeleccionado = seleccion.reduce((suma, gasto) => suma + montoGasto(gasto), 0)
  const idsFiltrados = gastosFiltrados.map((gasto, indice) => getGastoId(gasto, indice))
  const todosMarcados = idsFiltrados.length > 0 && idsFiltrados.every(id => seleccionados.has(id))
  const puedeSeleccionarTodos = filtroBanco !== 'Todos' && filtroMoneda !== 'Todas'

  function cambiarFiltro(setter, valor) {
    setter(valor)
    setSeleccionados(new Set())
    setTotalOperacion('')
    setError('')
  }

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
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (todosMarcados) idsFiltrados.forEach(id => next.delete(id))
      else idsFiltrados.forEach(id => next.add(id))
      return next
    })
    setError('')
  }

  async function registrarPago() {
    if (totalOperacion.trim() === '') {
      setError('Ingresá el total pagado.')
      return
    }
    setProcesando(true)
    setError('')
    try {
      await onPagar(bancoUnico, monedaUnica, idsSeleccionados, Number(totalOperacion))
      setSeleccionados(new Set())
      setTotalOperacion('')
    } catch (e) {
      const detalle = e.detalle
      const diferencia = detalle?.diferencia != null ? ` Diferencia: ${formatMonto(detalle.diferencia, monedaUnica)}.` : ''
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

  function abrirEdicion(gasto, event) {
    if (event.target.closest('[data-accion]')) return
    setEditando(gasto)
  }

  function guardarEdicion(changes) {
    onActualizarGasto(getGastoId(editando), changes)
    setEditando(null)
  }

  if (gastos.length === 0) {
    return <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-12 text-center text-slate-500">No hay movimientos pendientes en las tarjetas.</div>
  }

  const seleccionInvalida = seleccion.length > 0 && (!bancoUnico || !monedaUnica)

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50" aria-labelledby="movimientos-tarjeta-title">
      <div className="border-b border-slate-700/50 bg-slate-900/30 p-4">
        <div className="mb-4">
          <h2 id="movimientos-tarjeta-title" className="text-sm font-semibold text-slate-200">Todos los movimientos pendientes</h2>
          <p className="mt-1 text-xs text-slate-500">Los filtros afectan solamente esta tabla. Los resúmenes superiores siempre muestran la deuda completa.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-600">Banco</div>
            <Segmento opciones={['Todos', ...BANCOS]} valor={filtroBanco} onChange={valor => cambiarFiltro(setFiltroBanco, valor)} ariaLabel="Filtrar por banco" />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-600">Moneda</div>
            <Segmento opciones={['Todas', ...MONEDAS]} valor={filtroMoneda} onChange={valor => cambiarFiltro(setFiltroMoneda, valor)} ariaLabel="Filtrar por moneda" />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-600">Estado</div>
            <Segmento opciones={ESTADOS} valor={filtroFacturado} onChange={valor => cambiarFiltro(setFiltroFacturado, valor)} ariaLabel="Filtrar por facturación" />
          </div>
          <div className="ml-auto text-right text-xs text-slate-500">
            <div>Resultado</div>
            <div className="font-mono-numbers font-semibold text-slate-300">{gastosFiltrados.length} movimientos</div>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-700/50 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Total pagado</label>
            <input
              type="number"
              step={monedaUnica === 'USD' ? '0.01' : '1'}
              value={totalOperacion}
              onChange={event => setTotalOperacion(event.target.value)}
              placeholder={String(totalSeleccionado)}
              disabled={!monedaUnica}
              className="w-44 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-right font-mono-numbers text-sm text-slate-200 outline-none focus:border-sky-500 disabled:opacity-40"
            />
          </div>
          <button disabled={seleccion.length === 0 || seleccionInvalida || procesando} onClick={registrarPago} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30">Registrar pago</button>
          <div className="ml-auto text-right text-xs text-slate-500">
            <div>{seleccion.length} seleccionados</div>
            <div className="font-mono-numbers text-slate-300">{monedaUnica ? formatMonto(totalSeleccionado, monedaUnica) : seleccion.length ? 'Banco y moneda únicos' : formatCLP(0)}</div>
          </div>
        </div>
        {seleccionInvalida && <p className="mt-3 text-xs text-amber-400">Seleccioná movimientos de un solo banco y una sola moneda para registrar el pago.</p>}
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1060px] text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="w-10 px-3 py-3"><input type="checkbox" checked={todosMarcados} disabled={!puedeSeleccionarTodos} onChange={toggleTodos} title={puedeSeleccionarTodos ? 'Seleccionar movimientos filtrados' : 'Elegí un banco y una moneda para seleccionar todos'} aria-label="Seleccionar movimientos filtrados" /></th>
              <th className="w-20 px-3 py-3 text-left">Fecha</th>
              <th className="w-24 px-3 py-3 text-left">Banco</th>
              <th className="w-20 px-3 py-3 text-center">Moneda</th>
              <th className="min-w-56 px-3 py-3 text-left">Motivo</th>
              <th className="w-28 px-3 py-3 text-right">Monto original</th>
              <th className="w-28 px-3 py-3 text-right">Equiv. CLP</th>
              <th className="w-28 px-3 py-3 text-right">Por cobrar</th>
              <th className="w-28 px-3 py-3 text-center">Budget</th>
              <th className="w-28 px-3 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {gastosFiltrados.map((gasto, indice) => {
              const id = getGastoId(gasto, indice)
              const moneda = monedaGasto(gasto)
              const equivalente = equivalenteClp(gasto, tipoCambio)
              return (
                <tr key={id} onClick={event => abrirEdicion(gasto, event)} className={`cursor-pointer ${seleccionados.has(id) ? 'bg-sky-500/[0.04]' : 'hover:bg-white/[0.02]'}`}>
                  <td data-accion className="px-3 py-2.5 text-center"><input type="checkbox" checked={seleccionados.has(id)} onChange={() => toggleSeleccion(id)} aria-label={`Seleccionar ${gasto.motivo}`} /></td>
                  <td className="px-3 py-2.5 font-mono-numbers text-xs text-slate-500">{formatFecha(gasto.fecha)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{gasto.banco}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`rounded-md bg-slate-700/40 px-2 py-1 font-mono-numbers text-[10px] font-semibold ${moneda === 'USD' ? 'text-violet-300' : 'text-sky-300'}`}>{moneda}</span></td>
                  <td className="max-w-sm px-3 py-2.5 text-slate-300"><div className="flex min-w-0 items-center gap-2"><div className="min-w-0 truncate" title={gasto.motivo}>{gasto.motivo}</div><span className="shrink-0 text-xs text-slate-600" aria-hidden title="Editar gasto">✎</span></div></td>
                  <td className={`px-3 py-2.5 text-right font-mono-numbers font-medium ${moneda === 'USD' ? 'text-violet-300' : 'text-slate-200'}`}>{formatMonto(montoGasto(gasto), moneda)}</td>
                  <td className="px-3 py-2.5 text-right font-mono-numbers text-slate-400">{equivalente == null ? <span className="text-amber-400">Sin TC</span> : formatCLP(equivalente)}</td>
                  <td data-accion className="px-3 py-2.5 text-right">
                    {moneda === 'USD' ? <span className="text-slate-700">—</span> : editandoId === id ? (
                      <input type="number" autoFocus value={valorSplit} onChange={event => setValorSplit(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') confirmarSplit(id); if (event.key === 'Escape') setEditandoId(null) }} onBlur={() => confirmarSplit(id)} className="w-24 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-right font-mono-numbers text-slate-200" />
                    ) : (
                      <button onClick={() => empezarSplit(gasto, id)} className="font-mono-numbers text-sky-400 hover:text-sky-300">{formatCLP(gasto.split || 0)}</button>
                    )}
                  </td>
                  <td data-accion className="px-3 py-2.5 text-center"><Toggle activo={gasto.en_presupuesto !== false} onClick={() => onActualizarGasto(id, { en_presupuesto: gasto.en_presupuesto === false })} activoLabel="Incluido" inactivoLabel="Fuera" title="Impacta el presupuesto" /></td>
                  <td className="px-3 py-2.5 text-center">
                    {gasto.facturado === true && <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-400">Facturado</span>}
                    {gasto.facturado === false && <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-400">No facturado</span>}
                    {gasto.facturado == null && <span className="text-slate-700">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {gastosFiltrados.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No hay movimientos para estos filtros.</div>}
      </div>

      {editando && <EditarAsignacion gasto={editando} onGuardar={guardarEdicion} onCerrar={() => setEditando(null)} catalogos={catalogos} nombresFondos={nombresFondos} />}
    </section>
  )
}
