/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'
import { useViajes } from '../hooks/useViajes'

// Lista de viajes compartida entre /viajes, el modal de edición de gastos y la tabla de gastos
// (badge + asignación masiva), que se usan desde varias páginas — así no se pasa por props.

const ViajesContext = createContext(null)

const SIN_PROVIDER = {
  viajes: [],
  cargando: false,
  error: null,
  refrescar: async () => {},
  crear: async () => {},
  editar: async () => {},
  eliminar: async () => {},
  asignar: async () => {},
  desasignar: async () => {},
}

export function ViajesProvider({ onCambioGastos, children }) {
  const valor = useViajes({ onCambioGastos })
  return <ViajesContext.Provider value={valor}>{children}</ViajesContext.Provider>
}

export function useViajesContext() {
  return useContext(ViajesContext) ?? SIN_PROVIDER
}
