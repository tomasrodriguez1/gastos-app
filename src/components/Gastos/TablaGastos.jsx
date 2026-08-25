import { useState } from 'react'
import { getGastoId } from '../../utils/gastosIds'
import { formatCLP, formatFecha } from '../../utils/formatters'
import { COLOR_CATEGORIA } from '../../utils/categorias'
import { getSubcategoriaPresupuesto } from '../../utils/mapeo'
import { EditarAsignacion } from './EditarAsignacion'

function formatCreatedAt(ts) {
  if (!ts) return ''
  const date = ts.substring(0, 10)
  const [, mo, da] = date.split('-')
  return `${da}/${mo}`
}

function Badge({ tipo }) {
  const color = COLOR_CATEGORIA[tipo] || '#64748b'
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {tipo}
    </span>
  )
}

function PresupuestoBadge({ g }) {
  const manual = g.presupuesto_manual
  const auto = getSubcategoriaPresupuesto(
    g.tipos || [],
    g.contexto_override || g.contexto || '',
    g.banco || '',
  )
  const r = manual || auto
  if (!r) return <span className="text-xs text-slate-700">—</span>
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
        manual
          ? 'bg-sky-500/15 text-sky-400'
          : 'bg-slate-700/60 text-slate-500'
      }`}
      title={`${r.grupo} / ${r.subcategoria}`}
    >
      {r.subcategoria}
    </span>
  )
}

function FondoBadge({ g }) {
  if (!g.financiado_por) return null
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 shrink-0"
      title={`Financiado por ${g.financiado_por}`}
    >
      {g.financiado_por}
    </span>
  )
}

function EstadoBadge({ estado }) {
  if (estado === 'pendiente') {
    return (
      <span title="Pendiente de revisión — aún no confirmado" className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 shrink-0">
        Por revisar
      </span>
    )
  }
  if (estado === 'error_parseo') {
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-rose-500/20 text-rose-400 shrink-0">
        Error parseo
      </span>
    )
  }
  return null
}

function ContextoBadge({ g }) {
  const ctx = g.contexto_override || g.contexto
  if (!ctx) return null
  const isOverride = !!g.contexto_override
  return (
    <span className={`text-xs ${isOverride ? 'text-sky-400' : 'text-slate-600'}`}>
      {ctx}
    </span>
  )
}

function MontoCell({ g }) {
  if (g.usd > 0 && !g.monto) {
    if (g.monto_clp_manual) {
      return (
        <span className="font-mono-numbers font-medium text-slate-200">
          {formatCLP(g.monto_clp_manual)}
          <span className="ml-1 text-xs text-slate-500" title={`USD ${g.usd}`}>USD</span>
        </span>
      )
    }
    return <span className="font-mono-numbers font-medium text-sky-300">USD {g.usd.toFixed(2)}</span>
  }
  const monto = g.monto_real ?? g.monto
  const parcial = g.monto_presupuesto_manual != null
  return (
    <span className={`font-mono-numbers font-medium ${monto < 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
      {formatCLP(parcial ? g.monto_presupuesto_manual : monto)}
      {parcial && (
        <span className="ml-1 text-xs text-slate-500" title={`Total: ${formatCLP(monto)}`}>½</span>
      )}
      {!parcial && g.split > 0 && (
        <span className="ml-1 text-xs text-slate-500" title={`Monto original: ${formatCLP(g.monto)}`}>✂</span>
      )}
    </span>
  )
}

export function TablaGastos({ gastos, onEliminar, onActualizar, catalogos, destacarIds, nombresFondos = [] }) {
  const [editando, setEditando] = useState(null)
  const [confirmandoId, setConfirmandoId] = useState(null)

  const total = gastos
    .filter(g => !(g.usd > 0 && !g.monto))
    .reduce((s, g) => s + (g.monto_real ?? g.monto), 0)

  function handleGuardar(gasto, changes) {
    onActualizar?.(gasto.id, changes)
    setEditando(null)
  }

  if (gastos.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
        No hay gastos para los filtros seleccionados
      </div>
    )
  }

  return (
    <>
      {/* ── Vista mobile: cards ──────────────────────────────── */}
      <div className="block sm:hidden bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="divide-y divide-slate-700/30">
          {gastos.map((g, i) => {
            const gastoId = getGastoId(g, i)
            const esNuevo = destacarIds?.has(gastoId)
            return (
              <div
                key={gastoId}
                className={`px-4 py-3 ${esNuevo ? 'bg-amber-500/[0.06] border-l-2 border-amber-400' : g.manual ? 'bg-violet-500/[0.03]' : ''}`}
              >
                {/* Fila 1: motivo + monto */}
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {esNuevo && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 shrink-0">
                        Nuevo
                      </span>
                    )}
                    {g.manual && (
                      <span title="Gasto manual" className="text-violet-400 text-xs shrink-0">✎</span>
                    )}
                    <EstadoBadge estado={g.estado} />
                    <span className="text-slate-200 text-sm truncate" title={g.motivo}>
                      {g.motivo}
                    </span>
                  </div>
                  <div className="shrink-0">
                    <MontoCell g={g} />
                  </div>
                </div>

                {/* Fila 2: meta + acciones */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="text-xs text-slate-600 font-mono-numbers shrink-0">
                      {formatFecha(g.fecha)}
                    </span>
                    <PresupuestoBadge g={g} />
                    <FondoBadge g={g} />
                    {(g.tipos || []).slice(0, 2).map(t => <Badge key={t} tipo={t} />)}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {confirmandoId === gastoId ? (
                      <>
                        <button
                          onClick={() => { onEliminar(gastoId); setConfirmandoId(null) }}
                          className="text-xs text-red-400 font-medium"
                        >
                          Eliminar
                        </button>
                        <button
                          onClick={() => setConfirmandoId(null)}
                          className="text-xs text-slate-500"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        {onActualizar && (g.estado === 'pendiente' || g.estado === 'error_parseo') && (
                          <button
                            onClick={() => onActualizar(g.id, { estado: 'confirmado' })}
                            className="text-xs px-2 py-0.5 rounded-full border text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                          >
                            Confirmar
                          </button>
                        )}
                        {onActualizar && (
                          <button
                            onClick={() => onActualizar(g.id, { pagado: !g.pagado })}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                              g.pagado
                                ? 'text-emerald-400 border-emerald-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                                : 'text-amber-500/70 border-amber-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                            }`}
                          >
                            {g.pagado ? 'Pagado' : 'Pend.'}
                          </button>
                        )}
                        {onActualizar && (
                          <button
                            onClick={() => setEditando(g)}
                            title="Editar asignación"
                            className="text-slate-600 hover:text-sky-400 transition-colors text-sm leading-none px-1"
                          >
                            ✎
                          </button>
                        )}
                        {onEliminar && (
                          <button
                            onClick={() => setConfirmandoId(gastoId)}
                            title="Eliminar"
                            className="text-slate-700 hover:text-red-400 transition-colors text-base leading-none px-1"
                          >
                            ×
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/50 bg-slate-800/80 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">{gastos.length} movimientos</span>
          <span className={`font-mono-numbers font-bold text-sm ${total < 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
            {formatCLP(total)}
          </span>
        </div>
      </div>

      {/* ── Vista desktop: tabla ─────────────────────────────── */}
      <div className="hidden sm:block bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-16">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-16">Ingresado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Motivo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-28">Banco</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tipos</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-28">Presupuesto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-32">Monto</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-20">Estado</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {gastos.map((g, i) => {
                const gastoId = getGastoId(g, i)
                const esNuevo = destacarIds?.has(gastoId)
                return (
                <tr
                  key={gastoId}
                  className={`hover:bg-white/[0.02] transition-colors ${esNuevo ? 'bg-amber-500/[0.06] border-l-2 border-amber-400' : g.manual ? 'bg-violet-500/[0.03]' : ''}`}
                >
                  <td className="px-4 py-2.5 font-mono-numbers text-xs text-slate-500">
                    {formatFecha(g.fecha)}
                  </td>
                  <td className="px-4 py-2.5 font-mono-numbers text-xs text-slate-700" title={g.created_at}>
                    {formatCreatedAt(g.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-300 max-w-xs">
                    <div className="flex items-center gap-2">
                      {esNuevo && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 shrink-0">
                          Nuevo
                        </span>
                      )}
                      {g.manual && (
                        <span title="Gasto ingresado manualmente" className="text-violet-400 text-xs shrink-0">✎</span>
                      )}
                      <EstadoBadge estado={g.estado} />
                      <div className="min-w-0">
                        <div className="truncate" title={g.motivo}>{g.motivo}</div>
                        <ContextoBadge g={g} />
                        {g.financiado_por && <div className="mt-0.5"><FondoBadge g={g} /></div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{g.banco || 'Sin banco'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(g.tipos || []).map(t => <Badge key={t} tipo={t} />)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <PresupuestoBadge g={g} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <MontoCell g={g} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {onActualizar ? (
                      <button
                        onClick={() => onActualizar(g.id, { pagado: g.pagado ? 0 : 1 })}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          g.pagado
                            ? 'text-emerald-400 border-emerald-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                            : 'text-amber-500/70 border-amber-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                        }`}
                        title={g.pagado ? 'Marcar como pendiente' : 'Marcar como pagado'}
                      >
                        {g.pagado ? 'Pagado' : 'Pendiente'}
                      </button>
                    ) : (
                      g.pagado
                        ? <span className="text-xs text-emerald-500/70">Pagado</span>
                        : <span className="text-xs text-amber-500/70">Pendiente</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {confirmandoId === gastoId ? (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => { onEliminar(gastoId); setConfirmandoId(null) }}
                          className="text-xs text-red-400 font-medium hover:text-red-300"
                        >
                          Eliminar
                        </button>
                        <button
                          onClick={() => setConfirmandoId(null)}
                          className="text-xs text-slate-500 hover:text-slate-300"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        {onActualizar && (g.estado === 'pendiente' || g.estado === 'error_parseo') && (
                          <button
                            onClick={() => onActualizar(g.id, { estado: 'confirmado' })}
                            className="text-xs px-2 py-0.5 rounded-full border text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                          >
                            Confirmar
                          </button>
                        )}
                        {onActualizar && (
                          <button
                            onClick={() => setEditando(g)}
                            title="Editar asignación"
                            className="text-slate-600 hover:text-sky-400 transition-colors text-sm leading-none"
                          >
                            ✎
                          </button>
                        )}
                        {onEliminar && (
                          <button
                            onClick={() => setConfirmandoId(gastoId)}
                            title="Eliminar gasto"
                            className="text-slate-700 hover:text-red-400 transition-colors text-base leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700/50 bg-slate-800/80">
                <td colSpan={6} className="px-4 py-3 text-xs text-slate-500">
                  {gastos.length} movimientos
                </td>
                <td className={`px-4 py-3 text-right font-mono-numbers font-bold ${total < 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {formatCLP(total)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {editando && (
        <EditarAsignacion
          gasto={editando}
          onGuardar={changes => handleGuardar(editando, changes)}
          onCerrar={() => setEditando(null)}
          catalogos={catalogos}
          nombresFondos={nombresFondos}
        />
      )}
    </>
  )
}
