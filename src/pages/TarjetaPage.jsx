import { useMemo, useState } from 'react'
import { TilesTarjeta } from '../components/Tarjeta/TilesTarjeta'
import { TablaTarjeta } from '../components/Tarjeta/TablaTarjeta'
import { formatCLP } from '../utils/formatters'

const BANCOS = ['Edwards', 'BICE']
const MONEDAS = ['CLP', 'USD']
const FILTROS_FACTURADO = [
  { value: 'todos', label: 'Todos' },
  { value: 'facturado', label: 'Facturado' },
  { value: 'no_facturado', label: 'No facturado' },
]
const VACIO = {
  por_pagar: 0,
  fondo_actual: 0,
  falta_depositar: 0,
  por_cobrar: 0,
  gasto_propio_neto: 0,
  conciliados: 0,
  sin_conciliar: 0,
  facturados: 0,
  no_facturados: 0,
  monto_facturado: 0,
  monto_no_facturado: 0,
  categorias: [],
}

function esMoneda(gasto, moneda) {
  const usdPuro = gasto.usd > 0 && !gasto.monto
  return moneda === 'USD' ? usdPuro : !usdPuro
}

function cierreDelPeriodo(fechaISO, diaCierre) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  const enMesActual = dia <= diaCierre
  const fecha = new Date(Date.UTC(anio, mes - 1 + (enMesActual ? 0 : 1), diaCierre))
  return fecha.toISOString().slice(0, 10)
}

function facturadoGasto(gasto, diaCierre, hoyISO = new Date().toISOString().slice(0, 10)) {
  if (!diaCierre) return null
  return cierreDelPeriodo(gasto.fecha, diaCierre) <= hoyISO
}

function formatMonto(valor, moneda) {
  return moneda === 'USD'
    ? `USD ${(valor || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : formatCLP(valor || 0)
}

export function TarjetaPage({ gastos, reconciliacion, onActualizarGasto, onRefetchGastos }) {
  const [banco, setBanco] = useState('Edwards')
  const [moneda, setMoneda] = useState('CLP')
  const [filtroFacturado, setFiltroFacturado] = useState('todos')

  const resumenBanco = reconciliacion.resumen?.bancos?.find(item => item.banco === banco)
  const metricas = resumenBanco?.monedas?.[moneda] || VACIO
  const globales = reconciliacion.resumen?.totales?.[moneda] || VACIO
  const diaCierre = reconciliacion.ciclos?.[banco]

  const pendientes = useMemo(() => gastos
    .filter(gasto => gasto.banco === banco && !gasto.pagado && gasto.estado !== 'descartado' && esMoneda(gasto, moneda))
    .map(gasto => ({ ...gasto, facturado: facturadoGasto(gasto, diaCierre) }))
    .filter(gasto => {
      if (!diaCierre) return true
      if (filtroFacturado === 'facturado') return gasto.facturado === true
      if (filtroFacturado === 'no_facturado') return gasto.facturado === false
      return true
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha)), [gastos, banco, moneda, diaCierre, filtroFacturado])

  async function actualizarGasto(id, cambios) {
    await onActualizarGasto(id, cambios)
    await reconciliacion.refrescar()
  }

  async function ejecutar(accion, gastoIds, total) {
    const payload = { banco, moneda, gasto_ids: gastoIds }
    if (accion === 'conciliar') payload.total_estado = total
    if (accion === 'pagar') payload.total_pagado = total
    const resultado = await reconciliacion[accion](payload)
    await onRefetchGastos()
    return resultado
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl text-white">Reconciliación de tarjeta</h1>
          <p className="mt-1 text-xs text-slate-500">Conciliá el estado y registrá el pago como dos etapas separadas.</p>
        </div>
        <div className="flex gap-2">
          <select value={banco} onChange={event => setBanco(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
            {BANCOS.map(item => <option key={item}>{item}</option>)}
          </select>
          <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
            {MONEDAS.map(item => (
              <button key={item} onClick={() => setMoneda(item)} className={`rounded-md px-3 py-1 text-xs font-medium ${moneda === item ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500'}`}>
                {item}
              </button>
            ))}
          </div>
          {diaCierre ? (
            <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              {FILTROS_FACTURADO.map(item => (
                <button key={item.value} onClick={() => setFiltroFacturado(item.value)} className={`rounded-md px-3 py-1 text-xs font-medium ${filtroFacturado === item.value ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500'}`}>
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {reconciliacion.error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{reconciliacion.error}</div>}

      <TilesTarjeta
        banco={banco}
        moneda={moneda}
        metricas={metricas}
        globales={globales}
        reservaLegacy={reconciliacion.reservas?.[banco] || 0}
        onGuardarReserva={reconciliacion.guardarReserva}
        diaCierre={diaCierre}
        onGuardarCiclo={reconciliacion.guardarCiclo}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <TablaTarjeta
          gastos={pendientes}
          moneda={moneda}
          onActualizarGasto={actualizarGasto}
          onConciliar={(ids, total) => ejecutar('conciliar', ids, total)}
          onDesconciliar={ids => ejecutar('desconciliar', ids)}
          onPagar={(ids, total) => ejecutar('pagar', ids, total)}
        />

        <aside className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Falta por categoría</h2>
            <span className="text-xs text-slate-600">{metricas.categorias.length}</span>
          </div>
          <div className="space-y-2">
            {metricas.categorias.length === 0 && <p className="py-6 text-center text-xs text-slate-600">Sin movimientos pendientes</p>}
            {metricas.categorias.map(categoria => (
              <div key={`${categoria.grupo}-${categoria.subcategoria}`} className="rounded-lg border border-slate-700/40 bg-slate-950/20 p-3">
                <div className="truncate text-xs text-slate-500" title={`${categoria.grupo} / ${categoria.subcategoria}`}>{categoria.grupo} / {categoria.subcategoria}</div>
                <div className="mt-1 font-mono-numbers text-sm font-semibold text-rose-400">{formatMonto(categoria.falta_depositar, moneda)}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  )
}
