import { useState } from 'react'
import { formatFecha, formatCLP } from '../../utils/formatters'
import { buscarIngresosSimilares } from '../../hooks/useIngresos'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CARD, TITULO_CARD } from '../Clases/estilos'
import { EditorIngreso } from './EditorIngreso'

// Alta manual (queda confirmado: lo estás cargando tú). Antes de guardar avisa si ya hay un ingreso
// parecido (misma fuente, monto ±10 % y fecha ±5 días).
export function FormIngreso({ fuentes, fondosSugeridos, onCrear }) {
  const hoy = new Date().toLocaleDateString('en-CA')
  const [abierto, setAbierto] = useState(false)
  const [duplicados, setDuplicados] = useState(null) // { datos, candidatos }
  const [version, setVersion] = useState(0)

  async function guardar(datos, { revisar = true } = {}) {
    if (revisar) {
      const candidatos = await buscarIngresosSimilares(datos).catch(() => [])
      if (candidatos.length) {
        setDuplicados({ datos, candidatos })
        return
      }
    }
    await onCrear(datos)
    setDuplicados(null)
    setAbierto(false)
    setVersion(v => v + 1)
  }

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={TITULO_CARD}>Registrar ingreso</h2>
        <button
          type="button"
          onClick={() => { setAbierto(!abierto); setDuplicados(null) }}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
        >
          + Ingreso
        </button>
      </div>
      {!abierto ? (
        <p className="text-sm text-slate-500">
          Lo que cargas acá queda confirmado. El sueldo, la mesada, un proyecto o plata que sacaste de un fondo.
          Las clases se cobran en Clases particulares.
        </p>
      ) : (
        <EditorIngreso
          key={version}
          inicial={{ fecha: hoy }}
          fuentes={fuentes}
          fondosSugeridos={fondosSugeridos}
          textoBoton="Registrar"
          onGuardar={(datos) => guardar(datos)}
          onCancelar={() => setAbierto(false)}
        >
          {duplicados && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
              <p className="font-medium">Ya hay un ingreso parecido. ¿Es otro?</p>
              <ul className="space-y-0.5">
                {duplicados.candidatos.map(c => (
                  <li key={c.id}>
                    {c.fuente} · {formatCLP(c.monto)} · {formatFecha(c.fecha)} · {c.estado === 'pendiente' ? 'por aprobar' : 'confirmado'}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDuplicados(null)} className={BOTON_SECUNDARIO}>Revisar</button>
                <button type="button" onClick={() => guardar(duplicados.datos, { revisar: false })} className={BOTON_PRIMARIO}>Es otro, registrar</button>
              </div>
            </div>
          )}
        </EditorIngreso>
      )}
    </section>
  )
}
