import { useState } from 'react'
import { GRUPOS_PRESUPUESTO } from '../../utils/categorias'
import { getSubcategoriaPresupuesto } from '../../utils/mapeo'
import { formatCLP } from '../../utils/formatters'

const CONTEXTOS_DEFAULT = ['Familia', 'Trabajo', 'Amigos', 'Personal', 'Polola']
const TIPOS_DEFAULT = [
  'A medias', 'Ajuste', 'Auto', 'Comida', 'Deporte', 'Deuda', 'Externo',
  'Mantención', 'Ocio', 'Otro', 'Proyecto', 'Regalo', 'Regalo propio', 'Ropa',
  'Salud', 'Suscripcion', 'Transporte', 'Turno', 'Unknown', 'VA', 'Viaje',
]
const BANCOS_DEFAULT = ['Edwards', 'BICE', 'TC Papa', 'Otro', 'Transferencia', 'Efectivo']

const esUsdPuro = g => g.usd > 0 && !g.monto

export function EditarAsignacion({ gasto, onGuardar, onCerrar, catalogos }) {
  const gruposPresupuesto = catalogos?.gruposPresupuesto && Object.keys(catalogos.gruposPresupuesto).length
    ? catalogos.gruposPresupuesto
    : GRUPOS_PRESUPUESTO
  const todosTipos = catalogos?.tipos?.length ? catalogos.tipos : TIPOS_DEFAULT
  const todosBancos = catalogos?.bancos?.length ? catalogos.bancos : BANCOS_DEFAULT
  const todosContextos = catalogos?.contextos?.length ? catalogos.contextos : CONTEXTOS_DEFAULT

  // Basic fields
  const [fecha, setFecha] = useState(gasto.fecha ?? '')
  const [motivo, setMotivo] = useState(gasto.motivo ?? '')
  const [banco, setBanco] = useState(gasto.banco ?? '')
  const [monto, setMonto] = useState(String(gasto.monto_real ?? gasto.monto ?? ''))
  const [tipos, setTipos] = useState(gasto.tipos ?? [])
  const [contexto, setContexto] = useState(gasto.contexto ?? '')
  const [pagado, setPagado] = useState(!!gasto.pagado)

  // Presupuesto overrides
  const [contextoOverride, setContextoOverride] = useState(gasto.contexto_override ?? '')
  const [grupo, setGrupo] = useState(gasto.presupuesto_manual?.grupo ?? '')
  const [subcategoria, setSubcategoria] = useState(gasto.presupuesto_manual?.subcategoria ?? '')
  const [montoParcial, setMontoParcial] = useState(gasto.monto_presupuesto_manual ?? '')
  const [tipoCambio, setTipoCambio] = useState(
    gasto.monto_clp_manual && gasto.usd ? Math.round(gasto.monto_clp_manual / gasto.usd) : ''
  )

  const autoMap = getSubcategoriaPresupuesto(
    tipos, contextoOverride || contexto, banco,
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
      fecha,
      motivo: motivo.trim(),
      banco,
      tipos,
      contexto,
      monto: montoNum,
      monto_real: montoNum,
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

    // recalculate mes if fecha changed
    if (fecha !== gasto.fecha) {
      changes.mes = fecha.substring(0, 7)
    }

    onGuardar(changes)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
          <h2 className="text-base font-semibold text-slate-200">Editar gasto</h2>
          <button onClick={onCerrar} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Fecha + Motivo */}
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Motivo</label>
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Monto + Banco */}
          <div className="grid grid-cols-2 gap-3">
            {!esUsdPuro(gasto) ? (
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Monto</label>
                <input
                  type="number"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono-numbers text-slate-200 outline-none focus:border-sky-500"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Tipo de cambio</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tipoCambio}
                    onChange={e => setTipoCambio(e.target.value)}
                    placeholder="950"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono-numbers text-slate-200 outline-none focus:border-sky-500"
                  />
                  <span className="text-xs text-slate-500 shrink-0">
                    {tipoCambio > 0 ? formatCLP(Math.round(gasto.usd * Number(tipoCambio))) : `USD ${gasto.usd}`}
                  </span>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Banco</label>
              <select
                value={banco}
                onChange={e => setBanco(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="">Sin banco</option>
                {todosBancos.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* Tipos */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Tipos</label>
            <div className="flex flex-wrap gap-1.5">
              {todosTipos.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTipo(t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    tipos.includes(t)
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500 hover:text-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Contexto */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Contexto</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setContexto('')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  contexto === ''
                    ? 'bg-slate-600/50 text-slate-300 border-slate-500'
                    : 'bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500'
                }`}
              >
                Ninguno
              </button>
              {todosContextos.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setContexto(contexto === c ? '' : c)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    contexto === c
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500 hover:text-slate-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Pagado */}
          <div className="flex items-center justify-between bg-slate-700/20 rounded-lg px-4 py-2.5">
            <span className="text-sm text-slate-400">Estado</span>
            <button
              type="button"
              onClick={() => setPagado(p => !p)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors font-medium ${
                pagado
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-500/70 border-amber-500/20'
              }`}
            >
              {pagado ? 'Pagado' : 'Pendiente'}
            </button>
          </div>

          {/* Divider presupuesto */}
          <div className="border-t border-slate-700/50 pt-4 space-y-4">
            <p className="text-xs text-slate-600 uppercase tracking-wider">Asignación presupuesto</p>

            {/* Contexto override */}
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Override contexto</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setContextoOverride('')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    contextoOverride === ''
                      ? 'bg-slate-600/50 text-slate-300 border-slate-500'
                      : 'bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500'
                  }`}
                >
                  Auto
                </button>
                {todosContextos.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setContextoOverride(contextoOverride === c ? '' : c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      contextoOverride === c
                        ? 'bg-violet-500/20 text-violet-400 border-violet-500/40'
                        : 'bg-slate-700/50 text-slate-500 border-slate-600/50 hover:border-slate-500 hover:text-slate-400'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Categoría presupuesto */}
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Categoría</label>
              {autoMap && !grupo && (
                <div className="text-xs text-slate-500 mb-2">
                  Auto: <span className="text-slate-400">{autoMap.grupo} / {autoMap.subcategoria}</span>
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={grupo}
                  onChange={e => handleGrupoChange(e.target.value)}
                  className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  <option value="">Automático</option>
                  {Object.keys(gruposPresupuesto).map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {grupo && (
                  <select
                    value={subcategoria}
                    onChange={e => setSubcategoria(e.target.value)}
                    className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                  >
                    {(gruposPresupuesto[grupo] || []).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Monto parcial */}
            {!esUsdPuro(gasto) && (
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Monto a presupuestar</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={montoParcial}
                    onChange={e => setMontoParcial(e.target.value)}
                    placeholder={`Total: ${formatCLP(gasto.monto_real ?? gasto.monto)}`}
                    className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 font-mono-numbers"
                  />
                  {montoParcial > 0 && (
                    <span className="text-xs text-slate-500 shrink-0">de {formatCLP(gasto.monto_real ?? gasto.monto)}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-slate-700/50 shrink-0">
          <button
            type="button"
            onClick={onCerrar}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
