// Serialización/deserialización de la fila `gastos` — compartida entre el
// CRUD HTTP (server/index.js) y los helpers reusados por el agente
// conversacional (server/gastos/actualizar.js).

import { toMonto } from '../db/numeric.js'

export function deserializarGasto(row) {
  const tipos = Array.isArray(row.tipos)
    ? row.tipos
    : (typeof row.tipos === 'string' ? JSON.parse(row.tipos || '[]') : [])
  const presupuesto_manual = typeof row.presupuesto_manual === 'string'
    ? JSON.parse(row.presupuesto_manual)
    : (row.presupuesto_manual ?? null)
  return {
    ...row,
    tipos,
    presupuesto_manual,
    monto: toMonto(row.monto),
    monto_real: toMonto(row.monto_real),
    usd: toMonto(row.usd),
    monto_clp_manual: toMonto(row.monto_clp_manual),
    split: toMonto(row.split),
    monto_presupuesto_manual: toMonto(row.monto_presupuesto_manual),
    es_manual: row.es_manual === true,
    pagado: row.pagado === true,
    plata_en_cuenta: row.plata_en_cuenta === true,
    en_presupuesto: row.en_presupuesto !== false,
    conciliado: row.conciliado === true,
  }
}

export function serializarCampoGasto(campo, valor) {
  if (valor === undefined) return null
  if (campo === 'tipos') return Array.isArray(valor) ? valor : []
  if (campo === 'presupuesto_manual') return valor || null
  if (campo === 'pagado' || campo === 'plata_en_cuenta' || campo === 'en_presupuesto') return valor ? true : false
  return valor
}
