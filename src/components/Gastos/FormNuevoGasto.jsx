import { useState } from 'react'
import { TODOS_LOS_TIPOS, BANCOS, GRUPOS_PRESUPUESTO } from '../../utils/categorias'
// Los valores hardcodeados se usan como fallback si no se pasan catalogos como prop
import { formatCLP } from '../../utils/formatters'

const HOY = new Date().toISOString().split('T')[0]
const CONTEXTOS = ['Familia', 'Trabajo', 'Amigos', 'Personal', 'Polola']

const INIT = {
  motivo: '',
  banco: '',
  fecha: HOY,
  moneda: 'CLP',
  monto: '',
  montoUsd: '',
  tipoCambio: '',
  montoParcial: '',
  tipos: [],
  contexto: '',
  grupo: '',
  subcategoria: '',
  pagado: false,
}

export function FormNuevoGasto({ onGuardar, onCerrar, catalogos }) {
  const todosLosTipos = catalogos?.tipos?.length ? catalogos.tipos : TODOS_LOS_TIPOS
  const bancos = catalogos?.bancos?.length ? catalogos.bancos : BANCOS
  const gruposPresupuesto = catalogos?.gruposPresupuesto && Object.keys(catalogos.gruposPresupuesto).length
    ? catalogos.gruposPresupuesto
    : GRUPOS_PRESUPUESTO

  const [form, setForm] = useState(INIT)
  const [error, setError] = useState('')

  function set(field, val) {
    setForm(f => {
      const next = { ...f, [field]: val }
      if (field === 'grupo') next.subcategoria = gruposPresupuesto[val]?.[0] ?? ''
      return next
    })
    setError('')
  }

  function toggleTipo(tipo) {
    set('tipos', form.tipos.includes(tipo)
      ? form.tipos.filter(t => t !== tipo)
      : [...form.tipos, tipo])
  }

  const montoClpUsd = form.montoUsd > 0 && form.tipoCambio > 0
    ? Math.round(Number(form.montoUsd) * Number(form.tipoCambio))
    : null

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.motivo.trim()) return setError('El motivo es obligatorio')
    if (!form.fecha) return setError('La fecha es obligatoria')

    let montoBase, montoReal, usd = 0, monto_clp_manual = null

    if (form.moneda === 'CLP') {
      if (!form.monto || isNaN(Number(form.monto))) return setError('El monto debe ser un número')
      montoBase = Number(form.monto)
      montoReal = montoBase
    } else {
      if (!form.montoUsd || isNaN(Number(form.montoUsd))) return setError('El monto en USD debe ser un número')
      if (!form.tipoCambio || isNaN(Number(form.tipoCambio))) return setError('El tipo de cambio es obligatorio')
      usd = Number(form.montoUsd)
      montoBase = 0
      monto_clp_manual = montoClpUsd
      montoReal = monto_clp_manual
    }

    const parcial = Number(form.montoParcial)

    onGuardar({
      motivo:       form.motivo.trim(),
      banco:        form.banco || '',
      fecha:        form.fecha,
      monto:        montoBase,
      monto_real:   montoReal,
      usd,
      monto_clp_manual,
      monto_presupuesto_manual: parcial > 0 ? parcial : null,
      tipos:        form.tipos,
      contexto:     form.contexto || '',
      presupuesto_manual: form.grupo && form.subcategoria
        ? { grupo: form.grupo, subcategoria: form.subcategoria }
        : null,
      pagado: form.pagado,
    })
    setForm(INIT)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 sticky top-0 bg-[var(--surface)] z-10">
          <h2 className="text-base font-semibold text-slate-200">Nuevo gasto manual</h2>
          <button onClick={onCerrar} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Motivo */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Motivo</label>
            <input
              type="text"
              value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
              placeholder="Ej: Almuerzo con cliente"
              autoFocus
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={e => set('fecha', e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
            />
          </div>

          {/* Moneda + Monto */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Monto</label>
            <div className="flex gap-2 mb-2">
              {['CLP', 'USD'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('moneda', m)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    form.moneda === m
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-slate-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {form.moneda === 'CLP' ? (
              <input
                type="number"
                value={form.monto}
                onChange={e => set('monto', e.target.value)}
                placeholder="15000"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 font-mono-numbers"
              />
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={form.montoUsd}
                      onChange={e => set('montoUsd', e.target.value)}
                      placeholder="USD — ej: 29.90"
                      step="0.01"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 font-mono-numbers"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      value={form.tipoCambio}
                      onChange={e => set('tipoCambio', e.target.value)}
                      placeholder="CLP/USD"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 font-mono-numbers"
                    />
                    <span className="text-xs text-slate-500 shrink-0">CLP/USD</span>
                  </div>
                </div>
                {montoClpUsd && (
                  <div className="text-xs text-slate-400 px-1">
                    = <span className="font-mono-numbers font-bold text-slate-200">{formatCLP(montoClpUsd)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Monto parcial */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
              Monto a presupuestar <span className="text-slate-600 normal-case">(opcional — si solo va una parte)</span>
            </label>
            <input
              type="number"
              value={form.montoParcial}
              onChange={e => set('montoParcial', e.target.value)}
              placeholder="Dejá vacío para usar el total"
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 font-mono-numbers"
            />
          </div>

          {/* Banco */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
              Banco / Medio de pago <span className="text-slate-600 normal-case">(opcional)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {bancos.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set('banco', form.banco === b ? '' : b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    form.banco === b
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-slate-500'
                  }`}
                >
                  {b}
                </button>
              ))}
              <input
                type="text"
                value={!['Edwards','BICE','TC Papa','Otro','Efectivo','Transferencia',''].includes(form.banco) ? form.banco : ''}
                onChange={e => set('banco', e.target.value)}
                placeholder="Otro..."
                className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 w-24"
              />
            </div>
          </div>

          {/* Tipos */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Categoría</label>
            <div className="flex flex-wrap gap-1.5">
              {todosLosTipos.map(tipo => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => toggleTipo(tipo)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                    form.tipos.includes(tipo)
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-slate-500'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
          </div>

          {/* Contexto */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
              Contexto <span className="text-slate-600 normal-case">(opcional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTEXTOS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('contexto', form.contexto === c ? '' : c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.contexto === c
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-slate-500'
                  }`}
                >
                  {c}
                </button>
              ))}
              <input
                type="text"
                value={form.contexto && !CONTEXTOS.includes(form.contexto) ? form.contexto : ''}
                onChange={e => set('contexto', e.target.value)}
                placeholder="Otro..."
                className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 w-24"
              />
            </div>
          </div>

          {/* Presupuesto manual */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
              Categoría presupuesto <span className="text-slate-600 normal-case">(opcional)</span>
            </label>
            <div className="flex gap-2">
              <select
                value={form.grupo}
                onChange={e => set('grupo', e.target.value)}
                className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="">Automático</option>
                {Object.keys(gruposPresupuesto).map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {form.grupo && (
                <select
                  value={form.subcategoria}
                  onChange={e => set('subcategoria', e.target.value)}
                  className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  {(gruposPresupuesto[form.grupo] || []).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Pagado */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.pagado}
              onChange={e => set('pagado', e.target.checked)}
              className="w-4 h-4 rounded accent-sky-500"
            />
            <span className="text-sm text-slate-400">Marcado como pagado</span>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCerrar}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors"
            >
              Guardar gasto
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
