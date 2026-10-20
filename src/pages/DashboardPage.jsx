import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotonBandeja } from '../components/shared/BotonBandeja'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'
import { useReservas } from '../hooks/useReservas'
import { useResumenIngresos } from '../hooks/useIngresos'
import {
  SIN_CLASIFICAR,
  calcularAcumuladoFondo,
  calcularGastosPorGrupo,
  calcularPrevistoPorGrupo,
  calcularRitmoCiclo,
  calcularSaldoFondoManual,
  calcularSaldosCiclo,
  calcularTotalMes,
  calcularTotalPrevisto,
  calcularUsadoFondo,
  esGastoUsdPuro,
  gastosSinClasificar,
  montoDelCiclo,
  semaforo,
} from '../utils/calculos'
import { COLOR_GRUPO } from '../utils/categorias'
import { getSubcategoriaPresupuesto } from '../utils/mapeo'
import { formatCiclo, formatRangoCiclo, obtenerCicloActual } from '../utils/ciclos'
import { formatCLP, formatFecha, privacyFormat } from '../utils/formatters'
import { formatearFechaCorta } from '../utils/vencimientosTarjeta'

const TONO_FILA = {
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15',
  slate: 'border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60',
}

const TONO_ESTADO = {
  rojo: 'text-rose-400',
  amarillo: 'text-amber-300',
  naranja: 'text-orange-400',
  verde: 'text-emerald-400',
  gris: 'text-slate-500',
}

const RELLENO_ESTADO = {
  rojo: 'bg-rose-400',
  amarillo: 'bg-amber-400',
  naranja: 'bg-orange-400',
  verde: 'bg-emerald-400',
  gris: 'bg-slate-500',
}

const ESTADO_INGRESO = {
  llego: { texto: 'Llegó', estilo: 'text-emerald-400' },
  por_aprobar: { texto: 'Por aprobar', estilo: 'text-amber-300' },
  pendiente: { texto: 'Pendiente', estilo: 'text-slate-400' },
  atrasado: { texto: 'Atrasado', estilo: 'text-rose-400' },
}

function MetricMini({ label, value, detail, tone = 'text-slate-200' }) {
  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-mono-numbers text-base sm:text-lg font-bold leading-tight ${tone}`}>{value}</div>
      {detail && <div className="mt-1 text-[11px] text-slate-500">{detail}</div>}
    </div>
  )
}

function Fila({ to, tono = 'slate', titulo, detalle }) {
  return (
    <Link to={to} className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${TONO_FILA[tono]}`}>
      <div className="min-w-0">
        <div className="font-medium">{titulo}</div>
        {detalle && <div className="mt-0.5 text-xs opacity-80">{detalle}</div>}
      </div>
      <span className="shrink-0 text-xs opacity-70">Abrir</span>
    </Link>
  )
}

function saldoFondoAhorro(nombre, fondo, gastos, movimientos) {
  const aportes = fondo?.vinculado
    ? calcularAcumuladoFondo(gastos, fondo.vinculado)
    : calcularSaldoFondoManual(movimientos)
  return aportes - calcularUsadoFondo(gastos, nombre)
}

export function DashboardPage({ gastos, obtenerPresupuesto, resumenFGP, vencimientos, saldoFondoTarjeta }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const ciclo = obtenerCicloActual()
  const presupuestoMes = obtenerPresupuesto(ciclo)
  const { resumen: resumenIngresos } = useResumenIngresos(ciclo)
  const { reservas } = useReservas()
  const [movimientosPorFondo, setMovimientosPorFondo] = useState(null)
  const [saldosReserva, setSaldosReserva] = useState({})

  const previsto = calcularTotalPrevisto(presupuestoMes)
  const real = calcularTotalMes(gastos, ciclo)
  const saldos = calcularSaldosCiclo(resumenIngresos, real)
  const ritmo = calcularRitmoCiclo(gastos, ciclo, previsto)
  const categorias = categoriasDelCiclo(gastos, ciclo, presupuestoMes, ritmo.diaCorte, ritmo.duracionCiclo)
  const topGastos = topGastosDelCiclo(gastos, ciclo)
  const sinClasificar = gastosSinClasificar(gastos, ciclo)
  const dinero = (n) => (n == null ? '…' : privacyFormat(n, isPrivacyModeEnabled))
  const avance = previsto > 0 ? Math.round((real / previsto) * 100) : 0

  useEffect(() => {
    let cancelado = false
    fetch('/api/fondos-ahorro/movimientos')
      .then(respuesta => respuesta.json())
      .then(filas => {
        if (cancelado) return
        const agrupado = {}
        if (Array.isArray(filas)) {
          for (const fila of filas) (agrupado[fila.fondo_nombre] ||= []).push(fila)
        }
        setMovimientosPorFondo(agrupado)
      })
      .catch(() => {
        if (!cancelado) setMovimientosPorFondo({})
      })
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    let cancelado = false
    const activas = reservas.filter(reserva => reserva.activa)
    if (activas.length === 0) return undefined
    Promise.all(activas.map(async reserva => {
      try {
        const data = await fetch(`/api/reservas/${reserva.id}/saldos`).then(respuesta => respuesta.json())
        const ultimo = data.saldos?.[0]
        return [reserva.id, ultimo ? { monto: ultimo.monto_leido, fecha: ultimo.fecha } : null]
      } catch {
        return [reserva.id, null]
      }
    })).then(pares => {
      if (!cancelado) setSaldosReserva(Object.fromEntries(pares))
    })
    return () => { cancelado = true }
  }, [reservas])

  const reservasActivas = reservas.filter(reserva => reserva.activa)
  const fondosActivos = Object.entries(presupuestoMes?.fondos || {})
    .filter(([, fondo]) => fondo.estado !== 'cerrado')
    .map(([nombre, fondo]) => ({
      nombre,
      fondo,
      saldo: movimientosPorFondo == null ? null : saldoFondoAhorro(nombre, fondo, gastos, movimientosPorFondo[nombre]),
    }))
    .filter(item => item.saldo == null || item.saldo !== 0)
  const mostrarFGP = resumenFGP == null || resumenFGP.saldo !== 0 || resumenFGP.totalPendienteTC > 0
  const fuentesIngreso = (resumenIngresos?.fuentes || []).filter(fuente => fuente.tipo !== 'fondos')
  const contextoListo = resumenIngresos != null && vencimientos != null && resumenFGP != null
  const acciones = armarAcciones({
    gastos,
    resumenIngresos,
    vencimientos,
    resumenFGP,
    ciclo,
    dinero,
    isPrivacyModeEnabled,
  })

  const sinPresupuesto = previsto <= 0
  const saldoTone = !saldos || saldos.saldoReal >= 0 ? 'text-emerald-400' : 'text-rose-400'
  const ritmoTone = sinPresupuesto
    ? 'text-slate-400'
    : ritmo.ritmoDiario < 0
      ? 'text-rose-400'
      : 'text-emerald-400'
  const frase = fraseContraAnterior({ ritmo, dinero, isPrivacyModeEnabled })
  const cierreTone = sinPresupuesto
    ? 'text-slate-400'
    : ritmo.desviacionProyectada > 0
      ? 'text-rose-400'
      : 'text-emerald-400'
  const detalleCierre = sinPresupuesto
    ? 'Cargá un presupuesto para proyectar el cierre'
    : ritmo.desviacionProyectada > 0
      ? `${dinero(ritmo.desviacionProyectada)} sobre el presupuesto`
      : ritmo.desviacionProyectada < 0
        ? `${dinero(Math.abs(ritmo.desviacionProyectada))} bajo el presupuesto`
        : 'Justo en el presupuesto'

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-slate-500">{formatCiclo(ciclo)} · {formatRangoCiclo(ciclo)} · día {ritmo.diaCorte} de {ritmo.duracionCiclo}</p>
          <h1 className="font-heading text-3xl text-white mt-1">Ahora</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <BotonBandeja gastos={gastos} />
          <Link to="/cashflow" className="text-sm text-sky-300 hover:text-sky-200">Flujo del ciclo</Link>
          <Link to="/analisis" className="text-sm text-sky-300 hover:text-sky-200">Análisis histórico</Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Saldo real</div>
            <div className={`mt-1 font-mono-numbers text-3xl sm:text-4xl font-bold ${saldoTone}`}>{dinero(saldos?.saldoReal)}</div>
            {frase && <p className="mt-2 max-w-xl text-sm text-slate-400">{frase}</p>}
          </div>
          <div className="text-left sm:text-right">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Cierre proyectado</div>
            <div className={`mt-1 font-mono-numbers text-3xl sm:text-4xl font-bold ${cierreTone}`}>
              {sinPresupuesto ? '—' : dinero(ritmo.proyeccionCierre)}
            </div>
            <div className={`mt-1 text-xs ${cierreTone}`}>{detalleCierre}</div>
            <div className={`mt-0.5 text-xs ${ritmoTone}`}>
              {sinPresupuesto ? `${ritmo.diasRestantes} días restantes` : `${dinero(ritmo.ritmoDiario)} por día · ${ritmo.diasRestantes} días`}
            </div>
          </div>
        </div>
        {ritmo.pctPresupuesto != null && (
          <BarraRitmo pctCiclo={ritmo.pctMes} pctGasto={ritmo.pctPresupuesto} />
        )}
        <div className="mt-5 grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
          <MetricMini
            label="Ingresos"
            value={dinero(saldos?.ingresoReal)}
            detail={saldos ? `Previsto ${dinero(saldos.previsto)}` : 'Cargando…'}
            tone="text-emerald-400"
          />
          <MetricMini label="Gasto real" value={privacyFormat(real, isPrivacyModeEnabled)} detail={previsto > 0 ? `${avance}% del presupuesto` : 'Sin presupuesto'} />
          <MetricMini label="Presupuestado" value={privacyFormat(previsto, isPrivacyModeEnabled)} tone="text-sky-300" />
          <MetricMini
            label="Saldo esperado"
            value={dinero(saldos?.saldoEsperado)}
            detail="Si llega lo previsto y te pagan lo que deben"
            tone={!saldos || saldos.saldoEsperado >= 0 ? 'text-sky-300' : 'text-rose-400'}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Lo que viene</h2>
        {!contextoListo ? (
          <p className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 text-sm text-slate-500">Cargando…</p>
        ) : acciones.length === 0 ? (
          <p className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 text-sm text-slate-500">
            Bandeja al día, ingresos al día y el fondo de tarjeta cubre lo que vence.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {acciones.map(accion => <Fila key={accion.titulo} {...accion} />)}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-200">Ingresos del ciclo</h2>
            <Link to="/ingresos" className="text-sm text-sky-300 hover:text-sky-200">Ver ingresos</Link>
          </div>
          <div className="divide-y divide-slate-800/80 px-5">
            {resumenIngresos == null ? (
              <p className="py-4 text-sm text-slate-500">Cargando…</p>
            ) : fuentesIngreso.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">Sin fuentes en este ciclo.</p>
            ) : fuentesIngreso.map(fuente => {
              const estado = ESTADO_INGRESO[fuente.estado] || ESTADO_INGRESO.pendiente
              return (
                <div key={fuente.nombre} className="flex items-baseline justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-200">{fuente.nombre}</div>
                    <div className={`text-[11px] ${estado.estilo}`}>
                      {estado.texto}{fuente.estado === 'atrasado' && fuente.dia_esperado ? ` · día ${fuente.dia_esperado}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-numbers text-sm text-slate-100">{fuente.real ? dinero(fuente.real) : '—'}</div>
                    {fuente.previsto > 0 && <div className="font-mono-numbers text-[11px] text-slate-500">de {dinero(fuente.previsto)}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-200">Gastos grandes del ciclo</h2>
            <Link to="/gastos" className="text-sm text-sky-300 hover:text-sky-200">Ver gastos</Link>
          </div>
          <div className="divide-y divide-slate-800/80">
            {topGastos.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Sin gastos en este ciclo.</p>
            ) : topGastos.map(gasto => (
              <div key={gasto.id || `${gasto.fecha}-${gasto.motivo}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-200">{gasto.motivo || 'Sin descripción'}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">{formatFecha(gasto.fecha)} · {gasto.categoria}</div>
                </div>
                <div className="shrink-0 font-mono-numbers text-sm font-semibold text-slate-200">
                  {privacyFormat(gasto.montoCalculado, isPrivacyModeEnabled)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Por dónde se está yendo</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">La marca es el día del ciclo, {ritmo.pctMes}%.</p>
          </div>
          <Link to="/cashflow" className="text-sm text-sky-300 hover:text-sky-200">Ver categorías</Link>
        </div>
        <div className="space-y-3 p-5">
          {categorias.length === 0 ? (
            <p className="text-sm text-slate-500">Sin categorías con presupuesto o gasto en este ciclo.</p>
          ) : categorias.map(item => (
            <FilaCategoria
              key={item.grupo}
              item={item}
              pctCiclo={ritmo.pctMes}
              isPrivacyModeEnabled={isPrivacyModeEnabled}
            />
          ))}
          {sinClasificar.length > 0 && (
            <Link to="/bandeja" className="block text-sm text-amber-300 hover:text-amber-200">
              {sinClasificar.length} gasto{sinClasificar.length === 1 ? '' : 's'} del ciclo sin clasificar
              {!isPrivacyModeEnabled && ` · ${formatCLP(sinClasificar.reduce((suma, gasto) => suma + montoDelCiclo(gasto), 0))}`}
            </Link>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-200">Dónde está la plata</h2>
          <Link to="/fondos" className="text-sm text-sky-300 hover:text-sky-200">Gestionar fondos</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Bolsillo
            to="/tarjeta"
            label="Fondo tarjeta"
            value={saldoFondoTarjeta == null ? '…' : privacyFormat(saldoFondoTarjeta, isPrivacyModeEnabled)}
            detail={detalleFondoTarjeta(vencimientos, dinero)}
          />
          {mostrarFGP && (
            <Bolsillo
              to="/fondos#fgp"
              label="Gastos previstos"
              value={resumenFGP == null ? '…' : privacyFormat(resumenFGP.saldo, isPrivacyModeEnabled)}
              tone={resumenFGP && resumenFGP.saldo < 0 ? 'text-rose-400' : 'text-slate-200'}
              detail={resumenFGP?.totalPendienteTC > 0 ? `${dinero(resumenFGP.totalPendienteTC)} por mover a la tarjeta` : 'Saldo acumulado'}
            />
          )}
          {fondosActivos.map(({ nombre, fondo, saldo }) => (
            <Bolsillo
              key={nombre}
              to="/fondos"
              label={nombre}
              value={saldo == null ? '…' : privacyFormat(saldo, isPrivacyModeEnabled)}
              detail={fondo.vinculado ? 'Vinculado a una categoría' : 'Fondo manual'}
            />
          ))}
          {reservasActivas.map(reserva => {
            const saldo = saldosReserva[reserva.id]
            if (saldo === null || saldo?.monto === 0) return null
            return (
              <Bolsillo
                key={reserva.id}
                to="/fondos"
                label={`${reserva.emoji || ''} ${reserva.nombre}`.trim()}
                value={saldo === undefined ? '…' : privacyFormat(saldo.monto, isPrivacyModeEnabled)}
                detail={saldo?.fecha ? `Leído el ${saldo.fecha.slice(8, 10)}/${saldo.fecha.slice(5, 7)}` : 'Reserva externa'}
              />
            )
          })}
        </div>
      </section>
    </main>
  )
}

function Bolsillo({ to, label, value, detail, tone = 'text-slate-200' }) {
  return (
    <Link to={to} className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 sm:p-4 transition-colors hover:border-slate-700">
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1.5 font-mono-numbers text-lg font-bold leading-tight ${tone}`}>{value}</div>
      {detail && <div className="mt-1 text-[11px] text-slate-500">{detail}</div>}
    </Link>
  )
}

function fraseContraAnterior({ ritmo, dinero, isPrivacyModeEnabled }) {
  if (!ritmo.hayDatosPrevio || isPrivacyModeEnabled) return null
  const delta = ritmo.deltaMesPrevio
  if (delta === 0) return 'Vas igual que el ciclo anterior a esta altura.'
  return `Vas ${dinero(Math.abs(delta))} ${delta > 0 ? 'arriba' : 'abajo'} del ciclo anterior a esta altura.`
}

function BarraRitmo({ pctCiclo, pctGasto }) {
  const marca = Math.min(Math.max(pctCiclo, 0), 100)
  const lleno = Math.min(Math.max(pctGasto, 0), 100)
  const pasado = pctGasto > pctCiclo
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex justify-between gap-3 text-[11px]">
        <span className="text-slate-400">Día del ciclo {pctCiclo}%</span>
        <span className={pasado ? 'text-rose-400' : 'text-emerald-400'}>Presupuesto usado {pctGasto}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${pasado ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${lleno}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 bg-white" style={{ left: `calc(${marca}% - 1px)` }} title={`Vas en el ${pctCiclo}% del ciclo`} />
      </div>
    </div>
  )
}

function FilaCategoria({ item, pctCiclo, isPrivacyModeEnabled }) {
  const lleno = Math.min(Math.max(item.ratio, 0), 1) * 100
  const marca = Math.min(Math.max(pctCiclo, 0), 100)
  const pct = item.previsto > 0 ? Math.round(item.ratio * 100) : null
  return (
    <div className="flex items-center gap-3">
      <span className="w-3 text-xs" style={{ color: COLOR_GRUPO[item.grupo] || '#94a3b8' }}>●</span>
      <span className="w-36 shrink-0 truncate text-sm text-slate-300">{item.grupo}</span>
      <div className="relative h-2 flex-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${RELLENO_ESTADO[item.estado] || 'bg-slate-400'}`} style={{ width: `${lleno}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 bg-white/80" style={{ left: `calc(${marca}% - 1px)` }} />
      </div>
      <span className={`w-36 text-right font-mono-numbers text-xs ${TONO_ESTADO[item.estado]}`}>
        {privacyFormat(item.real, isPrivacyModeEnabled)}
        <span className="text-slate-500"> / {privacyFormat(item.previsto, isPrivacyModeEnabled)}</span>
        {pct != null && <span className="text-slate-400"> · {pct}%</span>}
      </span>
    </div>
  )
}

function categoriasDelCiclo(gastos, ciclo, presupuestoMes, dia, duracion) {
  const realPorGrupo = calcularGastosPorGrupo(gastos, ciclo)
  const previstoPorGrupo = calcularPrevistoPorGrupo(presupuestoMes)
  const avance = duracion > 0 && dia > 0 ? dia / duracion : 0
  return Object.keys({ ...realPorGrupo, ...previstoPorGrupo })
    .filter(grupo => grupo !== SIN_CLASIFICAR)
    .map(grupo => {
      const real = realPorGrupo[grupo] || 0
      const previsto = previstoPorGrupo[grupo] || 0
      const ratio = previsto > 0 ? real / previsto : 0
      return {
        grupo,
        real,
        previsto,
        ratio,
        estado: semaforo(real, previsto),
        adelanto: previsto > 0 ? ratio - avance : 0,
      }
    })
    .filter(item => item.real > 0 || item.previsto > 0)
    .sort((a, b) => b.adelanto - a.adelanto || b.real - a.real)
}

function topGastosDelCiclo(gastos, ciclo) {
  return gastos
    .filter(gasto => gasto.ciclo_financiero === ciclo && !esGastoUsdPuro(gasto))
    .map(gasto => ({ ...gasto, montoCalculado: montoDelCiclo(gasto) || 0, categoria: categoriaDe(gasto) }))
    .filter(gasto => gasto.montoCalculado > 0)
    .sort((a, b) => b.montoCalculado - a.montoCalculado)
    .slice(0, 5)
}

function categoriaDe(gasto) {
  const asignacion = gasto.presupuesto_manual || getSubcategoriaPresupuesto(
    gasto.tipos || [],
    gasto.contexto_override || gasto.contexto || '',
    gasto.banco || '',
  )
  if (!asignacion?.grupo) return 'Sin categoría'
  return asignacion.subcategoria ? `${asignacion.grupo} / ${asignacion.subcategoria}` : asignacion.grupo
}

function detalleFondoTarjeta(vencimientos, dinero) {
  const siguiente = vencimientos?.vencimientos?.[0]
  if (!siguiente) return vencimientos == null ? 'Cargando…' : 'Sin vencimientos cargados'
  if (!vencimientos.proximo) return `Cubre el pago del ${formatearFechaCorta(siguiente.fecha)}`
  return `Faltan ${dinero(vencimientos.proximo.faltante)} para el ${formatearFechaCorta(vencimientos.proximo.fecha)}`
}

function armarAcciones({ gastos, resumenIngresos, vencimientos, resumenFGP, ciclo, dinero, isPrivacyModeEnabled }) {
  const acciones = []
  const enBandeja = gastos.filter(gasto => gasto.estado === 'pendiente' || gasto.estado === 'error_parseo').length
  if (enBandeja > 0) {
    acciones.push({
      tono: 'rose',
      to: '/bandeja',
      titulo: `${enBandeja} gasto${enBandeja === 1 ? '' : 's'} en la bandeja`,
      detalle: 'Pendientes de confirmar o con error de parseo',
    })
  }

  const porAprobar = resumenIngresos?.totales?.por_aprobar || 0
  if (porAprobar > 0) {
    acciones.push({
      tono: 'amber',
      to: '/ingresos',
      titulo: isPrivacyModeEnabled ? 'Ingresos por aprobar' : `${formatCLP(porAprobar)} de ingresos por aprobar`,
      detalle: 'No cuentan en el saldo hasta que los confirmes',
    })
  }

  for (const fuente of resumenIngresos?.fuentes || []) {
    if (fuente.tipo === 'fondos') continue
    if (fuente.estado === 'atrasado') {
      acciones.push({
        tono: 'rose',
        to: '/ingresos',
        titulo: `${fuente.nombre} atrasado`,
        detalle: fuente.dia_esperado ? `Se esperaba el día ${fuente.dia_esperado}` : 'Todavía no llegó',
      })
    }
    if (fuente.por_cobrar > 0) {
      acciones.push({
        tono: 'amber',
        to: '/clases',
        titulo: isPrivacyModeEnabled ? `${fuente.nombre} por cobrar` : `${fuente.nombre}: ${dinero(fuente.por_cobrar)} por cobrar`,
        detalle: 'Clases dictadas que todavía no entraron',
      })
    }
  }

  const siguiente = vencimientos?.vencimientos?.[0]
  if (siguiente) {
    const falta = vencimientos.proximo
    const urgente = siguiente.nivel === 'vencido' || (falta && siguiente.nivel !== 'lejos')
    acciones.push({
      tono: urgente ? 'rose' : falta ? 'amber' : 'slate',
      to: '/tarjeta',
      titulo: `${siguiente.banco} vence el ${formatearFechaCorta(siguiente.fecha)}`,
      detalle: falta
        ? `Faltan ${dinero(falta.faltante)} en el fondo de tarjeta`
        : `El fondo cubre los ${dinero(siguiente.total)}`,
    })
  }

  if (resumenFGP && resumenFGP.saldo < 0) {
    acciones.push({
      tono: 'rose',
      to: '/fondos#fgp',
      titulo: isPrivacyModeEnabled ? 'Fondo de gastos previstos en rojo' : `FGP en rojo: faltan ${formatCLP(Math.abs(resumenFGP.saldo))}`,
      detalle: 'Hay que cubrir la diferencia',
    })
  }
  if (resumenFGP?.totalPendienteTC > 0) {
    const cantidad = resumenFGP.pendientesTC?.length || 0
    acciones.push({
      tono: 'amber',
      to: '/fondos#fgp',
      titulo: isPrivacyModeEnabled
        ? 'Gastos previstos por mover a la tarjeta'
        : `${formatCLP(resumenFGP.totalPendienteTC)} de FGP por mover a la tarjeta`,
      detalle: cantidad > 0 ? `${cantidad} gasto${cantidad === 1 ? '' : 's'} de tarjeta todavía en el fondo` : 'Todavía no se movieron al fondo de tarjeta',
    })
  }
  const compromiso = resumenFGP?.compromisos?.[ciclo] || 0
  if (compromiso > 0) {
    acciones.push({
      tono: 'amber',
      to: '/fondos#fgp',
      titulo: isPrivacyModeEnabled ? 'Este sueldo tiene un extra para la tarjeta' : `Este sueldo tiene ${formatCLP(compromiso)} extra para la tarjeta`,
      detalle: 'Compromiso del FGP, además del aporte normal',
    })
  }

  const orden = { rose: 0, amber: 1, slate: 2 }
  return acciones.sort((a, b) => orden[a.tono] - orden[b.tono])
}
