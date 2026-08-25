import { useState } from 'react'
import { formatCLP } from '../../utils/formatters'
import { GRUPOS_PRESUPUESTO } from '../../utils/categorias'
import { calcularAcumuladoFondo, calcularSaldoFondo, esGastoUsdPuro, listarUsosFondo, montoUsoFondo } from '../../utils/calculos'
import { resolverDesdeVinculado, vinculadoCambioUbicacion } from '../../utils/fondos'

const ICONS_DEFAULT = { 'Mantenimiento Auto': '🔧', 'Patente Auto': '📋', 'Viajes': '✈️' }

const EMOJIS = ['💰', '🚗', '✈️', '🏠', '🎓', '💍', '🔧', '📋', '🏖️', '💻', '🎯', '🏥']

function mesesHastaMeta(fechaMeta, mesReferencia) {
  if (!fechaMeta || !mesReferencia) return null
  const [ay, am] = mesReferencia.split('-').map(Number)
  const [by, bm] = fechaMeta.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

function FormFondo({
  modo = 'crear',
  fondoInicial = null,
  nombreInicial = '',
  onGuardar,
  onCerrar,
  gruposPresupuesto = GRUPOS_PRESUPUESTO,
  mes,
  acumuladoSiDesvincula,
}) {
  const esEditar = modo === 'editar'
  const [form, setForm] = useState(() => ({
    nombre: nombreInicial,
    emoji: fondoInicial?.emoji || '💰',
    objetivo: fondoInicial?.objetivo ? String(fondoInicial.objetivo) : '',
    aporte: fondoInicial?.previsto_aportar ? String(fondoInicial.previsto_aportar) : '',
    acumulado: fondoInicial?.acumulado != null ? String(fondoInicial.acumulado) : '',
    fecha_meta: fondoInicial?.fecha_meta || '',
    grupo: fondoInicial?.vinculado?.grupo || '',
    subcategoria: fondoInicial?.vinculado?.subcategoria || '',
  }))

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'grupo' || k === 'subcategoria') {
        const vinculado = Boolean(next.grupo && next.subcategoria)
        if (!vinculado && esEditar && fondoInicial?.vinculado && acumuladoSiDesvincula != null) {
          next.acumulado = String(acumuladoSiDesvincula)
        }
      }
      return next
    })
  }

  const grupos = Object.keys(gruposPresupuesto)
  const subcategorias = form.grupo ? (gruposPresupuesto[form.grupo] || []) : []
  const esVinculado = Boolean(form.grupo && form.subcategoria)
  const vinculadoAnterior = fondoInicial?.vinculado || null
  const vinculadoNuevo = esVinculado
    ? {
        grupo: form.grupo,
        subcategoria: form.subcategoria,
        desde: resolverDesdeVinculado({ mes, vinculadoAnterior, vinculadoNuevo: { grupo: form.grupo, subcategoria: form.subcategoria } }),
      }
    : null

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    const payload = {
      nombre: form.nombre.trim(),
      emoji: form.emoji,
      objetivo: Number(form.objetivo) || 0,
      previsto_aportar: Number(form.aporte) || 0,
      fecha_meta: form.fecha_meta || null,
      vinculado: vinculadoNuevo,
      vinculadoAnterior,
    }
    if (!esVinculado) {
      payload.acumulado = Number(form.acumulado) || 0
    } else if (esEditar && fondoInicial) {
      payload.acumulado = fondoInicial.acumulado || 0
    } else {
      payload.acumulado = 0
    }
    onGuardar(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-base font-semibold text-slate-200">
            {esEditar ? 'Editar fondo de ahorro' : 'Nuevo fondo de ahorro'}
          </h2>
          <button onClick={onCerrar} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Emoji + Nombre */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Nombre</label>
            <div className="flex gap-2">
              <div className="relative">
                <select
                  value={form.emoji}
                  onChange={e => set('emoji', e.target.value)}
                  className="appearance-none bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-lg outline-none focus:border-sky-500 cursor-pointer"
                >
                  {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                </select>
              </div>
              <input
                type="text"
                value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Ej: Fondo Emergencia"
                autoFocus
                className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Meta + Aporte */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Meta</label>
              <input
                type="number"
                value={form.objetivo}
                onChange={e => set('objetivo', e.target.value)}
                placeholder="500000"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono-numbers text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Aporte/ciclo</label>
              <input
                type="number"
                value={form.aporte}
                onChange={e => set('aporte', e.target.value)}
                placeholder="40000"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono-numbers text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Fecha meta */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
              Fecha meta <span className="text-slate-600 normal-case">(opcional)</span>
            </label>
            <input
              type="month"
              value={form.fecha_meta}
              onChange={e => set('fecha_meta', e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
            />
          </div>

          {/* Saldo manual (solo si no está vinculado al presupuesto) */}
          {!esVinculado && (
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Saldo acumulado</label>
              <input
                type="number"
                value={form.acumulado}
                onChange={e => set('acumulado', e.target.value)}
                placeholder="0"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono-numbers text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
          )}

          {/* Vinculado al presupuesto */}
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
              Vinculado al presupuesto <span className="text-slate-600 normal-case">(opcional)</span>
            </label>
            <div className="flex gap-2">
              <select
                value={form.grupo}
                onChange={e => set('grupo', e.target.value) || set('subcategoria', '')}
                className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
              >
                <option value="">Sin vincular</option>
                {grupos.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {form.grupo && (
                <select
                  value={form.subcategoria}
                  onChange={e => set('subcategoria', e.target.value)}
                  className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  <option value="">Subcategoría</option>
                  {subcategorias.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
            {esEditar && vinculadoAnterior && vinculadoNuevo && vinculadoCambioUbicacion(vinculadoAnterior, vinculadoNuevo) && (
              <p className="text-xs text-amber-500/90 mt-1.5">
                Al cambiar la línea del presupuesto, los gastos con asignación manual se moverán y el acumulado automático contará desde {mes}.
              </p>
            )}
          </div>

          {/* Preview */}
          {form.objetivo && (form.aporte || form.fecha_meta) && (() => {
            const objetivoNum = Number(form.objetivo) || 0
            const aporteNum = Number(form.aporte) || 0
            const acumuladoEstimado = esVinculado
              ? (esEditar ? (acumuladoSiDesvincula ?? fondoInicial?.acumulado ?? 0) : 0)
              : Number(form.acumulado) || 0
            const faltaMeta = Math.max(objetivoNum - acumuladoEstimado, 0)
            const mesesMeta = form.fecha_meta ? mesesHastaMeta(form.fecha_meta, mes) : null
            const necesario = mesesMeta != null && mesesMeta > 0 && faltaMeta > 0
              ? Math.ceil(faltaMeta / mesesMeta)
              : null
            return (
              <div className="bg-slate-700/30 rounded-lg px-4 py-2.5 text-xs text-slate-400 space-y-0.5">
                <div>Meta: <span className="font-mono-numbers text-slate-200">{formatCLP(objetivoNum)}</span></div>
                {aporteNum > 0 && faltaMeta > 0 && (
                  <div>
                    Tiempo estimado:{' '}
                    <span className="text-slate-200">~{Math.ceil(faltaMeta / aporteNum)} ciclos</span>
                  </div>
                )}
                {necesario != null && (
                  <div>
                    Aporte necesario:{' '}
                    <span className="font-mono-numbers text-slate-200">{formatCLP(necesario)}/ciclo</span>
                    {aporteNum > 0 && necesario > aporteNum && (
                      <span className="text-amber-500/90"> (más que tu aporte actual)</span>
                    )}
                  </div>
                )}
                {form.fecha_meta && mesesMeta != null && mesesMeta <= 0 && faltaMeta > 0 && (
                  <div className="text-amber-500/90">La fecha meta ya pasó</div>
                )}
              </div>
            )
          })()}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCerrar}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
              {esEditar ? 'Guardar cambios' : 'Crear fondo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function gastosVinculables(gastos, mes) {
  const delCiclo = []
  const otros = []
  for (const g of gastos) {
    if (esGastoUsdPuro(g) || g.estado === 'descartado' || g.financiado_por) continue
    if (g.ciclo_financiero === mes) delCiclo.push(g)
    else otros.push(g)
  }
  const porFecha = (a, b) => (b.fecha || '').localeCompare(a.fecha || '')
  return [...delCiclo.sort(porFecha), ...otros.sort(porFecha)].slice(0, 40)
}

function TarjetaFondo({
  nombre, fondo, onAportar, onEliminar, onEditar, onCrearGasto, onActualizarGasto,
  onArchivar, onReabrir, mes, gastos = [], gruposPresupuesto = GRUPOS_PRESUPUESTO,
}) {
  const [modo, setModo] = useState(null)
  const [monto, setMonto] = useState('')
  const [formAporte, setFormAporte] = useState(null)
  const [formUso, setFormUso] = useState(null)
  const [confirmEliminar, setConfirmEliminar] = useState(false)

  const cerrado = fondo.estado === 'cerrado'
  const esAuto = Boolean(fondo.vinculado)
  const { aportes, usado, saldo } = calcularSaldoFondo(fondo, nombre, gastos)
  const usos = listarUsosFondo(gastos, nombre)
  const objetivo = fondo.objetivo || 0
  const aportar = fondo.previsto_aportar || 0
  const pct = objetivo > 0 ? Math.min((aportes / objetivo) * 100, 100) : 0
  const faltante = Math.max(objetivo - aportes, 0)
  const mesesRestantes = aportar > 0 && faltante > 0 ? Math.ceil(faltante / aportar) : null
  const mesesHasta = mesesHastaMeta(fondo.fecha_meta, mes)
  const aporteNecesario = objetivo > 0 && faltante > 0 && mesesHasta != null && mesesHasta > 0
    ? Math.ceil(faltante / mesesHasta)
    : null
  const metaVencida = objetivo > 0 && faltante > 0 && fondo.fecha_meta && mesesHasta != null && mesesHasta <= 0
  const aporteInsuficiente = aporteNecesario != null && aporteNecesario > aportar
  const emoji = fondo.emoji || ICONS_DEFAULT[nombre] || '💰'
  const grupos = Object.keys(gruposPresupuesto)
  const candidatos = gastosVinculables(gastos, mes)

  const hoy = new Date().toISOString().slice(0, 10)

  function abrirFormAporte() {
    setFormUso(null)
    setModo(null)
    setFormAporte({ monto: '', motivo: `Aporte ${nombre}`, fecha: hoy })
  }

  function abrirFormUso() {
    setFormAporte(null)
    setModo(null)
    setFormUso({
      tipo: 'existente',
      gastoId: '',
      monto: '',
      motivo: '',
      fecha: hoy,
      grupo: '',
      subcategoria: '',
    })
  }

  function handleCrearGasto(e) {
    e.preventDefault()
    const valor = Number(formAporte.monto)
    if (!valor || valor <= 0) return
    onCrearGasto({
      fecha: formAporte.fecha,
      motivo: formAporte.motivo || `Aporte ${nombre}`,
      monto: valor,
      monto_real: valor,
      tipos: [],
      banco: '',
      contexto: '',
      presupuesto_manual: fondo.vinculado,
    })
    setFormAporte(null)
  }

  function handleGuardar(e) {
    e.preventDefault()
    const valor = Number(monto)
    if (isNaN(valor) || valor < 0) return
    onAportar(nombre, aportes + valor)
    setModo(null)
    setMonto('')
  }

  function handleUsar(e) {
    e.preventDefault()
    if (!formUso) return
    if (formUso.tipo === 'existente') {
      if (!formUso.gastoId || !onActualizarGasto) return
      onActualizarGasto(formUso.gastoId, { financiado_por: nombre })
      setFormUso(null)
      return
    }
    const valor = Number(formUso.monto)
    if (!valor || valor <= 0 || !onCrearGasto) return
    onCrearGasto({
      fecha: formUso.fecha,
      motivo: formUso.motivo || `Uso ${nombre}`,
      monto: valor,
      monto_real: valor,
      tipos: [],
      banco: '',
      contexto: '',
      presupuesto_manual: formUso.grupo && formUso.subcategoria
        ? { grupo: formUso.grupo, subcategoria: formUso.subcategoria }
        : null,
      financiado_por: nombre,
    })
    setFormUso(null)
  }

  function handleDesvincularUso(gastoId) {
    if (!onActualizarGasto) return
    onActualizarGasto(gastoId, { financiado_por: null })
  }

  return (
    <div className="bg-slate-700/30 border border-slate-700/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none shrink-0">{emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{nombre}</div>
            {fondo.vinculado && (
              <div className="text-xs text-slate-600 truncate">
                {fondo.vinculado.grupo} / {fondo.vinculado.subcategoria}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEditar}
            className="text-xs px-2 py-1 rounded-lg border bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-slate-500 hover:text-slate-300 transition-colors"
            title="Editar fondo"
          >
            ✎
          </button>
          {!cerrado && (
            <>
              {esAuto ? (
                <button
                  onClick={() => formAporte ? setFormAporte(null) : abrirFormAporte()}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors font-medium ${
                    formAporte
                      ? 'bg-slate-600/50 text-slate-400 border-slate-600'
                      : 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
                  }`}>
                  + Aportar
                </button>
              ) : (
                <button onClick={() => { setFormUso(null); setModo(modo ? null : 'aportar') }}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors font-medium ${
                    modo
                      ? 'bg-slate-600/50 text-slate-400 border-slate-600'
                      : 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
                  }`}>
                  + Aportar
                </button>
              )}
              <button
                onClick={() => formUso ? setFormUso(null) : abrirFormUso()}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors font-medium ${
                  formUso
                    ? 'bg-slate-600/50 text-slate-400 border-slate-600'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                Usar
              </button>
            </>
          )}
          {cerrado ? (
            <button
              onClick={() => onReabrir(nombre)}
              className="text-xs px-2 py-1 rounded-lg border bg-slate-700/50 text-slate-400 border-slate-600/50 hover:border-sky-500/40 hover:text-sky-300 transition-colors"
            >
              Reabrir
            </button>
          ) : (
            <button onClick={() => setConfirmEliminar(true)}
              className="text-xs px-2 py-1 rounded-lg border border-slate-700/50 text-slate-700 hover:text-red-400 hover:border-red-500/30 transition-colors">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Confirm eliminar */}
      {confirmEliminar && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-xs text-red-400">¿Eliminar este fondo? Si ya lo usaste, archivá para conservar el historial.</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmEliminar(false)} className="text-xs text-slate-400 hover:text-slate-200">Cancelar</button>
            <button onClick={() => onEliminar(nombre)} className="text-xs text-red-400 font-medium hover:text-red-300">Eliminar</button>
          </div>
        </div>
      )}

      {/* Form auto: crear gasto */}
      {formAporte && (
        <form onSubmit={handleCrearGasto} className="space-y-2 pt-1 border-t border-slate-700/40">
          <div className="flex gap-2">
            <input
              type="number"
              value={formAporte.monto}
              onChange={e => setFormAporte(f => ({ ...f, monto: e.target.value }))}
              placeholder="Monto"
              autoFocus
              required
              className="flex-1 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-mono-numbers text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500"
            />
            <input
              type="date"
              value={formAporte.fecha}
              onChange={e => setFormAporte(f => ({ ...f, fecha: e.target.value }))}
              className="bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-sky-500"
            />
          </div>
          <input
            type="text"
            value={formAporte.motivo}
            onChange={e => setFormAporte(f => ({ ...f, motivo: e.target.value }))}
            placeholder="Motivo"
            className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-sky-500"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setFormAporte(null)}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
              Agregar gasto
            </button>
          </div>
        </form>
      )}

      {/* Form manual: aporte rápido */}
      {modo && (
        <form onSubmit={handleGuardar} className="space-y-1.5">
          <label className="text-xs text-slate-500">Cuánto aportás</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="40000"
              autoFocus
              className="flex-1 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-mono-numbers text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500"
            />
            <button type="submit"
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
              Guardar
            </button>
          </div>
          {Number(monto) > 0 && (
            <div className="text-xs text-slate-500 px-1">
              Saldo nuevo: <span className="font-mono-numbers text-slate-300">{formatCLP(aportes + Number(monto))}</span>
            </div>
          )}
        </form>
      )}

      {formUso && (
        <form onSubmit={handleUsar} className="space-y-2 pt-1 border-t border-slate-700/40">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setFormUso(f => ({ ...f, tipo: 'existente' }))}
              className={`flex-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
                formUso.tipo === 'existente'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'text-slate-500 border-slate-700/50 hover:text-slate-300'
              }`}
            >
              Gasto existente
            </button>
            <button
              type="button"
              onClick={() => setFormUso(f => ({ ...f, tipo: 'nuevo' }))}
              className={`flex-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
                formUso.tipo === 'nuevo'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'text-slate-500 border-slate-700/50 hover:text-slate-300'
              }`}
            >
              Nuevo gasto
            </button>
          </div>
          {formUso.tipo === 'existente' ? (
            candidatos.length === 0 ? (
              <p className="text-xs text-slate-500">No hay gastos sin financiar para vincular. Creá uno nuevo o marcá uno desde Editar gasto.</p>
            ) : (
              <select
                value={formUso.gastoId}
                onChange={e => setFormUso(f => ({ ...f, gastoId: e.target.value }))}
                required
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-amber-500"
              >
                <option value="">Elegí un gasto…</option>
                {candidatos.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.fecha} · {g.motivo} · {formatCLP(g.monto_real ?? g.monto ?? 0)}
                  </option>
                ))}
              </select>
            )
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formUso.monto}
                  onChange={e => setFormUso(f => ({ ...f, monto: e.target.value }))}
                  placeholder="Monto"
                  autoFocus
                  required
                  className="flex-1 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-mono-numbers text-slate-200 placeholder-slate-600 outline-none focus:border-amber-500"
                />
                <input
                  type="date"
                  value={formUso.fecha}
                  onChange={e => setFormUso(f => ({ ...f, fecha: e.target.value }))}
                  className="bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-amber-500"
                />
              </div>
              <input
                type="text"
                value={formUso.motivo}
                onChange={e => setFormUso(f => ({ ...f, motivo: e.target.value }))}
                placeholder={`Uso ${nombre}`}
                className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-amber-500"
              />
              <div className="flex gap-2">
                <select
                  value={formUso.grupo}
                  onChange={e => setFormUso(f => ({ ...f, grupo: e.target.value, subcategoria: '' }))}
                  className="flex-1 bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-amber-500"
                >
                  <option value="">Categoría</option>
                  {grupos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {formUso.grupo && (
                  <select
                    value={formUso.subcategoria}
                    onChange={e => setFormUso(f => ({ ...f, subcategoria: e.target.value }))}
                    className="flex-1 bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-amber-500"
                  >
                    <option value="">Subcategoría</option>
                    {(gruposPresupuesto[formUso.grupo] || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              {fondo.vinculado && formUso.grupo === fondo.vinculado.grupo && formUso.subcategoria === fondo.vinculado.subcategoria && (
                <p className="text-xs text-amber-400">Si lo asignás a la línea de ahorro, no va a la categoría del gasto real.</p>
              )}
            </>
          )}
          {Number(formUso.monto) > saldo && formUso.tipo === 'nuevo' && (
            <p className="text-xs text-amber-400">El uso supera el saldo ({formatCLP(saldo)}).</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setFormUso(null)}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors">
              {formUso.tipo === 'existente' ? 'Vincular gasto' : 'Registrar uso'}
            </button>
          </div>
        </form>
      )}

      {/* Balance */}
      <div className="space-y-1">
        <div className="flex items-end justify-between">
          <span className="font-mono-numbers text-lg font-bold text-sky-400">{formatCLP(saldo)}</span>
          {objetivo > 0 && (
            <span className="font-mono-numbers text-xs text-slate-500">/ {formatCLP(objetivo)}</span>
          )}
        </div>
        {usado > 0 && (
          <div className="text-xs text-slate-500">
            Usado <span className="font-mono-numbers text-amber-400/90">{formatCLP(usado)}</span>
            <span className="text-slate-600"> · ahorrado {formatCLP(aportes)}</span>
          </div>
        )}
        {objetivo > 0 && (
          <>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#22c55e' : pct >= 60 ? '#38bdf8' : '#818cf8' }} />
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>{Math.round(pct)}% ahorrado</span>
              {faltante > 0 && <span>Faltan {formatCLP(faltante)}</span>}
            </div>
          </>
        )}
      </div>

      {/* Ritmo necesario para la fecha meta */}
      {aporteNecesario != null && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          aporteInsuficiente
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          {aporteInsuficiente ? (
            <>Necesitás <span className="font-mono-numbers font-semibold">{formatCLP(aporteNecesario)}</span>/ciclo para llegar en {fondo.fecha_meta} — hoy aportás {formatCLP(aportar)}</>
          ) : (
            <>Vas bien: con {formatCLP(aportar)}/ciclo cubrís los <span className="font-mono-numbers font-semibold">{formatCLP(aporteNecesario)}</span>/ciclo necesarios</>
          )}
        </div>
      )}
      {metaVencida && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
          La fecha meta ({fondo.fecha_meta}) ya pasó y faltan {formatCLP(faltante)}
        </div>
      )}

      {/* Footer */}
      <div className="pt-1 border-t border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-slate-600">
          {aportar > 0 ? `+${formatCLP(aportar)}/ciclo` : 'Sin aporte previsto'}
        </span>
        <div className="flex items-center gap-2">
          {fondo.fecha_meta && (
            <span className="text-xs text-slate-500">
              Meta: {fondo.fecha_meta}
              {mesesHasta != null && mesesHasta > 0 && (
                <span className="text-slate-600"> ({mesesHasta}m)</span>
              )}
            </span>
          )}
          {mesesRestantes != null && !fondo.fecha_meta && (
            <span className="text-xs text-slate-500">~{mesesRestantes} {mesesRestantes === 1 ? 'ciclo' : 'ciclos'}</span>
          )}
          {pct >= 100 && <span className="text-xs text-emerald-400 font-medium">Meta alcanzada</span>}
          {cerrado && <span className="text-xs text-slate-500 font-medium">Archivado</span>}
        </div>
      </div>

      {usos.length > 0 && (
        <div className="pt-1 border-t border-slate-700/40 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-600">Usos</div>
          {usos.slice(0, 5).map(g => (
            <div key={g.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-400" title={g.motivo}>{g.fecha} · {g.motivo}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono-numbers text-amber-400/90">{formatCLP(montoUsoFondo(g))}</span>
                {!cerrado && onActualizarGasto && (
                  <button
                    type="button"
                    onClick={() => handleDesvincularUso(g.id)}
                    className="text-slate-600 hover:text-red-400"
                    title="Dejar de financiar con este fondo"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!cerrado && (
        <button
          type="button"
          onClick={() => onArchivar(nombre)}
          className="w-full text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          Archivar fondo
        </button>
      )}
    </div>
  )
}

export function FondosAhorro({ presupuestoMes, mes, onGuardarPresupuesto, catalogos, gastos = [], onAgregarGasto, onRefetchGastos, onActualizarGasto }) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null) // nombre del fondo
  const [guardando, setGuardando] = useState(false)
  const [errorLocal, setErrorLocal] = useState(null)
  const [mostrarCerrados, setMostrarCerrados] = useState(false)
  const fondos = presupuestoMes?.fondos || {}
  const fondosActivos = Object.entries(fondos).filter(([, f]) => f.estado !== 'cerrado')
  const fondosCerrados = Object.entries(fondos).filter(([, f]) => f.estado === 'cerrado')

  async function guardarFondos(nuevosFondos, fondoCambios = null) {
    setErrorLocal(null)
    setGuardando(true)
    const payload = { ...presupuestoMes, fondos: nuevosFondos }
    if (fondoCambios?.length) payload.fondo_cambios = fondoCambios

    const result = await onGuardarPresupuesto(mes, payload)
    setGuardando(false)

    if (!result?.ok) {
      setErrorLocal('No se pudo guardar el fondo. Revisá la conexión e intentá de nuevo.')
      return false
    }
    if (result.gastosActualizados > 0 && onRefetchGastos) {
      await onRefetchGastos()
    }
    return true
  }

  function datosFondoDesdeForm(datos) {
    const { nombre, ...resto } = datos
    delete resto.vinculadoAnterior
    return { nombre, datos: resto }
  }

  async function handleAportar(nombre, nuevoSaldo) {
    await guardarFondos({ ...fondos, [nombre]: { ...fondos[nombre], acumulado: nuevoSaldo } })
  }

  async function handleEliminar(nombre) {
    const nuevosFondos = { ...fondos }
    delete nuevosFondos[nombre]
    await guardarFondos(nuevosFondos)
  }

  async function handleCrear(datos) {
    const { nombre, datos: resto } = datosFondoDesdeForm(datos)
    if (fondos[nombre]) {
      setErrorLocal(`Ya existe un fondo llamado «${nombre}».`)
      return
    }
    const ok = await guardarFondos({ ...fondos, [nombre]: { ...resto, estado: 'activo' } })
    if (ok) setCreando(false)
  }

  async function handleEditar(nombreAnterior, datos) {
    const { nombre, datos: resto } = datosFondoDesdeForm(datos)
    const fondoPrevio = fondos[nombreAnterior]

    if (nombre !== nombreAnterior && fondos[nombre]) {
      setErrorLocal(`Ya existe un fondo llamado «${nombre}».`)
      return
    }

    // Al desvincular, conservar el saldo que mostraba el fondo automático
    if (fondoPrevio?.vinculado && !resto.vinculado) {
      resto.acumulado = calcularAcumuladoFondo(gastos, fondoPrevio.vinculado)
    }

    const nuevosFondos = { ...fondos }
    if (nombreAnterior !== nombre) delete nuevosFondos[nombreAnterior]
    nuevosFondos[nombre] = { ...fondoPrevio, ...resto, estado: fondoPrevio.estado || 'activo' }

    const fondoCambios = []
    if (nombre !== nombreAnterior) {
      fondoCambios.push({ nombreAnterior, nombreNuevo: nombre })
    }
    if (
      datos.vinculadoAnterior &&
      resto.vinculado &&
      vinculadoCambioUbicacion(datos.vinculadoAnterior, resto.vinculado)
    ) {
      fondoCambios.push({
        vinculadoAnterior: {
          grupo: datos.vinculadoAnterior.grupo,
          subcategoria: datos.vinculadoAnterior.subcategoria,
        },
        vinculadoNuevo: {
          grupo: resto.vinculado.grupo,
          subcategoria: resto.vinculado.subcategoria,
        },
      })
    }

    const ok = await guardarFondos(nuevosFondos, fondoCambios)
    if (ok) setEditando(null)
  }

  async function handleArchivar(nombre) {
    await guardarFondos({ ...fondos, [nombre]: { ...fondos[nombre], estado: 'cerrado' } })
  }

  async function handleReabrir(nombre) {
    await guardarFondos({ ...fondos, [nombre]: { ...fondos[nombre], estado: 'activo' } })
  }

  function renderTarjeta(nombre, f) {
    return (
      <TarjetaFondo
        key={nombre}
        nombre={nombre}
        fondo={f}
        mes={mes}
        gastos={gastos}
        gruposPresupuesto={catalogos?.gruposPresupuesto}
        onAportar={handleAportar}
        onEliminar={handleEliminar}
        onEditar={() => setEditando(nombre)}
        onCrearGasto={onAgregarGasto}
        onActualizarGasto={onActualizarGasto}
        onArchivar={handleArchivar}
        onReabrir={handleReabrir}
      />
    )
  }

  return (
    <>
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        {(errorLocal || guardando) && (
          <div className={`mb-3 text-xs px-3 py-2 rounded-lg border ${guardando ? 'text-slate-400 border-slate-600/50 bg-slate-700/30' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
            {guardando ? 'Guardando…' : errorLocal}
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Fondos de ahorro</h3>
          <button
            onClick={() => setCreando(true)}
            className="text-xs px-3 py-1.5 rounded-lg border bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20 transition-colors font-medium"
          >
            + Nuevo fondo
          </button>
        </div>
        {fondosActivos.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-4">
            {fondosCerrados.length > 0 ? 'No hay fondos activos. Reabrí uno archivado o creá uno nuevo.' : 'No hay fondos. Creá uno con el botón de arriba.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {fondosActivos.map(([nombre, f]) => renderTarjeta(nombre, f))}
          </div>
        )}
        {fondosCerrados.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700/40">
            <button
              type="button"
              onClick={() => setMostrarCerrados(v => !v)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {mostrarCerrados ? 'Ocultar archivados' : `Mostrar ${fondosCerrados.length} fondo${fondosCerrados.length === 1 ? '' : 's'} archivado${fondosCerrados.length === 1 ? '' : 's'}`}
            </button>
            {mostrarCerrados && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 opacity-80">
                {fondosCerrados.map(([nombre, f]) => renderTarjeta(nombre, f))}
              </div>
            )}
          </div>
        )}
      </div>

      {creando && (
        <FormFondo
          modo="crear"
          onGuardar={handleCrear}
          onCerrar={() => setCreando(false)}
          gruposPresupuesto={catalogos?.gruposPresupuesto}
          mes={mes}
        />
      )}

      {editando && fondos[editando] && (
        <FormFondo
          modo="editar"
          nombreInicial={editando}
          fondoInicial={fondos[editando]}
          acumuladoSiDesvincula={
            fondos[editando].vinculado
              ? calcularAcumuladoFondo(gastos, fondos[editando].vinculado)
              : undefined
          }
          onGuardar={datos => handleEditar(editando, datos)}
          onCerrar={() => setEditando(null)}
          gruposPresupuesto={catalogos?.gruposPresupuesto}
          mes={mes}
        />
      )}
    </>
  )
}
