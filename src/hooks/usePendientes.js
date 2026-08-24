import { useMemo } from 'react'

// Gastos en estado pendiente/error_parseo, sin importar origen (mail o chat) —
// usado tanto por la bandeja completa (BandejaLista) como por el contador
// embebido en /agente.
export function usePendientes(gastos, gastosLocales) {
  return useMemo(() => {
    return [...gastos, ...gastosLocales]
      .filter(g => g.estado === 'pendiente' || g.estado === 'error_parseo')
      .sort((a, b) => (b.created_at || b.fecha).localeCompare(a.created_at || a.fecha))
  }, [gastos, gastosLocales])
}
