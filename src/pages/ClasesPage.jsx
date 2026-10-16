import { useMemo, useState } from 'react'
import { useClases } from '../hooks/useClases'
import { usePrivacyMode } from '../contexts/PrivacyModeContext'
import { SelectorMes } from '../components/shared/SelectorMes'
import { TablaClases } from '../components/Clases/TablaClases'
import { FormClase } from '../components/Clases/FormClase'
import { DeudaAlumnos } from '../components/Clases/DeudaAlumnos'
import { RegistrarPago } from '../components/Clases/RegistrarPago'
import { PagosRecientes } from '../components/Clases/PagosRecientes'
import { Alumnos } from '../components/Clases/Alumnos'
import { Familias } from '../components/Clases/Familias'
import { CARD, formatHoras } from '../components/Clases/estilos'
import { desplazarPeriodo, formatCiclo, obtenerCicloActual } from '../utils/ciclos'
import { formatMes, getMesActual, privacyFormat } from '../utils/formatters'

const FILTROS = [
  { id: 'todas', label: 'Todas', aplica: () => true },
  { id: 'programada', label: 'Programadas', aplica: c => c.estado === 'programada' },
  { id: 'dictada', label: 'Dictadas', aplica: c => c.estado === 'dictada' },
  { id: 'no_cobrado', label: 'No cobradas', aplica: c => c.estado !== 'cancelada' && c.cobro === 'pendiente' },
  { id: 'pagado', label: 'Pagadas', aplica: c => c.cobro === 'pagado' },
  { id: 'cancelada', label: 'Canceladas', aplica: c => c.estado === 'cancelada' },
]

function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

function Kpi({ titulo, valor, detalle, children }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{titulo}</p>
      <p className="mt-1 text-2xl font-bold font-mono-numbers text-slate-100">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
      {children}
    </div>
  )
}

// Versión angosta de SelectorCiclo para que entre en un KPI en mobile.
function SelectorCicloCompacto({ ciclo, ciclos, onChange }) {
  const idx = ciclos.indexOf(ciclo)
  const boton = 'w-6 h-6 flex items-center justify-center rounded bg-slate-700/60 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed'
  return (
    <div className="mt-2 flex items-center gap-2">
      <button type="button" onClick={() => onChange(ciclos[idx + 1])} disabled={idx < 0 || idx >= ciclos.length - 1} aria-label="Ciclo anterior" className={boton}>←</button>
      <span className="text-xs text-slate-300" title={formatCiclo(ciclo)}>Ciclo {formatMes(ciclo)}</span>
      <button type="button" onClick={() => onChange(ciclos[idx - 1])} disabled={idx <= 0} aria-label="Ciclo siguiente" className={boton}>→</button>
    </div>
  )
}

export function ClasesPage({ ciclos }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const mesActual = getMesActual()
  // Meses calendario navegables: 3 años hacia atrás y 6 meses hacia adelante (más reciente primero).
  const meses = useMemo(
    () => Array.from({ length: 43 }, (_, i) => desplazarPeriodo(mesActual, 6 - i)),
    [mesActual],
  )
  const [mes, setMes] = useState(mesActual)
  const [ciclo, setCiclo] = useState(obtenerCicloActual())
  const [filtro, setFiltro] = useState('todas')
  const [formClase, setFormClase] = useState(null) // null | { clase: null | clase }
  const [cobrando, setCobrando] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)

  const { desde, hasta } = rangoMes(mes)
  const datos = useClases({ desde, hasta, ciclo })
  const { clases, alumnos, familias, resumen, pagos, cargando, error } = datos
  const visibles = clases.filter(FILTROS.find(f => f.id === filtro).aplica)
  const fmt = (n) => privacyFormat(n, isPrivacyModeEnabled)

  async function accion(fn, ...args) {
    setErrorAccion(null)
    try {
      await fn(...args)
    } catch (e) {
      setErrorAccion(e.message)
    }
  }

  function cancelar(clase) {
    if (window.confirm(`¿Cancelar la clase de ${clase.alumno} del ${clase.fecha} a las ${clase.hora_inicio}?`)) {
      accion(datos.cancelar, clase.id)
    }
  }

  function eliminar(clase) {
    if (window.confirm(`¿Eliminar la clase de ${clase.alumno} del ${clase.fecha} a las ${clase.hora_inicio}? Se borra del todo (no queda como cancelada).`)) {
      accion(datos.eliminar, clase.id)
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div>
        <h1 className="font-heading text-3xl text-white">Clases</h1>
        <p className="mt-1 text-sm text-slate-500">
          Agenda y cobro de clases particulares. Al registrar un pago se crea un ingreso real
          "Clases particulares" en el ciclo del mes siguiente a las clases (las de octubre son ingreso de noviembre).
        </p>
      </div>

      {(error || errorAccion) && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorAccion || error}</p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi titulo="Deuda" valor={fmt(resumen?.deuda_total ?? 0)} detalle="Dictado y no cobrado" />
        <Kpi titulo="Dictado del mes" valor={fmt(resumen?.monto_dictado ?? 0)} detalle={`${resumen?.clases_dictadas ?? 0} clases`} />
        <Kpi titulo="Horas dictadas" valor={formatHoras(resumen?.horas_dictadas ?? 0)} detalle={`${formatHoras(resumen?.horas_programadas ?? 0)} programadas`} />
        <Kpi titulo="Ingresos del ciclo" valor={fmt(resumen?.ingresos_ciclo?.total ?? 0)} detalle="Pagos de las clases del mes anterior">
          <SelectorCicloCompacto ciclo={ciclo} ciclos={ciclos} onChange={setCiclo} />
        </Kpi>
      </div>

      {cobrando && (
        <RegistrarPago
          key={cobrando.familia_id != null ? `f${cobrando.familia_id}` : `a${cobrando.alumno_id}`}
          cuenta={cobrando}
          cargarClases={datos.clasesPagables}
          onRegistrar={datos.registrarPago}
          onCerrar={() => setCobrando(null)}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
        <div className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <SelectorMes mes={mes} meses={meses} onChange={setMes} />
            <button
              type="button"
              onClick={() => setFormClase(formClase ? null : { clase: null })}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
            >
              + Agendar clase
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {FILTROS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filtro === f.id
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'text-slate-400 border-slate-600/50 hover:bg-slate-700/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {formClase && (
            <FormClase
              key={formClase.clase?.id ?? 'nueva'}
              clase={formClase.clase}
              alumnos={alumnos}
              onGuardar={(d) => (formClase.clase ? datos.mover(formClase.clase.id, d) : datos.agendar(d))}
              onCerrar={() => setFormClase(null)}
            />
          )}

          {cargando ? (
            <p className="text-sm text-slate-500 text-center py-6">Cargando…</p>
          ) : (
            <TablaClases
              clases={visibles}
              onMarcarDictada={(c) => accion(datos.marcarDictada, c.id)}
              onEditar={(c) => setFormClase({ clase: c })}
              onCancelar={cancelar}
              onEliminar={eliminar}
            />
          )}
        </div>

        <div className="space-y-5">
          <DeudaAlumnos deuda={resumen?.deuda_por_familia} onCobrar={(cuenta) => { setCobrando(cuenta); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
          <PagosRecientes pagos={pagos} onDeshacer={datos.deshacerPago} onConfirmar={datos.confirmarPago} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <Familias familias={familias} onCrear={datos.crearFamilia} onEditar={datos.editarFamilia} onEliminar={datos.eliminarFamilia} />
        <Alumnos alumnos={alumnos} familias={familias} onCrear={datos.crearAlumno} onEditar={datos.editarAlumno} />
      </div>
    </main>
  )
}
