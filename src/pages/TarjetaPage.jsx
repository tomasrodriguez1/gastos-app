import { useMemo, useState } from 'react'
import { ResumenGlobalTarjeta } from '../components/Tarjeta/ResumenGlobalTarjeta'
import { deudaEnPesos } from '../components/Tarjeta/deudaEnPesos'
import { TablaTarjeta } from '../components/Tarjeta/TablaTarjeta'
import { CicloChip } from '../components/Tarjeta/CicloChip'
import { ProximoVencimiento } from '../components/Tarjeta/ProximoVencimiento'
import { HistorialFondoCompleto } from '../components/Tarjeta/HistorialFondoCompleto'
import { formatMontoTarjeta } from '../components/Tarjeta/formato'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'
import { cierreDelPeriodo } from '../utils/vencimientosTarjeta'

const BANCOS = ['Edwards', 'BICE']
const MONEDAS = ['CLP', 'USD']
const VACIO = {
  por_pagar: 0,
  fondo_actual: 0,
  falta_depositar: 0,
  por_cobrar: 0,
  gasto_propio_neto: 0,
  movimientos: 0,
  facturados: 0,
  no_facturados: 0,
  monto_facturado: 0,
  monto_no_facturado: 0,
  categorias: [],
}

function facturadoGasto(gasto, diaCierre, hoyISO = new Date().toISOString().slice(0, 10)) {
  if (!diaCierre) return null
  return cierreDelPeriodo(gasto.fecha, diaCierre) <= hoyISO
}

export function TarjetaPage({ gastos, reconciliacion, vencimientos, onActualizarGasto, onRefetchGastos, catalogos, obtenerPresupuesto, ciclos = [] }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const [tipoCambio, setTipoCambio] = useState('')
  const ciclosCierre = reconciliacion.ciclos
  const tasa = Number(tipoCambio)
  const tasaValida = tipoCambio.trim() !== '' && Number.isFinite(tasa) && tasa > 0 ? tasa : null
  const totales = useMemo(() => reconciliacion.resumen?.totales || { CLP: VACIO, USD: VACIO }, [reconciliacion.resumen])

  const deuda = useMemo(
    () => deudaEnPesos(gastos, { bancos: BANCOS, tipoCambio: tasaValida, ciclos: ciclosCierre }),
    [gastos, tasaValida, ciclosCierre],
  )

  const porBanco = useMemo(() => BANCOS.map(banco => {
    const resumenBanco = reconciliacion.resumen?.bancos?.find(item => item.banco === banco)?.monedas || {}
    return {
      banco,
      clp: resumenBanco.CLP || VACIO,
      usd: resumenBanco.USD || VACIO,
      deudaPesos: deudaEnPesos(gastos, { bancos: [banco], tipoCambio: tasaValida, ciclos: ciclosCierre }),
    }
  }), [reconciliacion.resumen, gastos, tasaValida, ciclosCierre])

  const nombresFondos = useMemo(() => {
    const set = new Set()
    for (const ciclo of ciclos) {
      Object.keys(obtenerPresupuesto?.(ciclo)?.fondos || {}).forEach(nombre => set.add(nombre))
    }
    return [...set]
  }, [ciclos, obtenerPresupuesto])

  const pendientes = useMemo(() => gastos
    .filter(gasto => BANCOS.includes(gasto.banco) && !gasto.pagado && gasto.estado !== 'descartado')
    .map(gasto => ({ ...gasto, facturado: facturadoGasto(gasto, ciclosCierre[gasto.banco]) }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)), [gastos, ciclosCierre])

  const categorias = useMemo(() => MONEDAS.flatMap(moneda => (totales[moneda]?.categorias || [])
    .filter(categoria => categoria.por_pagar > 0)
    .map(categoria => ({ ...categoria, moneda }))), [totales])

  async function actualizarGasto(id, cambios) {
    await onActualizarGasto(id, cambios)
    await reconciliacion.refrescar()
  }

  async function registrarPago(banco, moneda, gastoIds, total) {
    const resultado = await reconciliacion.pagar({ banco, moneda, gasto_ids: gastoIds, total_pagado: total })
    await onRefetchGastos()
    return resultado
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <div className="space-y-3">
        <div>
          <h1 className="font-heading text-xl text-white">Tarjetas de crédito</h1>
          <p className="mt-1 max-w-4xl text-xs text-slate-500">La deuda global incluye siempre Edwards y BICE, en pesos y dólares. Los filtros afectan solamente la tabla de movimientos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Edwards y BICE incluidas siempre</span>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {BANCOS.map(banco => <CicloChip key={banco} banco={banco} diaCierre={ciclosCierre[banco]} diaPago={reconciliacion.diasPago?.[banco]} onGuardar={reconciliacion.guardarCiclo} />)}
          </div>
        </div>
      </div>

      {reconciliacion.error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{reconciliacion.error}</div>}

      <ProximoVencimiento vencimientos={vencimientos} />

      <ResumenGlobalTarjeta
        deuda={deuda}
        totales={totales}
        porBanco={porBanco}
        tipoCambio={tipoCambio}
        onTipoCambio={setTipoCambio}
        fondoSaldos={reconciliacion.fondo?.saldos}
        onAportar={reconciliacion.aportarFondo}
        onAjustarSaldo={reconciliacion.ajustarSaldoFondo}
      />

      <TablaTarjeta
        gastos={pendientes}
        tipoCambio={tasaValida}
        onActualizarGasto={actualizarGasto}
        onPagar={registrarPago}
        catalogos={catalogos}
        nombresFondos={nombresFondos}
      />

      <HistorialFondoCompleto
        movimientos={reconciliacion.fondo?.movimientos || []}
        saldos={reconciliacion.fondo?.saldos}
        onEliminar={reconciliacion.eliminarMovimientoFondo}
      />

      <section className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4" aria-labelledby="categorias-tarjeta-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="categorias-tarjeta-title" className="text-sm font-semibold text-slate-300">Gasto pendiente por categoría</h2>
          <span className="text-xs text-slate-600">{categorias.length} categorías</span>
        </div>
        {categorias.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">Sin movimientos pendientes</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categorias.map(categoria => (
              <div key={`${categoria.moneda}-${categoria.grupo}-${categoria.subcategoria}`} className="rounded-lg border border-slate-700/40 bg-slate-950/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate text-xs text-slate-500" title={`${categoria.grupo} / ${categoria.subcategoria}`}>{categoria.grupo} / {categoria.subcategoria}</div>
                  <span className={`rounded-md bg-slate-700/40 px-1.5 py-0.5 font-mono-numbers text-[9px] ${categoria.moneda === 'USD' ? 'text-violet-300' : 'text-sky-300'}`}>{categoria.moneda}</span>
                </div>
                <div className="mt-1 font-mono-numbers text-sm font-semibold text-slate-200">{isPrivacyModeEnabled ? '••••••' : formatMontoTarjeta(categoria.por_pagar, categoria.moneda)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
