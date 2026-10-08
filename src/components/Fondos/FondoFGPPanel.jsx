import { useEffect, useMemo, useState } from 'react'
import { formatCLP } from '../../utils/formatters'
import { formatCiclo, obtenerCicloSiguiente } from '../../utils/ciclos'
import { calcularSaldoFondoManual, calcularUsadoFondo } from '../../utils/calculos'

const ETIQUETA_TIPO = {
  traspaso_tc: 'Movido a TC',
  cobertura: 'Cobertura',
  deficit: 'Déficit → sueldo',
  ajuste: 'Ajuste',
}

const btn = 'text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium disabled:opacity-40'
const btnSky = `${btn} bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20`
const btnGris = `${btn} bg-slate-700/40 text-slate-300 border-slate-600/50 hover:bg-slate-700/70`
const btnRojo = `${btn} bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20`
const input = 'bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500/60'

function Stat({ label, valor, tono = 'text-slate-300' }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`font-mono-numbers text-sm ${tono}`}>{valor}</div>
    </div>
  )
}

// Cubre un saldo negativo: desde un fondo de ahorro manual, con el próximo sueldo (déficit) u otro origen.
function FormCobertura({ faltante, cicloActual, fondosManuales, onRegistrar }) {
  const [monto, setMonto] = useState(String(Math.round(faltante)))
  const [origen, setOrigen] = useState('sueldo')
  const [otro, setOtro] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  async function enviar() {
    const valor = Number(monto)
    if (!(valor > 0)) return setError('Monto inválido')
    setEnviando(true)
    setError(null)
    try {
      if (origen === 'sueldo') {
        await onRegistrar({ tipo: 'deficit', ciclo: cicloActual, monto: valor, origen: `Sueldo ${formatCiclo(obtenerCicloSiguiente(cicloActual))}`, nota })
      } else if (origen === 'otro') {
        await onRegistrar({ tipo: 'cobertura', ciclo: cicloActual, monto: valor, origen: otro || 'Otro', nota })
      } else {
        await onRegistrar({ tipo: 'cobertura', ciclo: cicloActual, monto: valor, fondo_nombre: origen, nota })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500 space-y-1">
        <div>Monto</div>
        <input className={`${input} w-32 font-mono-numbers`} inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <label className="text-xs text-slate-500 space-y-1">
        <div>¿De dónde sale?</div>
        <select className={input} value={origen} onChange={e => setOrigen(e.target.value)}>
          <option value="sueldo">Próximo sueldo ({formatCiclo(obtenerCicloSiguiente(cicloActual))}) — registrar déficit</option>
          {fondosManuales.map(f => (
            <option key={f.nombre} value={f.nombre}>{f.emoji || '💰'} Fondo {f.nombre} (saldo {formatCLP(f.saldo)})</option>
          ))}
          <option value="otro">Otro (reserva, cuenta…)</option>
        </select>
      </label>
      {origen === 'otro' && (
        <input className={input} placeholder="Origen (ej. Reserva MP vacaciones)" value={otro} onChange={e => setOtro(e.target.value)} />
      )}
      <input className={`${input} flex-1 min-w-32`} placeholder="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
      <button className={btnRojo} disabled={enviando} onClick={enviar}>{enviando ? 'Guardando…' : 'Registrar'}</button>
      {error && <div className="w-full text-xs text-red-400">{error}</div>}
    </div>
  )
}

function PendientesTC({ resumen, cicloActual, onTraspasar }) {
  const [abiertos, setAbiertos] = useState(() => new Set([cicloActual]))
  const [enviando, setEnviando] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const porCiclo = useMemo(() => {
    const grupos = {}
    for (const p of resumen.pendientesTC) (grupos[p.ciclo] ||= []).push(p)
    return Object.entries(grupos).sort(([a], [b]) => b.localeCompare(a))
  }, [resumen.pendientesTC])

  async function ejecutar(items, modo, claveEnvio) {
    setEnviando(claveEnvio)
    setError(null)
    setAviso(null)
    try {
      const r = await onTraspasar(items.map(p => p.gasto.id), modo)
      setAviso(modo === 'mover'
        ? `Aporte de ${formatCLP(r.total)} registrado en el fondo TC (${r.registrados} gasto${r.registrados === 1 ? '' : 's'}).`
        : `${r.registrados} gasto${r.registrados === 1 ? '' : 's'} marcado${r.registrados === 1 ? '' : 's'} como ya movido${r.registrados === 1 ? '' : 's'}.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(null)
    }
  }

  const toggle = ciclo => setAbiertos(prev => {
    const next = new Set(prev)
    if (next.has(ciclo)) next.delete(ciclo)
    else next.add(ciclo)
    return next
  })

  if (resumen.pendientesTC.length === 0) {
    return <div className="text-xs text-slate-500">✓ No quedan gastos impagos de este ciclo por mover desde el FGP al fondo TC.{aviso && <span className="text-emerald-400"> {aviso}</span>}</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-amber-300">
          ⚠️ Mover <span className="font-mono-numbers font-semibold">{formatCLP(resumen.totalPendienteTC)}</span> de FGP → Fondo TC
          <span className="text-slate-500"> · {resumen.pendientesTC.length} gasto{resumen.pendientesTC.length === 1 ? '' : 's'} impago{resumen.pendientesTC.length === 1 ? '' : 's'} de este ciclo</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button className={btnSky} disabled={!!enviando} onClick={() => ejecutar(resumen.pendientesTC, 'mover', 'todo-mover')}>
            {enviando === 'todo-mover' ? 'Moviendo…' : 'Mover todo'}
          </button>
          <button className={btnGris} disabled={!!enviando} onClick={() => ejecutar(resumen.pendientesTC, 'marcar', 'todo-marcar')}
            title="Para gastos que ya pasaste a la tarjeta a mano: no crea aporte en el fondo TC">
            {enviando === 'todo-marcar' ? 'Marcando…' : 'Marcar todo como movido'}
          </button>
        </div>
      </div>
      {aviso && <div className="text-xs text-emerald-400">{aviso}</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="rounded-lg border border-slate-700/50 divide-y divide-slate-700/40">
        {porCiclo.map(([ciclo, items]) => {
          const total = items.reduce((s, p) => s + p.monto, 0)
          const abierto = abiertos.has(ciclo)
          return (
            <div key={ciclo}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-800/40">
                <button className="text-xs text-slate-300 font-medium" onClick={() => toggle(ciclo)}>
                  {abierto ? '▾' : '▸'} {formatCiclo(ciclo)}{ciclo < cicloActual && <span className="text-slate-500"> (historial)</span>}
                </button>
                <span className="text-xs text-slate-500">{items.length} · <span className="font-mono-numbers">{formatCLP(total)}</span></span>
                <div className="ml-auto flex gap-2">
                  <button className={btnSky} disabled={!!enviando} onClick={() => ejecutar(items, 'mover', `${ciclo}-mover`)}>Mover ciclo</button>
                  <button className={btnGris} disabled={!!enviando} onClick={() => ejecutar(items, 'marcar', `${ciclo}-marcar`)}>Marcar ciclo</button>
                </div>
              </div>
              {abierto && items.map(p => (
                <div key={p.gasto.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="text-slate-500 font-mono-numbers w-20 shrink-0">{p.gasto.fecha}</span>
                  <span className="text-slate-300 truncate max-w-56">{p.gasto.motivo}</span>
                  <span className="text-slate-500">{p.sub} · {p.gasto.banco}{p.gasto.pagado ? ' · pagado' : ''}</span>
                  <span className="ml-auto font-mono-numbers text-slate-200">{formatCLP(p.monto)}</span>
                  <button className={btnSky} disabled={!!enviando} onClick={() => ejecutar([p], 'mover', p.gasto.id)}>Mover</button>
                  <button className={btnGris} disabled={!!enviando} onClick={() => ejecutar([p], 'marcar', `${p.gasto.id}-m`)}>Ya estaba</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Historial({ ciclos }) {
  const [abierto, setAbierto] = useState(false)
  if (ciclos.length === 0) return null
  const filas = [...ciclos].reverse()
  return (
    <div>
      <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setAbierto(a => !a)}>
        {abierto ? '▾' : '▸'} Historial por ciclo ({ciclos.length})
      </button>
      {abierto && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left py-1 pr-3">Ciclo</th>
                <th className="text-right py-1 px-2">Previsto</th>
                <th className="text-right py-1 px-2">Gastado</th>
                <th className="text-right py-1 px-2">Resultado</th>
                <th className="text-right py-1 px-2">Saldo cierre</th>
                <th className="text-left py-1 pl-3">Líneas pasadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filas.map(c => (
                <tr key={c.ciclo}>
                  <td className="py-1.5 pr-3 text-slate-300">{formatCiclo(c.ciclo)}</td>
                  <td className="py-1.5 px-2 text-right font-mono-numbers text-slate-400">{formatCLP(c.previsto)}</td>
                  <td className="py-1.5 px-2 text-right font-mono-numbers text-slate-300">{formatCLP(c.gastado)}</td>
                  <td className={`py-1.5 px-2 text-right font-mono-numbers ${c.resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCLP(c.resultado)}</td>
                  <td className={`py-1.5 px-2 text-right font-mono-numbers ${c.saldoFinal >= 0 ? 'text-slate-300' : 'text-red-400'}`}>{formatCLP(c.saldoFinal)}</td>
                  <td className="py-1.5 pl-3 text-slate-500">
                    {c.excesos.length === 0 ? '—' : c.excesos.map(l => `${l.sub} +${formatCLP(l.exceso)}`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Movimientos({ movimientos, gastosPorId, onEliminar }) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState(null)
  if (movimientos.length === 0) return null
  // Un traspaso real se agrupa por su aporte de tarjeta: deshacerlo devuelve todo el lote a pendiente.
  const filas = []
  const lotes = new Map()
  for (const m of movimientos) {
    if (m.tipo === 'traspaso_tc' && m.tarjeta_movimiento_id) {
      if (!lotes.has(m.tarjeta_movimiento_id)) {
        const lote = { ...m, monto: 0, n: 0 }
        lotes.set(m.tarjeta_movimiento_id, lote)
        filas.push(lote)
      }
      const lote = lotes.get(m.tarjeta_movimiento_id)
      lote.monto += m.monto
      lote.n += 1
    } else {
      filas.push(m)
    }
  }

  async function eliminar(m) {
    const texto = m.n > 1 ? `Deshacer el traspaso de ${m.n} gastos (${formatCLP(m.monto)})? Se borra el aporte del fondo TC.` : '¿Deshacer este movimiento?'
    if (!window.confirm(texto)) return
    setError(null)
    try { await onEliminar(m.id) } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setAbierto(a => !a)}>
        {abierto ? '▾' : '▸'} Movimientos ({filas.length})
      </button>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      {abierto && (
        <div className="mt-2 divide-y divide-slate-700/30 max-h-80 overflow-y-auto">
          {filas.map(m => {
            const gasto = m.gasto_id ? gastosPorId.get(m.gasto_id) : null
            const detalle = m.n > 1 ? `${m.n} gastos` : (gasto?.motivo || m.origen || m.nota || '')
            const signo = m.tipo === 'traspaso_tc' ? '' : (m.monto >= 0 ? '+' : '')
            return (
              <div key={`${m.tipo}-${m.id}`} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="text-slate-500 font-mono-numbers w-20 shrink-0">{m.fecha}</span>
                <span className="text-slate-400 w-28 shrink-0">{ETIQUETA_TIPO[m.tipo]}{m.tipo === 'traspaso_tc' && !m.tarjeta_movimiento_id ? ' (marcado)' : ''}</span>
                <span className="text-slate-500 truncate">{detalle}</span>
                <span className={`ml-auto font-mono-numbers ${m.tipo === 'traspaso_tc' ? 'text-slate-400' : m.monto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {signo}{formatCLP(m.monto)}
                </span>
                <button className="text-slate-600 hover:text-red-400 px-1" title="Deshacer" onClick={() => eliminar(m)}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function FondoFGPPanel({ resumen, fgp, cicloActual, fondosPresupuesto = {}, gastos = [], onCambioFondoAhorro }) {
  const [movAhorro, setMovAhorro] = useState([])
  const [ajustando, setAjustando] = useState(false)
  const [nuevoSaldo, setNuevoSaldo] = useState('')
  const [errorAjuste, setErrorAjuste] = useState(null)

  useEffect(() => {
    fetch('/api/fondos-ahorro/movimientos').then(r => (r.ok ? r.json() : [])).then(setMovAhorro).catch(() => {})
  }, [fgp.movimientos])

  const fondosManuales = useMemo(() => Object.entries(fondosPresupuesto)
    .filter(([, f]) => !f.vinculado && f.estado !== 'cerrado')
    .map(([nombre, f]) => ({
      nombre,
      emoji: f.emoji,
      saldo: calcularSaldoFondoManual(movAhorro.filter(m => m.fondo_nombre === nombre)) - calcularUsadoFondo(gastos, nombre),
    })), [fondosPresupuesto, movAhorro, gastos])

  const gastosPorId = useMemo(() => new Map(gastos.map(g => [g.id, g])), [gastos])

  // El aviso global linkea a /fondos#fgp; react-router no hace scroll al hash solo.
  useEffect(() => {
    if (window.location.hash === '#fgp') document.getElementById('fgp')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  if (!resumen.desde) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">FGP — Fondo Gastos Previstos</h3>
        <p className="text-xs text-slate-500 mt-1">Ningún ciclo tiene líneas marcadas como FGP. Márcalas en /presupuesto.</p>
      </div>
    )
  }

  const actual = resumen.ciclos.find(c => c.ciclo === cicloActual)
  const excesosActual = actual?.excesos || []
  const compromisos = Object.entries(resumen.compromisos).sort(([a], [b]) => a.localeCompare(b))

  async function registrar(datos) {
    await fgp.registrar(datos)
    if (datos.fondo_nombre) onCambioFondoAhorro?.()
  }

  async function guardarAjuste() {
    const valor = Number(nuevoSaldo)
    if (!Number.isFinite(valor) || nuevoSaldo === '') return setErrorAjuste('Saldo inválido')
    const diferencia = Math.round(valor - resumen.saldo)
    setErrorAjuste(null)
    try {
      if (diferencia !== 0) await fgp.registrar({ tipo: 'ajuste', ciclo: cicloActual, monto: diferencia, nota: 'Ajuste manual de saldo' })
      setAjustando(false)
    } catch (e) {
      setErrorAjuste(e.message)
    }
  }

  return (
    <div id="fgp" className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-5 pt-4 pb-4 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">FGP — Fondo Gastos Previstos</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Acumulado desde {formatCiclo(resumen.desde)}. Lo que sobra pasa al ciclo siguiente; lo gastado con tarjeta se mueve al fondo TC.
            </p>
          </div>
          <div className="text-right">
            <div className={`font-mono-numbers text-2xl font-bold ${resumen.saldo >= 0 ? 'text-sky-400' : 'text-red-400'}`}>{formatCLP(resumen.saldo)}</div>
            <div className="text-xs text-slate-600">saldo acumulado</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Stat label="Aportado (previsto)" valor={formatCLP(resumen.aportes)} />
          <Stat label="Gastado" valor={formatCLP(resumen.gastado)} />
          {resumen.coberturas !== 0 && <Stat label="Coberturas" valor={`+${formatCLP(resumen.coberturas)}`} tono="text-emerald-400" />}
          {resumen.deficits !== 0 && <Stat label="Déficit a sueldo" valor={`+${formatCLP(resumen.deficits)}`} tono="text-amber-300" />}
          {resumen.ajustes !== 0 && <Stat label="Ajustes" valor={formatCLP(resumen.ajustes)} />}
          <div className="ml-auto">
            {ajustando ? (
              <div className="flex items-center gap-2">
                <input className={`${input} w-32 font-mono-numbers`} inputMode="numeric" autoFocus placeholder="Saldo real" value={nuevoSaldo}
                  onChange={e => setNuevoSaldo(e.target.value.replace(/[^\d-]/g, ''))} />
                <button className={btnSky} onClick={guardarAjuste}>Guardar</button>
                <button className={btnGris} onClick={() => setAjustando(false)}>Cancelar</button>
              </div>
            ) : (
              <button className={btnGris} onClick={() => { setNuevoSaldo(String(Math.round(resumen.saldo))); setAjustando(true) }}>Ajustar saldo</button>
            )}
            {errorAjuste && <div className="text-xs text-red-400 mt-1">{errorAjuste}</div>}
          </div>
        </div>

        {compromisos.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1">
            {compromisos.map(([ciclo, monto]) => (
              <div key={ciclo} className="text-sm text-amber-200">
                {ciclo === cicloActual ? 'De este sueldo' : `Del sueldo de ${formatCiclo(ciclo)}`}: <span className="font-mono-numbers font-semibold">{formatCLP(monto)}</span> extra a la tarjeta, además del FGP normal.
              </div>
            ))}
          </div>
        )}

        {resumen.saldo < 0 ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-3">
            <div className="text-sm text-red-300">
              El FGP está <span className="font-mono-numbers font-semibold">{formatCLP(Math.abs(resumen.saldo))}</span> en rojo.
              {excesosActual.length > 0 && <span className="text-red-300/80"> Se pasaron: {excesosActual.map(l => `${l.sub} +${formatCLP(l.exceso)}`).join(', ')}.</span>}
              {' '}¿De dónde sale la diferencia?
            </div>
            <FormCobertura key={Math.round(resumen.saldo)} faltante={Math.abs(resumen.saldo)} cicloActual={cicloActual} fondosManuales={fondosManuales} onRegistrar={registrar} />
          </div>
        ) : excesosActual.length > 0 && (
          <div className="rounded-lg border border-slate-600/40 bg-slate-900/30 px-4 py-2.5 text-xs text-slate-400">
            Este ciclo se pasaron {excesosActual.map(l => <span key={l.sub} className="text-red-300">{l.sub} +{formatCLP(l.exceso)} </span>)}
            — lo cubre el saldo del FGP, queda registrado en el historial.
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-700/40">
        <PendientesTC resumen={resumen} cicloActual={cicloActual} onTraspasar={fgp.traspasar} />
      </div>

      <div className="px-5 py-3 border-t border-slate-700/40 bg-slate-800/60 space-y-3">
        <Historial ciclos={resumen.ciclos} />
        <Movimientos movimientos={fgp.movimientos} gastosPorId={gastosPorId} onEliminar={fgp.eliminar} />
      </div>
    </div>
  )
}
