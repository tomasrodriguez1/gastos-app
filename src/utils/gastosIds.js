export function getGastoId(g, fallback) {
  return g.id || g._id || (g.fecha && g.motivo ? `${g.fecha}|${g.motivo.trim().toLowerCase()}` : null) || fallback
}
