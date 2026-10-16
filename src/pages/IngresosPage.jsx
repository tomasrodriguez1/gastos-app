import { useState } from 'react'
import { SelectorCiclo } from '../components/shared/SelectorCiclo'
import { PorAprobar } from '../components/Ingresos/PorAprobar'
import { ResumenCiclo } from '../components/Ingresos/ResumenCiclo'
import { FormIngreso } from '../components/Ingresos/FormIngreso'
import { ListaIngresos } from '../components/Ingresos/ListaIngresos'
import { RepartirIngreso } from '../components/Ingresos/RepartirIngreso'
import { Fuentes } from '../components/Ingresos/Fuentes'
import { useFuentesIngreso, useIngresos, usePendientesIngresos, useResumenIngresos } from '../hooks/useIngresos'
import { useReservas } from '../hooks/useReservas'
import { desplazarPeriodo, obtenerCicloActual } from '../utils/ciclos'
import { hoyLocalISO } from '../utils/vencimientosTarjeta'

// Ingresos del ciclo (DEC-020): lo que registra una IA (agente, MCP, pagos de clases) queda por
// aprobar acá y no cuenta hasta que se aprueba; el resto se carga a mano y queda confirmado.
export function IngresosPage({ ciclos, obtenerPresupuesto, reconciliacion, vencimientos }) {
  const cicloActual = obtenerCicloActual()
  const lista = [...new Set([desplazarPeriodo(cicloActual, 1), ...ciclos])].sort().reverse()
  const [ciclo, setCiclo] = useState(cicloActual)
  const [repartiendo, setRepartiendo] = useState(null)

  const { resumen, error: errorResumen } = useResumenIngresos(ciclo)
  const { ingresos, error, crear, editar, eliminar } = useIngresos(ciclo)
  const { pendientes, aprobar, descartar } = usePendientesIngresos()
  const { fuentes, crear: crearFuente, editar: editarFuente } = useFuentesIngreso()
  const { reservas } = useReservas()

  // Nombres sugeridos para "Uso de fondos": reservas externas y fondos de ahorro del presupuesto.
  const fondosSugeridos = [...new Set([
    ...reservas.filter(r => r.activa !== false).map(r => r.nombre),
    ...Object.keys(obtenerPresupuesto(ciclo)?.fondos || {}),
  ])]

  // Fondos de ahorro manuales con aporte previsto en el ciclo del ingreso (los vinculados se alimentan
  // solos con los gastos de su categoría). Si ese ciclo aún no tiene presupuesto, se usa el actual.
  function fondosParaRepartir(cicloIngreso) {
    const deCiclo = c => Object.entries(obtenerPresupuesto(c)?.fondos || {})
      .filter(([, f]) => !f.vinculado && f.estado !== 'cerrado' && (f.previsto_aportar || 0) > 0)
      .map(([nombre, f]) => ({ nombre, emoji: f.emoji, previsto: f.previsto_aportar }))
    const propios = deCiclo(cicloIngreso || cicloActual)
    return propios.length ? propios : deCiclo(cicloActual)
  }

  async function aportarFondoAhorro(nombre, monto, nota) {
    const res = await fetch(`/api/fondos-ahorro/${encodeURIComponent(nombre)}/movimientos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: hoyLocalISO(), monto, tipo: 'aporte', nota }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `No se pudo aportar a ${nombre}`)
  }

  // Al aprobar se ofrece repartir lo que entró (salvo "Uso de fondos": no es plata nueva).
  async function aprobarYOfrecerReparto(id) {
    const pendiente = pendientes.find(p => p.id === id)
    const resultado = await aprobar(id)
    if (pendiente && !pendiente.fondo) setRepartiendo(pendiente)
    return resultado
  }

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-white">Ingresos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lo que registran el agente y el MCP queda por aprobar y no cuenta hasta que lo apruebes.
            Los pagos de clases también.
          </p>
        </div>
        <SelectorCiclo ciclo={ciclo} ciclos={lista} onChange={setCiclo} />
      </div>

      {(error || errorResumen) && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error || errorResumen}</p>
      )}

      {repartiendo && (
        <RepartirIngreso
          key={repartiendo.id}
          ingreso={repartiendo}
          faltanteTC={vencimientos?.faltanteTotal || 0}
          fondos={fondosParaRepartir(repartiendo.ciclo_financiero)}
          onAportarTarjeta={(monto, nota) => reconciliacion.aportarFondo('CLP', monto, nota)}
          onAportarFondo={aportarFondoAhorro}
          onCerrar={() => setRepartiendo(null)}
        />
      )}

      <PorAprobar
        pendientes={pendientes}
        fuentes={fuentes}
        fondosSugeridos={fondosSugeridos}
        onAprobar={aprobarYOfrecerReparto}
        onDescartar={descartar}
        onEditar={editar}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <ResumenCiclo resumen={resumen} />
          <ListaIngresos ingresos={ingresos} fuentes={fuentes} fondosSugeridos={fondosSugeridos} onEditar={editar} onEliminar={eliminar} onRepartir={setRepartiendo} />
        </div>
        <div className="space-y-5 min-w-0">
          <FormIngreso fuentes={fuentes} fondosSugeridos={fondosSugeridos} onCrear={crear} />
          <Fuentes fuentes={fuentes} onCrear={crearFuente} onEditar={editarFuente} />
        </div>
      </div>
    </main>
  )
}
