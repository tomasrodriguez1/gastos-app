import { useState } from 'react'
import { getSubcategoriaPresupuesto } from '../../utils/mapeo'
import { formatCLP, formatFecha } from '../../utils/formatters'
import { GRUPOS_PRESUPUESTO } from '../../utils/categorias'
import { obtenerCicloFinanciero, obtenerMesCalendario } from '../../utils/ciclos'

const TIPOS_DEFAULT = [
  'A medias', 'Ajuste', 'Auto', 'Comida', 'Deporte', 'Deuda', 'Externo',
  'Mantención', 'Ocio', 'Otro', 'Proyecto', 'Regalo', 'Regalo propio', 'Ropa',
  'Salud', 'Suscripcion', 'Transporte', 'Turno', 'Unknown', 'VA', 'Viaje',
]
const BANCOS_DEFAULT = ['Edwards', 'BICE', 'TC Papa', 'Otro', 'Transferencia', 'Efectivo']
const CONTEXTOS_DEFAULT = ['Familia', 'Trabajo', 'Amigos', 'Personal', 'Polola']

function esUsdPuro(g) { return g.usd > 0 && !g.monto }

function MontoDisplay({ g }) {
  if (esUsdPuro(g)) return <span className="font-mono-numbers text-amber-400">USD {g.usd}</span>
  return <span className="font-mono-numbers text-slate-200">{formatCLP(g.monto_real || g.monto || 0)}</span>
}

function MappingBadge({ g }) {
  const m = getSubcategoriaPresupuesto(g.tipos || [], g.contexto_override || g.contexto || '', g.banco || '')
  if (!m) return <span className="text-slate-700 text-xs">—</span>
  return (
    <span className="text-xs text-slate-500">
      {m.grupo} <span className="text-slate-400">/ {m.subcategoria}</span>
    </span>
  )
}

function EditPanel({ gasto, catalogos, onGuardar, onCancelar }) {
  const gruposPresupuesto = catalogos?.gruposPresupuesto && Object.keys(catalogos.gruposPresupuesto).length
    ? catalogos.gruposPresupuesto : GRUPOS_PRESUPUESTO
  const todosTipos = catalogos?.tipos?.length ? catalogos.tipos : TIPOS_DEFAULT
  const todosBancos = catalogos?.bancos?.length ? catalogos.bancos : BANCOS_DEFAULT
  const todosContextos = catalogos?.contextos?.length ? catalogos.contextos : CONTEXTOS_DEFAULT

  const [fecha, setFecha] = useState(gasto.fecha ?? '')
  const [motivo, setMotivo] = useState(gasto.motivo ?? '')
  const [banco, setBanco] = useState(gasto.banco ?? '')
  const [monto, setMonto] = useState(String(gasto.monto_real ?? gasto.monto ?? ''))
  const [tipos, setTipos] = useState(gasto.tipos ?? [])
  const [contexto, setContexto] = useState(gasto.contexto ?? '')
  const [pagado, setPagado] = useState(!!gasto.pagado)
  const [contextoOverride, setContextoOverride] = useState(gasto.contexto_override ?? '')
  const [grupo, setGrupo] = useState(gasto.presupuesto_manual?.grupo ?? '')
  const [subcategoria, setSubcategoria] = useState(gasto.presupuesto_manual?.subcategoria ?? '')
  const [montoParcial, setMontoParcial] = useState(gasto.monto_presupuesto_manual ?? '')
  const [tipoCambio, setTipoCambio] = useState(
    gasto.monto_clp_manual && gasto.usd ? Math.round(gasto.monto_clp_manual / gasto.usd) : ''
  )

  function toggleTipo(t) {
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function handleGrupoChange(g) {
    setGrupo(g)
    setSubcategoria(gruposPresupuesto[g]?.[0] ?? '')
  }

  function handleGuardar() {
    const montoNum = Number(monto)
    const changes = {
      fecha, motivo: motivo.trim(), banco, tipos, contexto,
      monto: montoNum, monto_real: montoNum,
      pagado: pagado ? 1 : 0,
      contexto_override: contextoOverride || null,
      presupuesto_manual: grupo && subcategoria ? { grupo, subcategoria } : null,
      monto_presupuesto_manual: Number(montoParcial) > 0 ? Number(montoParcial) : null,
    }
    if (esUsdPuro(gasto)) {
      const tc = Number(tipoCambio)
      changes.monto_clp_manual = tc > 0 ? Math.round(gasto.usd * tc) : null
      delete changes.monto
      delete changes.monto_real
    }
    if (fecha !== gasto.fecha) {
      changes.mes = obtenerMesCalendario(fecha)
      changes.ciclo_financiero = obtenerCicloFinanciero(fecha)
    }
    onGuardar(changes)
  }

  const inputCls = "w-full bg-slate-800/60 border border-slate-600/60 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
  const pillActive = "bg-sky-500/20 text-sky-400 border-sky-500/40"
  const pillInactive = "bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500 hover:text-slate-400"

  return (
    <div className="bg-slate-800/40 border-t border-slate-700/40 px-4 py-4 space-y-4">
      {/* Fecha + Motivo */}
      <div className="grid grid-cols-[140px_1fr] gap-3">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Motivo</label>
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Monto + Banco */}
      <div className="grid grid-cols-2 gap-3">
        {!esUsdPuro(gasto) ? (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Monto</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className={inputCls} />
          </div>
        ) : (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Tipo de cambio</label>
            <div className="flex items-center gap-2">
              <input type="number" value={tipoCambio} onChange={e => setTipoCambio(e.target.value)} placeholder="950" className={inputCls} />
              <span className="text-xs text-slate-500 shrink-0">
                {tipoCambio > 0 ? formatCLP(Math.round(gasto.usd * Number(tipoCambio))) : `USD ${gasto.usd}`}
              </span>
            </div>
          </div>
        )}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Banco</label>
          <select value={banco} onChange={e => setBanco(e.target.value)} className={inputCls}>
            <option value="">Sin banco</option>
            {todosBancos.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Tipos */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Tipos</label>
        <div className="flex flex-wrap gap-1">
          {todosTipos.map(t => (
            <button key={t} type="button" onClick={() => toggleTipo(t)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${tipos.includes(t) ? pillActive : pillInactive}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Contexto + Pagado */}
      <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Contexto</label>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setContexto('')}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${contexto === '' ? 'bg-slate-600/50 text-slate-300 border-slate-500' : pillInactive}`}>
              Ninguno
            </button>
            {todosContextos.map(c => (
              <button key={c} type="button" onClick={() => setContexto(contexto === c ? '' : c)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${contexto === c ? pillActive : pillInactive}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-5">
          <button type="button" onClick={() => setPagado(p => !p)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors font-medium ${pagado ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-500/70 border-amber-500/20'}`}>
            {pagado ? 'Pagado' : 'Pendiente'}
          </button>
        </div>
      </div>

      {/* Presupuesto */}
      <div className="border-t border-slate-700/40 pt-3 space-y-3">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider">Asignación presupuesto</p>

        {/* Override contexto */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Override contexto</label>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setContextoOverride('')}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${contextoOverride === '' ? 'bg-slate-600/50 text-slate-300 border-slate-500' : pillInactive}`}>
              Auto
            </button>
            {todosContextos.map(c => (
              <button key={c} type="button" onClick={() => setContextoOverride(contextoOverride === c ? '' : c)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${contextoOverride === c ? 'bg-violet-500/20 text-violet-400 border-violet-500/40' : pillInactive}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grupo + Subcategoria + Monto parcial */}
        <div className="grid grid-cols-[1fr_1fr_120px] gap-2">
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Grupo</label>
            <select value={grupo} onChange={e => handleGrupoChange(e.target.value)} className={inputCls}>
              <option value="">Automático</option>
              {Object.keys(gruposPresupuesto).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {grupo && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Subcategoría</label>
              <select value={subcategoria} onChange={e => setSubcategoria(e.target.value)} className={inputCls}>
                {(gruposPresupuesto[grupo] || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {!esUsdPuro(gasto) && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Monto parcial</label>
              <input type="number" value={montoParcial} onChange={e => setMontoParcial(e.target.value)}
                placeholder="Total" className={inputCls} />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancelar}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={handleGuardar}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
          Listo
        </button>
      </div>
    </div>
  )
}

export function SyncReview({ pendingSync, onConfirmar, onCancelar, catalogos }) {
  const [gastos, setGastos] = useState(pendingSync.gastos)
  const [seleccionados, setSeleccionados] = useState(() => new Set(pendingSync.gastos.map((_, i) => i)))
  const [expandedIdx, setExpandedIdx] = useState(null)

  const allSelected = seleccionados.size === gastos.length

  function toggleAll() {
    setSeleccionados(allSelected ? new Set() : new Set(gastos.map((_, i) => i)))
  }

  function toggle(i) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function handleGuardarEdicion(idx, changes) {
    setGastos(prev => prev.map((g, i) => i === idx ? { ...g, ...changes } : g))
    setExpandedIdx(null)
  }

  function handleConfirmar() {
    onConfirmar(gastos.filter((_, i) => seleccionados.has(i)))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancelar} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-200">Revisar sincronización</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {gastos.length === 0
                ? 'No hay gastos nuevos'
                : `${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} nuevo${gastos.length !== 1 ? 's' : ''} — revisá, editá y confirmá`}
            </p>
          </div>
          <button onClick={onCancelar} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        {gastos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-600 text-sm">
            Todo está al día
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="px-4 py-2 border-b border-slate-700/30 grid grid-cols-[20px_44px_1fr_80px_80px_28px] gap-3 items-center text-[10px] text-slate-600 uppercase tracking-wider shrink-0">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-sky-500 cursor-pointer" />
              <span>Fecha</span>
              <span>Motivo / Categorías</span>
              <span className="text-right">Monto</span>
              <span className="text-right">Asignación</span>
              <span />
            </div>

            {/* Rows */}
            <div className="overflow-y-auto flex-1">
              {gastos.map((g, i) => (
                <div key={i} className={`border-b border-slate-700/20 ${seleccionados.has(i) ? '' : 'opacity-40'}`}>
                  {/* Summary row */}
                  <div className="px-4 py-3 grid grid-cols-[20px_44px_1fr_80px_80px_28px] gap-3 items-start">
                    <input
                      type="checkbox"
                      checked={seleccionados.has(i)}
                      onChange={() => toggle(i)}
                      className="accent-sky-500 cursor-pointer mt-0.5"
                    />

                    <span className="text-xs text-slate-500 font-mono-numbers mt-0.5">
                      {formatFecha(g.fecha)}
                    </span>

                    <div className="min-w-0">
                      <div className="text-sm text-slate-200 truncate">{g.motivo}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(g.tipos || []).map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/60 text-slate-400 border border-slate-600/30">{t}</span>
                        ))}
                        {g.contexto && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-500 border border-sky-500/20">{g.contexto}</span>
                        )}
                        {g.banco && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/40 text-slate-500 border border-slate-600/20">{g.banco}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-sm mt-0.5">
                      <MontoDisplay g={g} />
                    </div>

                    <div className="text-right mt-0.5">
                      <MappingBadge g={g} />
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                      className={`text-sm leading-none transition-colors mt-0.5 ${expandedIdx === i ? 'text-sky-400' : 'text-slate-600 hover:text-sky-400'}`}
                      title="Editar"
                    >
                      {expandedIdx === i ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Inline edit panel */}
                  {expandedIdx === i && (
                    <EditPanel
                      gasto={g}
                      catalogos={catalogos}
                      onGuardar={changes => handleGuardarEdicion(i, changes)}
                      onCancelar={() => setExpandedIdx(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700/50 shrink-0">
          <span className="flex-1 text-xs text-slate-600">
            {seleccionados.size > 0 ? `${seleccionados.size} de ${gastos.length} seleccionados` : 'Ninguno seleccionado'}
          </span>
          <button type="button" onClick={onCancelar}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleConfirmar}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
            {gastos.length === 0 ? 'Cerrar' : `Confirmar${seleccionados.size > 0 ? ` (${seleccionados.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
