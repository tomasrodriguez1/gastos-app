// Traduce una tool part de un UIMessage (parts[] de @ai-sdk/react) a una
// línea de estado legible — "buscó el comercio", "creó el gasto" — en vez de
// mostrar la respuesta del agente como un bloque opaco.

const ETIQUETAS = {
  'tool-buscar_comercio': {
    input: (input) => `Buscando "${input?.comercio ?? ''}" en la memoria de comercios…`,
    output: (output) => (output?.encontrado
      ? `Ya lo conozco: ${[...(output.tipos || []), output.contexto].filter(Boolean).join(' / ')} (confirmado ${output.veces_confirmado}×)`
      : 'Comercio nuevo — no hay memoria previa'),
  },
  'tool-crear_gasto': {
    input: (input) => `Creando el gasto: ${input?.motivo ?? ''}…`,
    output: (output) => {
      if (output?.bloqueado) {
        const n = output.candidatos?.length || 0
        return `Posible duplicado, no lo creé (${n} candidato${n === 1 ? '' : 's'})`
      }
      return output?.resumen ?? 'Gasto creado — pendiente de revisión en /bandeja'
    },
  },
  'tool-buscar_gastos_pendientes': {
    input: (input) => {
      const filtro = input?.busqueda || input?.banco || ''
      return `Buscando en la bandeja${filtro ? ` "${filtro}"` : ''}…`
    },
    output: (output) => (output?.total > 0
      ? `Encontré ${output.total} gasto${output.total === 1 ? '' : 's'} pendiente${output.total === 1 ? '' : 's'}`
      : 'No hay gastos pendientes que coincidan'),
  },
  'tool-resumir_bandeja': {
    input: (input) => `Resumiendo la bandeja${input?.banco ? ` de ${input.banco}` : ''}…`,
    output: (output) => (output?.total
      ? `Bandeja: ${output.total} pendiente${output.total === 1 ? '' : 's'} ($${output.suma_monto ?? 0})`
      : 'La bandeja está vacía'),
  },
  'tool-editar_gasto': {
    input: () => 'Editando el gasto…',
    output: (output) => output?.error ?? (output?.resumen ?? 'Gasto actualizado'),
  },
  'tool-registrar_saldos_reserva': {
    input: () => 'Registrando saldos de reservas…',
    output: (output) => (output?.resultados || [])
      .map(r => r.error ? `⚠ ${r.error}` : r.resumen)
      .join(' · ') || 'Sin lecturas registradas',
  },
  'tool-listar_reservas': {
    input: (input) => input?.solo_activas ? 'Listando reservas activas…' : 'Listando reservas…',
    output: (output) => (output?.total
      ? `${output.total} reserva${output.total === 1 ? '' : 's'}`
      : 'No hay reservas'),
  },
  'tool-crear_reserva': {
    input: (input) => `Creando la reserva "${input?.nombre ?? ''}"…`,
    output: (output) => output?.error ?? (output?.resumen ?? 'Reserva creada'),
  },
  'tool-editar_reserva': {
    input: () => 'Editando la reserva…',
    output: (output) => output?.error ?? (output?.resumen ?? 'Reserva actualizada'),
  },
  'tool-listar_saldos_reserva': {
    input: () => 'Consultando saldos de la reserva…',
    output: (output) => {
      if (output?.error) return output.error
      const n = output?.saldos?.length || 0
      const nombre = output?.reserva?.nombre
      return n
        ? `${n} saldo${n === 1 ? '' : 's'} de ${nombre}`
        : `Sin lecturas todavía${nombre ? ` en ${nombre}` : ''}`
    },
  },
  'tool-resumen_ciclo': {
    input: (input) => `Consultando el ciclo${input?.ciclo ? ` ${input.ciclo}` : ''}…`,
    output: (output) => (output?.ciclo
      ? `Ciclo ${output.ciclo}: gastado $${output.gastado ?? 0} de $${output.previsto ?? 0}`
      : 'Sin resumen del ciclo'),
  },
  'tool-buscar_gastos': {
    input: (input) => `Buscando gastos${input?.texto ? ` "${input.texto}"` : ''}…`,
    output: (output) => (output?.total
      ? `${output.total} gasto${output.total === 1 ? '' : 's'} ($${output.suma ?? 0})`
      : 'No encontré gastos que coincidan'),
  },
}

export function PasoAgente({ part }) {
  const etiquetas = ETIQUETAS[part.type]
  if (!etiquetas) return null

  if (part.state === 'output-error') {
    return (
      <div className="text-xs text-rose-400 flex items-center gap-2 pl-3 border-l-2 border-rose-500/40">
        <span>⚠</span>
        <span>{part.errorText || 'El paso falló'}</span>
      </div>
    )
  }

  if (part.state === 'output-available') {
    return (
      <div className="text-xs text-emerald-400 flex items-center gap-2 pl-3 border-l-2 border-emerald-500/40">
        <span>✓</span>
        <span>{etiquetas.output(part.output)}</span>
      </div>
    )
  }

  // 'input-streaming' | 'input-available' — la tool todavía se está preparando o ejecutando
  return (
    <div className="text-xs text-slate-400 flex items-center gap-2 pl-3 border-l-2 border-slate-700 animate-pulse">
      <span>…</span>
      <span>{etiquetas.input(part.input)}</span>
    </div>
  )
}
