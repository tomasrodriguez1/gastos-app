import { formatMesLargo, privacyFormat } from '../../utils/formatters'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { CARD, TITULO_CARD } from '../Clases/estilos'

const ESTADO = {
  llego: { texto: '✓ Llegó', estilo: 'text-emerald-400' },
  por_aprobar: { texto: 'Por aprobar', estilo: 'text-amber-300' },
  pendiente: { texto: 'Pendiente', estilo: 'text-slate-400' },
  atrasado: { texto: '⚠ Atrasado', estilo: 'text-red-400' },
}

// Previsto vs real por fuente del ciclo. Uso de fondos va aparte: suma al saldo pero no es
// ingreso nuevo. "Esperado" = lo que se espera tener al cierre (clases: real + lo que deben las
// clases del mes anterior: las de octubre son ingreso del ciclo de noviembre).
export function ResumenCiclo({ resumen }) {
  const { isPrivacyModeEnabled } = usePrivacyMode()
  const fmt = (n) => privacyFormat(n, isPrivacyModeEnabled)
  if (!resumen) return <section className={CARD}><p className="text-sm text-slate-500">Cargando…</p></section>

  const ingresos = resumen.fuentes.filter(f => f.tipo !== 'fondos')
  const fondos = resumen.fuentes.filter(f => f.tipo === 'fondos')
  const t = resumen.totales

  const Fila = ({ f }) => {
    const estado = ESTADO[f.estado] || ESTADO.pendiente
    return (
      <tr className="border-b border-slate-700/30 align-top">
        <td className="py-2 pr-2 text-slate-200">
          {f.nombre}
          {f.fuera_catalogo && <span className="ml-1 text-[10px] text-slate-500">(fuera del catálogo)</span>}
          {f.automatica && f.por_cobrar != null && (
            <p className="text-xs text-slate-500">
              Clases de {formatMesLargo(f.mes_clases)}: por cobrar {fmt(f.por_cobrar)}{f.por_confirmar > 0 && ` · pagos por confirmar ${fmt(f.por_confirmar)}`}
            </p>
          )}
          {f.automatica && f.real_automatico > 0 && (
            <p className="text-xs text-slate-500" title="Clases ya cobradas que no tienen un pago registrado (por ejemplo, las importadas de Notion): se asumen como ingreso solas">
              Incluye {fmt(f.real_automatico)} automáticos · {f.clases_automaticas} clase{f.clases_automaticas === 1 ? '' : 's'} ya cobradas, sin pago registrado
            </p>
          )}
        </td>
        <td className="py-2 px-2 text-right font-mono-numbers text-slate-400">{f.previsto ? fmt(f.previsto) : '—'}</td>
        <td className="py-2 px-2 text-right font-mono-numbers text-slate-100">{f.real ? fmt(f.real) : '—'}</td>
        <td className="py-2 px-2 text-right font-mono-numbers text-slate-400">{f.esperado ? fmt(f.esperado) : '—'}</td>
        <td className={`py-2 pl-2 text-right text-xs whitespace-nowrap ${estado.estilo}`}>
          {estado.texto}{f.estado === 'atrasado' && f.dia_esperado ? ` (día ${f.dia_esperado})` : ''}
          {f.por_aprobar > 0 && f.estado !== 'por_aprobar' && <p className="text-amber-300">+{fmt(f.por_aprobar)} por aprobar</p>}
        </td>
      </tr>
    )
  }

  return (
    <section className={CARD}>
      <h2 className={`${TITULO_CARD} mb-3`}>Previsto vs real del ciclo</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
              <th className="py-2 text-left font-medium">Fuente</th>
              <th className="py-2 px-2 text-right font-medium">Previsto</th>
              <th className="py-2 px-2 text-right font-medium">Real</th>
              <th className="py-2 px-2 text-right font-medium">Esperado</th>
              <th className="py-2 pl-2 text-right font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {ingresos.map(f => <Fila key={f.nombre} f={f} />)}
            <tr className="font-medium">
              <td className="pt-3 text-slate-300">Total ingresos</td>
              <td className="pt-3 px-2 text-right font-mono-numbers text-slate-300">{fmt(t.previsto)}</td>
              <td className="pt-3 px-2 text-right font-mono-numbers text-emerald-400">{fmt(t.real)}</td>
              <td className="pt-3 px-2 text-right font-mono-numbers text-sky-300">{fmt(t.esperado)}</td>
              <td />
            </tr>
          </tbody>
          {fondos.length > 0 && (
            <tbody>
              <tr><td colSpan={5} className="pt-5 pb-1 text-xs uppercase tracking-wider text-slate-500">Aparte · plata de tus fondos (no es ingreso nuevo)</td></tr>
              {fondos.map(f => <Fila key={f.nombre} f={f} />)}
            </tbody>
          )}
        </table>
      </div>
    </section>
  )
}
