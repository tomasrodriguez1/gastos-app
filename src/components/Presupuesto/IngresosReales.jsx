import { useState } from 'react'
import { formatCLP, formatFecha } from '../../utils/formatters'
import { calcularTotalIngresosReales } from '../../utils/calculos'
import { useIngresos } from '../../hooks/useIngresos'

export function IngresosReales({ ciclo, fuentesSugeridas = [] }) {
  const { ingresos, cargando, error, crear, eliminar } = useIngresos(ciclo)
  const [form, setForm] = useState(null)
  const [errorForm, setErrorForm] = useState(null)
  const hoy = new Date().toISOString().slice(0, 10)

  const total = calcularTotalIngresosReales(ingresos)

  function abrirForm() {
    setErrorForm(null)
    setForm({ fecha: hoy, fuente: fuentesSugeridas[0] || '', monto: '', nota: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorForm(null)
    try {
      await crear({
        fecha: form.fecha,
        fuente: form.fuente.trim(),
        monto: Number(form.monto),
        nota: form.nota.trim() || null,
      })
      setForm(null)
    } catch (err) {
      setErrorForm(err.message)
    }
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Ingresos reales</h3>
        <button
          onClick={() => form ? setForm(null) : abrirForm()}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
            form ? 'bg-slate-600/50 text-slate-400 border-slate-600' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
          }`}
        >
          + Registrar ingreso
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {form && (
        <form onSubmit={handleSubmit} className="space-y-2 pb-3 mb-3 border-b border-slate-700/40">
          {errorForm && <p className="text-xs text-red-400">{errorForm}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              list="fuentes-ingreso"
              value={form.fuente}
              onChange={e => setForm(f => ({ ...f, fuente: e.target.value }))}
              placeholder="Fuente (ej: Sueldo)"
              required
              autoFocus
              className="flex-1 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-emerald-500"
            />
            <datalist id="fuentes-ingreso">
              {fuentesSugeridas.map(f => <option key={f} value={f} />)}
            </datalist>
            <input
              type="number"
              value={form.monto}
              onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
              placeholder="Monto"
              required
              className="w-32 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-mono-numbers text-slate-200 placeholder-slate-600 outline-none focus:border-emerald-500"
            />
            <input
              type="date"
              value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              className="bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-500"
            />
          </div>
          <input
            type="text"
            value={form.nota}
            onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
            placeholder="Nota (opcional)"
            className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-emerald-500"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="flex-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
              Registrar
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <p className="text-sm text-slate-600 text-center py-2">Cargando…</p>
      ) : ingresos.length === 0 ? (
        <p className="text-sm text-slate-600 text-center py-2">Sin ingresos registrados este ciclo.</p>
      ) : (
        <div className="space-y-1.5">
          {ingresos.map(i => (
            <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 truncate">
                <span className="text-slate-300">{i.fuente}</span>
                <span className="text-slate-600 text-xs"> · {formatFecha(i.fecha)}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono-numbers text-emerald-400">{formatCLP(i.monto)}</span>
                <button type="button" onClick={() => eliminar(i.id)} className="text-slate-600 hover:text-red-400" title="Eliminar">×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2 mt-2 border-t border-slate-700/50">
        <span className="text-sm font-medium text-slate-300">Total real</span>
        <span className="font-mono-numbers font-bold text-emerald-400">{formatCLP(total)}</span>
      </div>
    </div>
  )
}
