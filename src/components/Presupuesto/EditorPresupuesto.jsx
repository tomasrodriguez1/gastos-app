import { useState, useEffect, Fragment } from 'react'
import { formatCLP } from '../../utils/formatters'
import {
  calcularGastosPorSubcategoria,
  getGastosPorSubcategoria,
  calcularTotalIngresos,
  calcularTotalPrevisto,
  montoReal,
  semaforo,
  colorSemaforo,
} from '../../utils/calculos'

function ModalTransaccionesSubcat({ grupo, sub, gastos, mes, onCerrar }) {
  const items = getGastosPorSubcategoria(gastos, mes, grupo, sub)
  const total = items.reduce((s, g) => s + montoReal(g), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">{grupo}</p>
            <h2 className="text-base font-semibold text-slate-200 mt-0.5">{sub}</h2>
          </div>
          <button
            onClick={onCerrar}
            className="text-slate-500 hover:text-slate-300 transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {items.length === 0 ? (
            <p className="text-sm text-slate-600 italic px-6 py-8 text-center">Sin gastos registrados</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900/95">
                <tr className="border-b border-slate-700/30">
                  <th className="px-6 py-3 text-left text-xs text-slate-500 uppercase tracking-wider w-28">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs text-slate-500 uppercase tracking-wider">Descripción</th>
                  <th className="px-6 py-3 text-right text-xs text-slate-500 uppercase tracking-wider w-32">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {items.map(g => (
                  <tr key={g.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 text-slate-500 font-mono-numbers tabular-nums text-xs">{g.fecha}</td>
                    <td className="px-6 py-3 text-slate-300">{g.motivo}</td>
                    <td className="px-6 py-3 text-right font-mono-numbers tabular-nums text-slate-200">{formatCLP(montoReal(g))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50 shrink-0">
            <span className="text-xs text-slate-500">{items.length} transacción{items.length !== 1 ? 'es' : ''}</span>
            <span className="font-mono-numbers font-bold text-slate-200">{formatCLP(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function InputMonto({ value, onChange }) {
  const [raw, setRaw] = useState(String(value || 0))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setRaw(String(value || 0))
  }, [value, focused])

  return (
    <input
      type="number"
      value={focused ? raw : value || 0}
      onFocus={() => { setFocused(true); setRaw(String(value || 0)) }}
      onChange={e => { setRaw(e.target.value); onChange(Number(e.target.value) || 0) }}
      onBlur={() => setFocused(false)}
      className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-mono-numbers text-slate-200 outline-none focus:border-sky-500 w-24 sm:w-32 text-right"
    />
  )
}

const COLOR_TEXT = {
  verde:    'text-emerald-400',
  amarillo: 'text-yellow-400',
  rojo:     'text-red-400',
  naranja:  'text-orange-400',
  gris:     'text-slate-500',
}


export function EditorPresupuesto({ mes, presupuestoMes, gastos, onGuardar, onNuevaSubcategoria }) {
  const [datos, setDatos] = useState(presupuestoMes)
  const [guardado, setGuardado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState(null)
  const [nuevaSub, setNuevaSub] = useState({}) // { grupo: texto }
  const [modalSubcat, setModalSubcat] = useState(null) // { grupo, sub }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDatos(presupuestoMes)
  }, [presupuestoMes])

  const gastosPorSubcat = calcularGastosPorSubcategoria(gastos, mes)

  function calcularRealGrupoDesdeSubcategorias(grupo, gData) {
    return Object.keys(gData.subcategorias || {}).reduce((sum, sub) => {
      return sum + (gastosPorSubcat[grupo]?.[sub] || 0)
    }, 0)
  }

  function setIngreso(fuente, val) {
    setDatos(d => ({ ...d, ingresos: { ...d.ingresos, [fuente]: val } }))
  }

  function setSubcategoria(grupo, sub, field, val) {
    setDatos(d => ({
      ...d,
      categorias: {
        ...d.categorias,
        [grupo]: {
          ...d.categorias[grupo],
          subcategorias: {
            ...(d.categorias[grupo]?.subcategorias || {}),
            [sub]: { ...(d.categorias[grupo]?.subcategorias?.[sub] || {}), [field]: val },
          },
        },
      },
    }))
  }

  async function agregarSubcategoria(grupo) {
    const nombre = (nuevaSub[grupo] || '').trim()
    if (!nombre) return
    const nuevosDatos = {
      ...datos,
      categorias: {
        ...datos.categorias,
        [grupo]: {
          ...datos.categorias[grupo],
          subcategorias: {
            ...(datos.categorias[grupo]?.subcategorias || {}),
            [nombre]: { previsto: 0, fgp: false },
          },
        },
      },
    }
    setDatos(nuevosDatos)
    const result = await onGuardar(nuevosDatos)
    if (result?.ok === false) {
      setErrorGuardado('No se pudo guardar la subcategoría')
      return
    }
    setNuevaSub(prev => ({ ...prev, [grupo]: '' }))
    fetch('/api/catalogos/subcategorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: `${grupo}_${nombre}`, grupo_id: grupo, nombre, orden: 0 }),
    }).then(() => onNuevaSubcategoria?.())
  }

  function eliminarSubcategoria(grupo, sub) {
    setDatos(d => {
      const subs = { ...(d.categorias[grupo]?.subcategorias || {}) }
      delete subs[sub]
      return {
        ...d,
        categorias: {
          ...d.categorias,
          [grupo]: { ...d.categorias[grupo], subcategorias: subs },
        },
      }
    })
  }

  function abrirModal(grupo, sub) {
    setModalSubcat({ grupo, sub })
  }

  async function handleGuardar() {
    setGuardando(true)
    setErrorGuardado(null)
    const result = await onGuardar(datos)
    setGuardando(false)
    if (result?.ok === false) {
      setErrorGuardado('No se pudo guardar')
      return
    }
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  const totalIngresos = calcularTotalIngresos(datos)
  const totalPrevisto = calcularTotalPrevisto(datos)
  const totalReal = Object.entries(datos?.categorias || {}).reduce((sum, [grupo, gData]) => {
    return sum + calcularRealGrupoDesdeSubcategorias(grupo, gData)
  }, 0)

  return (
    <div className="space-y-6">
      {/* Ingresos + Resumen — fila superior */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {/* Ingresos — 30% en desktop, full en mobile */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 lg:w-[30%] lg:shrink-0">
          <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">Ingresos previstos</h3>
          <div className="space-y-2">
            {Object.entries(datos?.ingresos || {}).map(([fuente, monto]) => (
              <div key={fuente} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-300 w-40">{fuente}</span>
                <InputMonto value={monto} onChange={val => setIngreso(fuente, val)} />
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-700/50">
              <span className="text-sm font-medium text-slate-300">Total ingresos</span>
              <span className="font-mono-numbers font-bold text-emerald-400">{formatCLP(totalIngresos)}</span>
            </div>
          </div>
        </div>

        {/* Resumen global previsto vs real — 70% */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 flex-1">
        <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">Resumen por categoría</h3>
        <div className="space-y-2.5">
          {Object.entries(datos?.categorias || {}).map(([grupo, gData]) => {
            const realGrupo = calcularRealGrupoDesdeSubcategorias(grupo, gData)
            const prevGrupo = Object.values(gData.subcategorias || {}).reduce((s, sub) => s + (sub.previsto || 0), 0)
            if (realGrupo === 0 && prevGrupo === 0) return null
            const estado = semaforo(realGrupo, prevGrupo)
            const pct = prevGrupo > 0
              ? Math.min((realGrupo / prevGrupo) * 100, 100)
              : realGrupo > 0 ? 100 : 0
            const diff = realGrupo - prevGrupo
            return (
              <div key={grupo}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs text-slate-400 w-40 shrink-0 truncate">{grupo}</span>
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: colorSemaforo(estado) }}
                    />
                  </div>
                  <span className={`font-mono-numbers text-xs w-24 text-right ${COLOR_TEXT[estado]}`}>
                    {formatCLP(realGrupo)}
                  </span>
                  <span className="hidden sm:inline font-mono-numbers text-xs text-slate-600 w-24 text-right">
                    / {formatCLP(prevGrupo)}
                  </span>
                  {prevGrupo > 0 && (
                    <span className={`hidden sm:inline font-mono-numbers text-xs w-20 text-right ${diff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {diff > 0 ? '+' : ''}{formatCLP(diff)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-700/50">
          <span className="text-xs font-medium text-slate-400 w-40 shrink-0">TOTAL</span>
          <div className="flex-1" />
          <span className="font-mono-numbers text-sm font-bold text-slate-200 w-24 text-right">{formatCLP(totalReal)}</span>
          <span className="hidden sm:inline font-mono-numbers text-sm text-slate-500 w-24 text-right">/ {formatCLP(totalPrevisto)}</span>
          <span className={`hidden sm:inline font-mono-numbers text-sm font-bold w-20 text-right ${totalReal - totalPrevisto > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalReal - totalPrevisto > 0 ? '+' : ''}{formatCLP(totalReal - totalPrevisto)}
          </span>
        </div>
        </div>
      </div>

      {/* Categorías por grupo — editor */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {Object.entries(datos?.categorias || {}).map(([grupo, gData]) => {
        const realGrupo = calcularRealGrupoDesdeSubcategorias(grupo, gData)
        const prevGrupo = Object.values(gData.subcategorias || {}).reduce((s, sub) => s + (sub.previsto || 0), 0)
        const estado = semaforo(realGrupo, prevGrupo)
        const pct = prevGrupo > 0
          ? Math.min((realGrupo / prevGrupo) * 100, 100)
          : realGrupo > 0 ? 100 : 0

        return (
          <div key={grupo} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            {/* Group header */}
            <div className="px-5 pt-3 pb-2 border-b border-slate-700/30 bg-slate-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{grupo}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono-numbers text-sm font-bold ${COLOR_TEXT[estado]}`}>
                    {formatCLP(realGrupo)}
                  </span>
                  <span className="text-slate-600 text-xs">/</span>
                  <span className="font-mono-numbers text-sm text-slate-400">{formatCLP(prevGrupo)}</span>
                  {prevGrupo > 0 && (
                    <span className={`font-mono-numbers text-xs ml-1 ${realGrupo - prevGrupo > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      ({realGrupo - prevGrupo > 0 ? '+' : ''}{formatCLP(realGrupo - prevGrupo)})
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: colorSemaforo(estado) }}
                />
              </div>
            </div>

            {/* Subcategorias */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/20">
                    <th className="w-8" />
                    <th className="px-5 py-2 text-left text-xs text-slate-500 uppercase tracking-wider">Subcategoría</th>
                    <th className="px-5 py-2 text-right text-xs text-slate-500 uppercase tracking-wider w-36">Previsto</th>
                    <th className="px-5 py-2 text-right text-xs text-slate-500 uppercase tracking-wider w-28">Real</th>
                    <th className="hidden sm:table-cell px-5 py-2 text-right text-xs text-slate-500 uppercase tracking-wider w-24">Dif.</th>
                    <th className="px-5 py-2 text-center text-xs text-slate-500 uppercase tracking-wider w-14">FGP</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/20">
                  {Object.entries(gData.subcategorias || {}).map(([sub, subDatos]) => {
                    const real = gastosPorSubcat[grupo]?.[sub] || 0
                    const prev = subDatos.previsto || 0
                    const diff = real - prev
                    const estado = semaforo(real, prev)
                    const hasData = real > 0 || prev > 0
                    return (
                      <Fragment key={sub}>
                        <tr className="hover:bg-white/[0.02] group">
                          <td className="pl-3 text-center">
                            {real > 0 && (
                              <button
                                onClick={() => abrirModal(grupo, sub)}
                                title="Ver transacciones"
                                className="text-slate-600 hover:text-slate-300 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-2 text-slate-300">{sub}</td>
                          <td className="px-5 py-2 text-right">
                            <InputMonto
                              value={prev}
                              onChange={val => setSubcategoria(grupo, sub, 'previsto', val)}
                            />
                          </td>
                          <td className={`px-5 py-2 text-right font-mono-numbers text-sm ${COLOR_TEXT[estado]}`}>
                            {real > 0 ? (
                              <span>{formatCLP(real)}</span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                          <td className="hidden sm:table-cell px-5 py-2 text-right font-mono-numbers text-xs">
                            {hasData && prev > 0 ? (
                              <span className={diff > 0 ? 'text-red-400' : 'text-emerald-400'}>
                                {diff > 0 ? '+' : ''}{formatCLP(diff)}
                              </span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                          <td className="px-5 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={subDatos.fgp || false}
                              onChange={e => setSubcategoria(grupo, sub, 'fgp', e.target.checked)}
                              className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                            />
                          </td>
                          <td className="pr-3 text-center">
                            {real === 0 && (
                              <button
                                onClick={() => eliminarSubcategoria(grupo, sub)}
                                title="Eliminar subcategoría"
                                className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 transition-all text-base leading-none"
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                  {/* Nueva subcategoría */}
                  <tr className="border-t border-slate-700/30">
                    <td colSpan={7} className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={nuevaSub[grupo] || ''}
                          onChange={e => setNuevaSub(prev => ({ ...prev, [grupo]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && agregarSubcategoria(grupo)}
                          placeholder="Nueva subcategoría..."
                          className="flex-1 bg-transparent text-xs text-slate-500 placeholder-slate-700 outline-none focus:text-slate-300 py-1"
                        />
                        {(nuevaSub[grupo] || '').trim() && (
                          <button
                            onClick={() => agregarSubcategoria(grupo)}
                            className="text-xs text-sky-400 hover:text-sky-300 font-medium px-2 py-1 rounded border border-sky-500/30 hover:border-sky-500/50 transition-colors"
                          >
                            + Agregar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      </div>

      {modalSubcat && (
        <ModalTransaccionesSubcat
          grupo={modalSubcat.grupo}
          sub={modalSubcat.sub}
          gastos={gastos}
          mes={mes}
          onCerrar={() => setModalSubcat(null)}
        />
      )}

      {/* Resumen y guardar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex gap-8">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Total previsto</div>
            <div className="text-xl font-mono-numbers font-bold text-sky-400 mt-1">{formatCLP(totalPrevisto)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Resultado previsto</div>
            <div className={`text-xl font-mono-numbers font-bold mt-1 ${
              totalIngresos - totalPrevisto >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {formatCLP(totalIngresos - totalPrevisto)}
            </div>
          </div>
        </div>
        {errorGuardado && (
          <p className="text-sm text-red-400">{errorGuardado}</p>
        )}
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
            guardado
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30'
          } disabled:opacity-60 disabled:cursor-wait`}
        >
          {guardando ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar presupuesto'}
        </button>
      </div>
    </div>
  )
}
