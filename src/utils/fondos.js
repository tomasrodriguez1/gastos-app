/** Comparación de vínculo presupuesto (grupo + subcategoría; ignora `desde`). */
export function vinculadoIgual(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.grupo === b.grupo && a.subcategoria === b.subcategoria
}

export function vinculadoCambioUbicacion(anterior, nuevo) {
  if (!anterior && !nuevo) return false
  if (!anterior || !nuevo) return Boolean(anterior || nuevo)
  return !vinculadoIgual(anterior, nuevo)
}

/** `desde` al cambiar grupo/subcategoría: reinicia el acumulado automático desde el mes actual. */
export function resolverDesdeVinculado({ mes, vinculadoAnterior, vinculadoNuevo }) {
  if (!vinculadoNuevo) return null
  if (vinculadoCambioUbicacion(vinculadoAnterior, vinculadoNuevo)) return mes
  return vinculadoAnterior?.desde || mes
}
