import { useState } from 'react'
import { getGastoId } from '../../utils/gastosIds'
import { formatCLP, formatFecha } from '../../utils/formatters'
import { EditarAsignacion } from './EditarAsignacion'

const LABELS = {
  alta:  { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',   texto: 'Alta confianza' },
  media: { color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20', texto: 'Media confianza' },
  baja:  { color: 'text-slate-400',  bg: 'bg-slate-700/60 border-slate-600/30', texto: 'Baja confianza' },
}

function BadgeOrigen({ g }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${g.es_manual ? 'text-violet-400 bg-violet-500/10 border-violet-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30'}`}>
      {g.es_manual ? 'Manual' : 'Notion'}
    </span>
  )
}

function FilaGasto({ g, onEditar, onEliminar, confirmandoId, setConfirmandoId }) {
  const id = getGastoId(g)
  const monto = g.monto_presupuesto_manual ?? g.monto_real ?? g.monto ?? 0
  const esUsd = g.usd > 0 && !g.monto

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/40">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-500">{formatFecha(g.fecha)}</span>
          <BadgeOrigen g={g} />
          {g.banco && <span className="text-[10px] text-slate-600">{g.banco}</span>}
        </div>
        <div className="text-sm text-slate-200 truncate" title={g.motivo}>{g.motivo}</div>
        {(g.tipos ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {g.tipos.map(t => (
              <span key={t} className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right shrink-0 space-y-1">
        {esUsd ? (
          <span className="font-mono text-sm text-sky-300">USD {g.usd}</span>
        ) : (
          <span className="font-mono text-sm text-slate-200">{formatCLP(monto)}</span>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onEditar(g)}
            className="text-xs text-slate-500 hover:text-sky-400 transition-colors"
            title="Editar"
          >
            ✎
          </button>
          {confirmandoId === id ? (
            <>
              <button
                onClick={() => { onEliminar(id); setConfirmandoId(null) }}
                className="text-xs text-red-400 font-medium hover:text-red-300"
              >
                Eliminar
              </button>
              <button
                onClick={() => setConfirmandoId(null)}
                className="text-xs text-slate-600 hover:text-slate-400"
              >
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmandoId(id)}
              className="text-xs text-slate-700 hover:text-red-400 transition-colors text-base leading-none"
              title="Eliminar"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function GrupoCard({ grupo, onActualizar, onEliminar, onExcluir, mes, catalogos }) {
  const [editando, setEditando] = useState(null)
  const [confirmandoId, setConfirmandoId] = useState(null)
  const label = LABELS[grupo.confianza] ?? LABELS.baja

  function handleGuardar(gasto, changes) {
    onActualizar(getGastoId(gasto), changes)
    setEditando(null)
  }

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${label.bg}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${label.color}`}>
          {label.texto}
        </span>
        {grupo.confianza !== 'alta' && (
          <button
            onClick={() => {
              const ids = grupo.gastos.map(g => getGastoId(g))
              for (let i = 0; i < ids.length - 1; i++) {
                onExcluir(ids[i], ids[i + 1], mes)
              }
            }}
            className="text-[10px] text-slate-600 hover:text-slate-400 underline"
          >
            No es duplicado
          </button>
        )}
      </div>
      <div className="space-y-2">
        {grupo.gastos.map(g => (
          <FilaGasto
            key={getGastoId(g)}
            g={g}
            onEditar={setEditando}
            onEliminar={onEliminar}
            confirmandoId={confirmandoId}
            setConfirmandoId={setConfirmandoId}
          />
        ))}
      </div>
      {editando && (
        <EditarAsignacion
          gasto={editando}
          onGuardar={changes => handleGuardar(editando, changes)}
          onCerrar={() => setEditando(null)}
          catalogos={catalogos}
        />
      )}
    </div>
  )
}

export function DuplicadosReview({ grupos, resumen, loading, error, mes, onActualizar, onEliminar, onExcluir, onRefrescar, onCerrar, catalogos }) {
  const [tab, setTab] = useState('alta')

  const gruposFiltrados = grupos.filter(g => g.confianza === tab)
  const TABS = [
    { id: 'alta',  label: 'Alta',  count: resumen?.alta ?? 0 },
    { id: 'media', label: 'Media', count: resumen?.media ?? 0 },
    { id: 'baja',  label: 'Baja',  count: resumen?.baja ?? 0 },
  ]

  // Si la tab activa queda vacía tras eliminar, avanzar a la siguiente
  const handleEliminar = (id) => {
    onEliminar(id)
    onRefrescar(mes)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-10 px-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-base font-semibold text-slate-200">Gastos duplicados</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {mes} — {resumen?.gastos_afectados ?? 0} gastos en {(resumen?.alta ?? 0) + (resumen?.media ?? 0) + (resumen?.baja ?? 0)} grupos
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700/50">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-4 py-3 text-xs font-medium transition-colors ${
                tab === t.id
                  ? `${LABELS[t.id].color} border-b-2 border-current`
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-slate-700' : 'bg-slate-800'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-4 min-h-[200px]">
          {loading && (
            <div className="text-center py-12 text-slate-500 text-sm">Buscando duplicados…</div>
          )}
          {error && (
            <div className="text-center py-12 text-red-400 text-sm">{error}</div>
          )}
          {!loading && !error && gruposFiltrados.length === 0 && (
            <div className="text-center py-12 text-slate-600 text-sm">
              No hay duplicados de {LABELS[tab].texto.toLowerCase()} en este mes
            </div>
          )}
          {!loading && !error && gruposFiltrados.map(grupo => (
            <GrupoCard
              key={grupo.id}
              grupo={grupo}
              onActualizar={onActualizar}
              onEliminar={handleEliminar}
              onExcluir={onExcluir}
              mes={mes}
              catalogos={catalogos}
            />
          ))}
        </div>

        <div className="px-6 pb-5 flex justify-end border-t border-slate-700/50 pt-4">
          <button
            onClick={onCerrar}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
