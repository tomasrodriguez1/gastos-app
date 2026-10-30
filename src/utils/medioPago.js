// Medios en los que la plata ya salió: no quedan como deuda de tarjeta.
// El patrón también se usa en el backfill SQL (server/db/migrate-pagado-contado.js).
export const PATRON_MEDIO_YA_PAGADO = 'efectivo|transferenc|d[eé]bito|cash'

export function esMedioYaPagado(banco) {
  return new RegExp(PATRON_MEDIO_YA_PAGADO, 'i').test(String(banco || '').trim())
}

export function resolverPagado(banco, pagado) {
  return esMedioYaPagado(banco) ? true : Boolean(pagado)
}
