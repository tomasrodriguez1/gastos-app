import { useMemo, useState } from 'react'
import { TilesTarjeta } from '../components/Tarjeta/TilesTarjeta'
import { TablaTarjeta } from '../components/Tarjeta/TablaTarjeta'
import { CicloChip } from '../components/Tarjeta/CicloChip'
import { HistorialFondo } from '../components/Tarjeta/HistorialFondo'
import { formatMontoTarjeta } from '../components/Tarjeta/formato'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'

const BANCOS = ['Edwards', 'BICE']
const MONEDAS = ['CLP', 'USD']
const FILTROS_FACTURADO = [
  { value: 'todos', label: 'Todos', campo: 'por_pagar' },
  { value: 'facturado', label: 'Facturado', campo: 'monto_facturado' },
  { value: 'no_facturado', label: 'No facturado', campo: 'monto_no_facturado' },
]
const CAMPOS_MONTO = ['por_pagar', 'fondo_actual', 'falta_depositar', 'por_cobrar', 'gasto_propio_neto', 'monto_facturado', 'monto_no_facturado']
const CAMPOS_CONTEO = ['conciliados', 'sin_conciliar', 'facturados', 'no_facturados']
const VACIO = {
  ...Object.fromEntries([...CAMPOS_MONTO, ...CAMPOS_CONTEO].map(campo => [campo, 0])),
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

// Suma las métricas de varios bancos (mismo shape que /api/tarjeta/resumen),
// fusionando categorías por grupo/subcategoría.
function sumarMetricas(lista, moneda) {
  const redondear = valor => (moneda === 'USD' ? Math.round(valor * 100) / 100 : valor)
  const sumar = (destino, origen) => {
    for (const campo of [...CAMPOS_MONTO, ...CAMPOS_CONTEO]) destino[campo] = redondear((destino[campo] || 0) + (origen[campo] || 0))
  }
  const total = { ...VACIO }
  const categorias = new Map()
  for (const metricas of lista) {
    sumar(total, metricas)
    for (const categoria of metricas.categorias || []) {
      const clave = `${categoria.grupo}\u0000${categoria.subcategoria}`
      if (!categorias.has(clave)) categorias.set(clave, { grupo: categoria.grupo, subcategoria: categoria.subcategoria })
      sumar(categorias.get(clave), categoria)
    }
  }
  total.categorias = [...categorias.values()]
  return total
}

export function TarjetaPage({ gastos, reconciliacion, onActualizarGasto, onRefetchGastos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [bancos, setBancos] = useState(BANCOS)
  const [moneda, setMoneda] = useState('CLP')
  const [filtroFacturado, setFiltroFacturado] = useState('todos')

  const ciclos = reconciliacion.ciclos
  const hayCiclo = bancos.some(banco => ciclos[banco])
  const filtro = hayCiclo ? filtroFacturado : 'todos'
  const etiquetaSeleccion = bancos.length === BANCOS.length ? 'Todas las tarjetas' : bancos.join(' + ')

  const porBanco = useMemo(() => bancos.map(banco => ({
    banco,
    metricas: reconciliacion.resumen?.bancos?.find(item => item.banco === banco)?.monedas?.[moneda] || VACIO,
  })), [reconciliacion.resumen, bancos, moneda])
  const metricas = useMemo(() => sumarMetricas(porBanco.map(item => item.metricas), moneda), [porBanco, moneda])
  const global = reconciliacion.resumen?.totales?.[moneda] || VACIO
  const saldoFondo = reconciliacion.fondo?.saldos?.[moneda] || 0

  const campoCategoria = FILTROS_FACTURADO.find(item => item.value === filtro).campo
  const categorias = metricas.categorias
    .filter(categoria => categoria[campoCategoria] > 0)
    .sort((a, b) => b[campoCategoria] - a[campoCategoria])

  const pendientes = useMemo(() => gastos
    .filter(gasto => bancos.includes(gasto.banco) && !gasto.pagado && gasto.estado !== 'descartado' && esMoneda(gasto, moneda))
    .map(gasto => ({ ...gasto, facturado: facturadoGasto(gasto, ciclos[gasto.banco]) }))
    .filter(gasto => {
      if (gasto.facturado == null) return true
      if (filtro === 'facturado') return gasto.facturado === true
      if (filtro === 'no_facturado') return gasto.facturado === false
      return true
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha)), [gastos, bancos, moneda, ciclos, filtro])

  function toggleBanco(banco) {
    setBancos(prev => {
      if (prev.includes(banco)) return prev.length === 1 ? prev : prev.filter(item => item !== banco)
      return BANCOS.filter(item => item === banco || prev.includes(item))
    })
  }

  async function actualizarGasto(id, cambios) {
    await onActualizarGasto(id, cambios)
    await reconciliacion.refrescar()
  }

  async function ejecutar(accion, banco, gastoIds, total) {
    const payload = { banco, moneda, gasto_ids: gastoIds }
    if (accion === 'conciliar') payload.total_estado = total
    if (accion === 'pagar') payload.total_pagado = total
    const resultado = await reconciliacion[accion](payload)
    await onRefetchGastos()
    return resultado
  }

  const segmento = activo => `rounded-md px-3 py-1 text-xs font-medium ${activo ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:text-slate-300'}`

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <div className="space-y-3">
        <div>
          <h1 className="font-heading text-xl text-white">Tarjetas de crédito</h1>
          <p className="mt-1 text-xs text-slate-500">Deuda pendiente, lo ya facturado y cuánto tenés aportado para pagarla. Conciliá el estado y registrá el pago como dos etapas separadas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5" role="group" aria-label="Tarjetas">
            {BANCOS.map(banco => (
              <label key={banco} className={`flex cursor-pointer items-center gap-1.5 ${segmento(bancos.includes(banco))}`}>
                <input type="checkbox" checked={bancos.includes(banco)} onChange={() => toggleBanco(banco)} className="accent-sky-500" />
                {banco}
              </label>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
            {MONEDAS.map(item => <button key={item} onClick={() => setMoneda(item)} className={segmento(moneda === item)}>{item}</button>)}
          </div>
          {hayCiclo && (
            <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              {FILTROS_FACTURADO.map(item => <button key={item.value} onClick={() => setFiltroFacturado(item.value)} className={segmento(filtro === item.value)}>{item.label}</button>)}
            </div>
          )}
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {BANCOS.map(banco => <CicloChip key={banco} banco={banco} diaCierre={ciclos[banco]} onGuardar={reconciliacion.guardarCiclo} />)}
          </div>
        </div>
      </div>

      {reconciliacion.error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{reconciliacion.error}</div>}

      <TilesTarjeta
        moneda={moneda}
        etiquetaSeleccion={etiquetaSeleccion}
        metricas={metricas}
        global={global}
        porBanco={porBanco}
        saldoFondo={saldoFondo}
        onAportar={reconciliacion.aportarFondo}
        onAjustarSaldo={reconciliacion.ajustarSaldoFondo}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <TablaTarjeta
          gastos={pendientes}
          moneda={moneda}
          mostrarBanco={bancos.length > 1}
          onActualizarGasto={actualizarGasto}
          onConciliar={(banco, ids, total) => ejecutar('conciliar', banco, ids, total)}
          onDesconciliar={(banco, ids) => ejecutar('desconciliar', banco, ids)}
          onPagar={(banco, ids, total) => ejecutar('pagar', banco, ids, total)}
        />

        <aside className="space-y-5">
          <HistorialFondo movimientos={reconciliacion.fondo?.movimientos || []} moneda={moneda} onEliminar={reconciliacion.eliminarMovimientoFondo} />

          <section className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gasto por categoría</h2>
              <span className="text-xs text-slate-600">{categorias.length}</span>
            </div>
            <div className="space-y-2">
              {categorias.length === 0 && <p className="py-6 text-center text-xs text-slate-600">Sin movimientos pendientes</p>}
              {categorias.map(categoria => (
                <div key={`${categoria.grupo}-${categoria.subcategoria}`} className="rounded-lg border border-slate-700/40 bg-slate-950/20 p-3">
                  <div className="truncate text-xs text-slate-500" title={`${categoria.grupo} / ${categoria.subcategoria}`}>{categoria.grupo} / {categoria.subcategoria}</div>
                  <div className="mt-1 font-mono-numbers text-sm font-semibold text-slate-200">{isPrivacyModeEnabled ? '••••••' : formatMontoTarjeta(categoria[campoCategoria], moneda)}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
