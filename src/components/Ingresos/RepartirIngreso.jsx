import { useMemo, useState } from 'react'
import { privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { sugerirReparto, totalesReparto } from '../../utils/repartoIngreso'
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CARD, INPUT, TITULO_CARD } from '../Clases/estilos'

// Propone cómo repartir un ingreso recién aprobado (o uno ya confirmado): primero lo que falta en el
// fondo TC para cubrir la tarjeta, después el aporte previsto de cada fondo de ahorro manual. Solo
// sugiere: cada monto se puede editar y lo que se confirma se registra como un aporte normal.
// No queda ligado al ingreso, así que repartir dos veces el mismo ingreso duplica los aportes.
export function RepartirIngreso({ ingreso, faltanteTC, fondos, onAportarTarjeta, onAportarFondo, onCerrar }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const fmt = n => privacyFormat(n, isPrivacyModeEnabled)
  const sugerencia = useMemo(
    () => sugerirReparto({ monto: ingreso.monto, faltanteTC, fondos }),
    [ingreso.monto, faltanteTC, fondos],
  )
  const [montos, setMontos] = useState(() => sugerencia.lineas.map(l => String(l.sugerido || '')))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [hechos, setHechos] = useState([])

  const { repartido, libre, excede } = totalesReparto(ingreso.monto, montos)
  const nota = `Reparto de ingreso: ${ingreso.fuente}`

  function cambiar(indice, valor) {
    setMontos(prev => prev.map((m, i) => (i === indice ? valor.replace(/[^\d]/g, '') : m)))
  }

  async function confirmar() {
    setEnviando(true)
    setError(null)
    // Una línea ya aplicada queda en 0, así un reintento tras un error no repite aportes.
    for (let i = 0; i < sugerencia.lineas.length; i += 1) {
      const monto = Number(montos[i]) || 0
      if (monto <= 0) continue
      const linea = sugerencia.lineas[i]
      try {
        if (linea.destino === 'tarjeta') await onAportarTarjeta(monto, nota)
        else await onAportarFondo(linea.nombre, monto, nota)
        setMontos(prev => prev.map((m, j) => (j === i ? '' : m)))
        setHechos(prev => [...prev, `${linea.destino === 'tarjeta' ? 'Fondo TC' : linea.nombre}: ${fmt(monto)}`])
      } catch (e) {
        setError(e.message)
        setEnviando(false)
        return
      }
    }
    setEnviando(false)
    onCerrar()
  }

  return (
    <section className={`${CARD} border-emerald-500/40`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className={TITULO_CARD}>Repartir ingreso</h2>
        <span className="text-xs text-slate-400">
          {ingreso.fuente} · <span className="font-mono-numbers text-emerald-400">{fmt(ingreso.monto)}</span>
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Sugerencia: primero cubrir la deuda de tarjeta y después tus fondos de ahorro. Ajustá los montos si querés;
        lo que no repartas queda libre. El FGP no se registra acá: se aparta con el previsto del ciclo.
      </p>

      <div className="space-y-2">
        {sugerencia.lineas.map((linea, i) => (
          <div key={linea.destino === 'tarjeta' ? 'tarjeta' : linea.nombre} className="flex flex-wrap items-center gap-3 text-sm">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-slate-200">{linea.destino === 'tarjeta' ? 'Fondo TC (tarjetas)' : `${linea.emoji || '💰'} ${linea.nombre}`}</p>
              <p className="text-xs text-slate-500">
                {linea.destino === 'tarjeta'
                  ? (linea.faltante > 0 ? `Faltan ${fmt(linea.faltante)} para cubrir toda la deuda` : 'La deuda ya está cubierta por el fondo')
                  : `Previsto ${fmt(linea.previsto)} este ciclo`}
              </p>
            </div>
            <input
              className={`${INPUT} w-32 font-mono-numbers text-right`}
              inputMode="numeric"
              placeholder="0"
              value={montos[i]}
              onChange={e => cambiar(i, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/40 pt-3">
        <p className={`text-xs ${excede ? 'text-red-400' : 'text-slate-400'}`}>
          Repartido <span className="font-mono-numbers">{fmt(repartido)}</span> ·{' '}
          {excede ? `te pasas por ${fmt(-libre)}` : <>queda libre <span className="font-mono-numbers">{fmt(libre)}</span></>}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className={BOTON_SECUNDARIO} disabled={enviando} onClick={onCerrar}>Ahora no</button>
          <button type="button" className={BOTON_PRIMARIO} disabled={enviando || excede || repartido <= 0} onClick={confirmar}>
            {enviando ? 'Repartiendo…' : 'Repartir'}
          </button>
        </div>
      </div>
      {hechos.length > 0 && <p className="mt-2 text-xs text-emerald-400">Aportado: {hechos.join(' · ')}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  )
}
