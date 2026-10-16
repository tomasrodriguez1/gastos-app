import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'
import { privacyFormat } from '../utils/formatters'
import { analizarClases, MESES_CORTOS } from '../utils/analisisClases'
import {
  Card, Tile, TooltipOscuro, Variacion, SERIE, UNA_SERIE, EN_CURSO, NEUTRO, EJE, GRILLA, CURSOR, miles,
} from '../components/Clases/Analisis/graficos'

const ESTILO_INSIGHT = {
  info: 'border-sky-500/60 bg-sky-500/5',
  riesgo: 'border-red-500/60 bg-red-500/5',
  alerta: 'border-amber-500/60 bg-amber-500/5',
}
const TITULO_INSIGHT = { info: 'text-sky-300', riesgo: 'text-red-300', alerta: 'text-amber-300' }

const fmtHoras = (h) => `${String(Math.round(h * 10) / 10).replace('.', ',')}h`
const nombreMes = (mes) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`

const COLUMNAS_RANKING = [
  { id: 'alumno', label: 'Alumno', alinear: 'left' },
  { id: 'ingreso', label: 'Facturado' },
  { id: 'clases', label: 'Clases' },
  { id: 'horas', label: 'Horas' },
  { id: 'porClase', label: '$/clase' },
  { id: 'sinCobrar', label: 'Sin cobrar' },
  { id: 'modalidad', label: 'Modalidad', alinear: 'left' },
  { id: 'desde', label: 'Desde' },
]

export function ClasesAnalisisPage() {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const fmt = (n) => privacyFormat(n, isPrivacyModeEnabled)
  const [clases, setClases] = useState(null)
  const [error, setError] = useState(null)
  const hoy = new Date().toLocaleDateString('en-CA')
  const [mesComparar, setMesComparar] = useState(Number(hoy.slice(5, 7)))
  const [orden, setOrden] = useState({ col: 'ingreso', asc: false })

  useEffect(() => {
    fetch('/api/clases/analisis')
      .then(async r => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'No se pudo cargar el análisis')
        setClases(body.clases)
      })
      .catch(e => setError(e.message))
  }, [])

  const a = useMemo(() => (clases ? analizarClases(clases, { hoy }) : null), [clases, hoy])

  if (error) return <main className="max-w-7xl mx-auto px-3 py-6 sm:px-6"><p className="text-red-400">{error}</p></main>
  if (!a) {
    return (
      <main className="max-w-7xl mx-auto px-3 py-6 sm:px-6 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-800" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-800/50" />
      </main>
    )
  }
  if (a.kpis.clases === 0) {
    return (
      <main className="max-w-7xl mx-auto px-3 py-6 sm:px-6">
        <h1 className="font-heading text-3xl text-white">Análisis de clases</h1>
        <p className="mt-4 text-slate-500">Todavía no hay clases dictadas para analizar.</p>
      </main>
    )
  }

  const { kpis, mensual, proyeccion } = a
  const mismoMes = a.mismoMes(mesComparar)
  const colorAnio = (anio) => SERIE[a.anios.indexOf(anio) % SERIE.length]
  const tooltipDinero = (etiqueta = 'Facturado') => (payload) => payload.map(p => ({ color: p.color || p.payload.fill, etiqueta, valor: fmt(p.value) }))
    .concat(payload[0]?.payload?.clases != null ? [{ etiqueta: 'Clases', valor: payload[0].payload.clases }] : [])

  const ranking = [...a.ranking].sort((x, y) => {
    const vx = x[orden.col]
    const vy = y[orden.col]
    const cmp = typeof vx === 'string' ? vx.localeCompare(vy) : vx - vy
    return orden.asc ? cmp : -cmp
  })
  const maxIngreso = Math.max(...a.ranking.map(r => r.ingreso))
  const proyeccionData = [
    { nombre: 'Actual', valor: proyeccion.actual.ingreso, fill: UNA_SERIE },
    { nombre: 'Proyectado', valor: proyeccion.proyectado, fill: EN_CURSO },
    ...(proyeccion.anioAnterior ? [{ nombre: `${proyeccion.anioAnterior.anio} final`, valor: proyeccion.anioAnterior.final, fill: NEUTRO }] : []),
  ]
  const mesActualNum = Number(hoy.slice(5, 7))

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div>
        <h1 className="font-heading text-3xl text-white">Análisis de clases</h1>
        <p className="mt-1 text-sm text-slate-500">
          {kpis.clases} clases dictadas desde {nombreMes(a.meses[0].mes)}. "Facturado" es el valor de cada clase dictada
          por su fecha, esté cobrada o no.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile valor={fmt(kpis.facturado)} etiqueta="Facturado" />
        <Tile valor={fmt(kpis.cobrado)} etiqueta="Cobrado" tono="text-emerald-400" />
        <Tile valor={fmt(kpis.sinCobrar)} etiqueta="Sin cobrar" detalle={`${String(kpis.pctPendiente).replace('.', ',')}% pendiente`} tono="text-amber-400" />
        <Tile valor={fmt(kpis.porClase)} etiqueta="$/clase" tono="text-sky-300" />
        <Tile valor={kpis.clases} etiqueta="Clases" />
        <Tile valor={fmtHoras(kpis.horas)} etiqueta="Horas" />
        <Tile valor={kpis.alumnos} etiqueta="Alumnos" />
        <Tile valor={mensual.mesesActivos} etiqueta="Meses activos" />
      </div>

      {/* Insights */}
      <Card titulo="Lo más importante">
        <div className="space-y-2">
          {a.insights.map((i, n) => (
            <p key={n} className={`border-l-2 rounded-r-lg px-3 py-2 text-sm text-slate-300 ${ESTILO_INSIGHT[i.tipo]}`}>
              <span className={`font-medium ${TITULO_INSIGHT[i.tipo]}`}>{i.titulo}:</span> {i.texto}
            </p>
          ))}
        </div>
      </Card>

      {/* Métricas mensuales */}
      <Card titulo="Métricas mensuales" subtitulo="Promedios sobre los meses con al menos una clase">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile valor={fmt(mensual.ingresoProm)} etiqueta="Facturado prom/mes" tono="text-sky-300" />
          <Tile valor={String(mensual.clasesProm).replace('.', ',')} etiqueta="Clases prom/mes" />
          <Tile valor={fmtHoras(mensual.horasProm)} etiqueta="Horas prom/mes" />
          <Tile valor={fmt(mensual.ingresoMediana)} etiqueta="Mediana/mes" detalle="la mitad de los meses" />
          <Tile valor={fmt(mensual.mejor.ingreso)} etiqueta="Mejor mes" detalle={nombreMes(mensual.mejor.mes)} tono="text-emerald-400" />
          <Tile valor={fmt(mensual.peor.ingreso)} etiqueta="Mes más flojo" detalle={nombreMes(mensual.peor.mes)} tono="text-amber-400" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
                <th className="py-2 text-left font-medium">Año</th>
                <th className="py-2 text-right font-medium">Meses</th>
                <th className="py-2 text-right font-medium">Clases/mes</th>
                <th className="py-2 text-right font-medium">Horas/mes</th>
                <th className="py-2 text-right font-medium">Facturado/mes</th>
                <th className="py-2 text-right font-medium">Vs año previo</th>
              </tr>
            </thead>
            <tbody>
              {a.porAnio.map(f => (
                <tr key={f.anio} className="border-b border-slate-700/30 text-slate-300">
                  <td className="py-2">{f.anio}{f.enCurso && <span className="ml-2 text-[10px] rounded-full px-1.5 py-0.5 bg-slate-700 text-slate-400">en curso</span>}</td>
                  <td className="py-2 text-right font-mono-numbers">{f.meses}</td>
                  <td className="py-2 text-right font-mono-numbers">{String(f.clasesMes).replace('.', ',')}</td>
                  <td className="py-2 text-right font-mono-numbers">{String(f.horasMes).replace('.', ',')}</td>
                  <td className="py-2 text-right font-mono-numbers text-slate-100">{fmt(f.ingresoMes)}</td>
                  <td className="py-2 text-right"><Variacion valor={f.variacion} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mismo mes vs años anteriores */}
      <Card titulo="Mismo mes vs años anteriores">
        {mesComparar === mesActualNum && proyeccion.anteriores.length > 0 && (
          <div className="mb-4 rounded-lg border-l-2 border-sky-500/60 bg-sky-500/5 px-3 py-2 text-sm text-slate-300">
            <p>
              <span className="font-medium text-sky-300">{nombreMes(proyeccion.mes)}, cómo vas:</span> llevas{' '}
              <span className="font-mono-numbers text-slate-100">{fmt(proyeccion.actual.ingreso)}</span> en {proyeccion.actual.clases} clases al día {proyeccion.dia}.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {[...proyeccion.anteriores].reverse().map(x => (
                <span key={x.anio} className="text-xs rounded-md bg-slate-800 px-2 py-1 text-slate-400">
                  {x.anio} al día {proyeccion.dia}: <span className="text-slate-200 font-mono-numbers">{fmt(x.ingreso)}</span> ({x.clases} cl) <Variacion valor={x.variacion} />
                </span>
              ))}
            </div>
          </div>
        )}
        <label className="text-xs text-slate-500">
          Mes{' '}
          <select
            value={mesComparar}
            onChange={e => setMesComparar(Number(e.target.value))}
            className="ml-1 bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200 outline-none"
          >
            {MESES_CORTOS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        {mismoMes.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Sin clases en ese mes.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mismoMes} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid {...GRILLA} />
                <XAxis dataKey="anio" {...EJE} />
                <YAxis {...EJE} tickFormatter={miles} width={44} />
                <Tooltip cursor={CURSOR} content={<TooltipOscuro filas={tooltipDinero()} />} />
                <Bar dataKey="ingreso" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {mismoMes.map(f => <Cell key={f.anio} fill={f.enCurso ? EN_CURSO : UNA_SERIE} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
                  <th className="py-2 text-left font-medium">Año</th>
                  <th className="py-2 text-right font-medium">Clases</th>
                  <th className="py-2 text-right font-medium">Facturado</th>
                  <th className="py-2 text-right font-medium">Vs año previo</th>
                </tr>
              </thead>
              <tbody>
                {mismoMes.map(f => (
                  <tr key={f.anio} className="border-b border-slate-700/30 text-slate-300">
                    <td className="py-2">{f.anio}{f.enCurso && <span className="ml-2 text-[10px] rounded-full px-1.5 py-0.5 bg-slate-700 text-slate-400">en curso</span>}</td>
                    <td className="py-2 text-right font-mono-numbers">{f.clases}</td>
                    <td className="py-2 text-right font-mono-numbers text-slate-100">{fmt(f.ingreso)}</td>
                    <td className="py-2 text-right"><Variacion valor={f.variacion} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Proyección */}
      <Card titulo="Proyección de cierre de mes">
        <div className="mb-3 rounded-lg border-l-2 border-emerald-500/60 bg-emerald-500/5 px-3 py-2 text-sm text-slate-300">
          <p>
            <span className="font-medium text-emerald-300">{nombreMes(proyeccion.mes)}:</span> llevas{' '}
            <span className="font-mono-numbers text-slate-100">{fmt(proyeccion.actual.ingreso)}</span> ({proyeccion.actual.clases} clases) al día {proyeccion.dia} de {proyeccion.diasMes}.
            Cierre proyectado: <span className="font-mono-numbers font-semibold text-emerald-300">{fmt(proyeccion.proyectado)}</span> (~{proyeccion.clasesProyectadas} clases).
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-400">vs promedio mensual {fmt(mensual.ingresoProm)} <Variacion valor={proyeccion.vsPromedio} /></span>
            {proyeccion.anioAnterior && (
              <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-400">
                vs {MESES_CORTOS[Number(proyeccion.mes.slice(5, 7)) - 1]} {proyeccion.anioAnterior.anio} final ({fmt(proyeccion.anioAnterior.final)}) <Variacion valor={proyeccion.vsAnioAnterior} />
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {proyeccion.basadoEnHistoria
              ? `Según cuánto creció este mes después del día ${proyeccion.dia} en años anteriores.`
              : 'Sin historia de este mes: proyección proporcional a los días que faltan.'}
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={proyeccionData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid {...GRILLA} />
            <XAxis dataKey="nombre" {...EJE} />
            <YAxis {...EJE} tickFormatter={miles} width={44} />
            <Tooltip cursor={CURSOR} content={<TooltipOscuro filas={p => [{ color: p[0].payload.fill, etiqueta: 'Facturado', valor: fmt(p[0].value) }]} />} />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={96}>
              {proyeccionData.map(d => <Cell key={d.nombre} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Ingresos por mes y año */}
      <Card titulo="Facturado por mes y año" subtitulo="Una barra por año; pasá el mouse para ver las clases">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={a.ingresosMesAnio} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2}>
            <CartesianGrid {...GRILLA} />
            <XAxis dataKey="mes" {...EJE} />
            <YAxis {...EJE} tickFormatter={miles} width={44} />
            <Tooltip
              cursor={CURSOR}
              content={<TooltipOscuro filas={p => p.filter(x => x.value > 0).map(x => ({
                color: x.color, etiqueta: x.name, valor: `${fmt(x.value)} · ${x.payload[`${x.name}_clases`]} cl`,
              }))} />}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} iconType="circle" iconSize={8} />
            {a.anios.map(anio => <Bar key={anio} dataKey={anio} name={anio} fill={colorAnio(anio)} radius={[3, 3, 0, 0]} maxBarSize={18} />)}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card titulo="Facturado por año">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={a.porAnio} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="anio" {...EJE} />
              <YAxis {...EJE} tickFormatter={miles} width={44} />
              <Tooltip cursor={CURSOR} content={<TooltipOscuro filas={tooltipDinero()} />} />
              <Bar dataKey="ingreso" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {a.porAnio.map(f => <Cell key={f.anio} fill={f.enCurso ? EN_CURSO : UNA_SERIE} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card titulo="Estacionalidad" subtitulo="Facturado por mes, sumando todos los años">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={a.estacionalidad} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="mes" {...EJE} />
              <YAxis {...EJE} tickFormatter={miles} width={44} />
              <Tooltip cursor={CURSOR} content={<TooltipOscuro filas={tooltipDinero()} />} />
              <Bar dataKey="ingreso" fill={UNA_SERIE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card titulo="Clases por día de la semana">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={a.diaSemana} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="dia" {...EJE} />
              <YAxis {...EJE} width={36} allowDecimals={false} />
              <Tooltip cursor={CURSOR} content={<TooltipOscuro filas={p => [{ color: UNA_SERIE, etiqueta: 'Clases', valor: p[0].value }, { etiqueta: 'Facturado', valor: fmt(p[0].payload.ingreso) }]} />} />
              <Bar dataKey="clases" fill={UNA_SERIE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card titulo="Clases por hora de inicio">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={a.horaData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="hora" {...EJE} />
              <YAxis {...EJE} width={36} allowDecimals={false} />
              <Tooltip cursor={CURSOR} content={<TooltipOscuro filas={p => [{ color: UNA_SERIE, etiqueta: 'Clases', valor: p[0].value }]} />} />
              <Bar dataKey="clases" fill={UNA_SERIE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Mapa día × hora */}
      <Card titulo="Mapa día × hora" subtitulo="Número de clases por día y hora de inicio. Las celdas vacías son horarios sin vender">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-medium pr-2">Día</th>
                {a.mapaCalor.horas.map(h => <th key={h} className="font-medium font-mono-numbers px-1">{h}h</th>)}
              </tr>
            </thead>
            <tbody>
              {a.mapaCalor.filas.map(f => (
                <tr key={f.dia}>
                  <td className="text-slate-400 pr-2">{f.dia}</td>
                  {f.valores.map((v, i) => {
                    const intensidad = v ? 0.15 + 0.85 * (v / a.mapaCalor.max) : 0
                    return (
                      <td
                        key={i}
                        title={`${f.dia} ${a.mapaCalor.horas[i]}:00 · ${v} clase${v === 1 ? '' : 's'}`}
                        className="h-8 min-w-9 rounded text-center font-mono-numbers"
                        style={{
                          background: v ? `rgba(57, 135, 229, ${intensidad})` : 'rgba(51, 65, 85, 0.25)',
                          color: intensidad > 0.55 ? '#f8fafc' : '#94a3b8',
                        }}
                      >
                        {v || ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card titulo="Modalidad">
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Tooltip content={<TooltipOscuro filas={p => [{ color: p[0].payload.fill, etiqueta: 'Clases', valor: p[0].value }, { etiqueta: 'Facturado', valor: fmt(p[0].payload.ingreso) }]} titulo={(_, p) => p[0].name} />} />
                <Pie data={a.modalidad} isAnimationActive={false} dataKey="clases" nameKey="modalidad" innerRadius="55%" outerRadius="90%" stroke="#151a1f" strokeWidth={2}>
                  {a.modalidad.map((m, i) => <Cell key={m.modalidad} fill={SERIE[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 text-sm">
              {a.modalidad.map((m, i) => (
                <div key={m.modalidad}>
                  <p className="flex items-center gap-2 text-slate-200">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SERIE[i] }} />{m.modalidad}
                  </p>
                  <p className="text-xs text-slate-500 pl-4.5">
                    {Math.round((m.clases / kpis.clases) * 100)}% de las clases · {Math.round((m.ingreso / kpis.facturado) * 100)}% de lo facturado
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card titulo="Tarifas por hora" subtitulo="Número de clases según el precio por hora cobrado">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={a.precios} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="precio" {...EJE} tickFormatter={miles} />
              <YAxis {...EJE} width={36} allowDecimals={false} />
              <Tooltip cursor={CURSOR} content={<TooltipOscuro filas={p => [{ color: UNA_SERIE, etiqueta: 'Clases', valor: p[0].value }]} titulo={l => `${fmt(l)}/hora`} />} />
              <Bar dataKey="clases" fill={UNA_SERIE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Familias */}
      {a.familias.length > 0 && (
        <Card titulo="Familias" subtitulo="Familias con más de un hermano en clases">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {a.familias.map(f => (
              <div key={f.familia_id} className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
                <p className="text-2xl font-bold font-mono-numbers text-slate-100">{fmt(f.ingreso)}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">Familia {f.nombre}</p>
                <p className="text-xs text-slate-500">
                  {f.clases} clases · {f.alumnos.length} hermanos · {Math.round((f.ingreso / kpis.facturado) * 100)}% del total
                  {f.sinCobrar > 0 && <span className="text-amber-400"> · {fmt(f.sinCobrar)} sin cobrar</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {f.alumnos.map(n => <span key={n} className="text-xs rounded-md bg-slate-800 px-2 py-0.5 text-slate-300">{n}</span>)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Ranking */}
      <Card titulo="Ranking de alumnos" subtitulo="Tocá un encabezado para ordenar">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
                {COLUMNAS_RANKING.map(c => (
                  <th key={c.id} className={`py-2 px-2 font-medium ${c.alinear === 'left' ? 'text-left' : 'text-right'}`}>
                    <button
                      type="button"
                      onClick={() => setOrden(o => ({ col: c.id, asc: o.col === c.id ? !o.asc : c.alinear === 'left' }))}
                      className="hover:text-slate-300 uppercase tracking-wider"
                    >
                      {c.label}{orden.col === c.id ? (orden.asc ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.map(r => (
                <tr key={r.alumno_id} className="border-b border-slate-700/30 text-slate-300">
                  <td className="py-2 px-2">
                    <p className="text-slate-200">{r.alumno}</p>
                    {r.familia && <p className="text-xs text-slate-500">Familia {r.familia}</p>}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="hidden sm:block h-1.5 rounded-full" style={{ width: `${Math.max(4, (r.ingreso / maxIngreso) * 80)}px`, background: UNA_SERIE }} />
                      <span className="font-mono-numbers text-slate-100">{fmt(r.ingreso)}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right font-mono-numbers">{r.clases}</td>
                  <td className="py-2 px-2 text-right font-mono-numbers">{String(Math.round(r.horas * 10) / 10).replace('.', ',')}</td>
                  <td className="py-2 px-2 text-right font-mono-numbers">{fmt(r.porClase)}</td>
                  <td className="py-2 px-2 text-right font-mono-numbers">{r.sinCobrar ? <span className="text-amber-400">{fmt(r.sinCobrar)}</span> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-2"><span className="text-xs rounded-full border border-slate-600/60 px-2 py-0.5 text-slate-400">{r.modalidad}</span></td>
                  <td className="py-2 px-2 text-right font-mono-numbers text-slate-400">{r.desde}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  )
}
