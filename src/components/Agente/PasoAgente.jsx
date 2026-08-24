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
    output: (output) => output?.resumen ?? 'Gasto creado — pendiente de revisión en /bandeja',
  },
  'tool-buscar_gastos_pendientes': {
    input: (input) => `Buscando en la bandeja${input?.busqueda ? ` "${input.busqueda}"` : ''}…`,
    output: (output) => (output?.total > 0
      ? `Encontré ${output.total} gasto${output.total === 1 ? '' : 's'} pendiente${output.total === 1 ? '' : 's'}`
      : 'No hay gastos pendientes que coincidan'),
  },
  'tool-editar_gasto': {
    input: () => 'Editando el gasto…',
    output: (output) => output?.error ?? (output?.resumen ?? 'Gasto actualizado'),
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
