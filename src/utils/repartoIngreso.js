// Reparto sugerido de un ingreso (caso "la plata llega y se gasta al tiro"): al aprobar un ingreso
// se propone cuánto apartar para cubrir la deuda de tarjeta (aporte al fondo TC) y cuánto para cada
// fondo de ahorro manual (su `previsto_aportar` del ciclo). El FGP no figura: su aporte se deriva del
// presupuesto, no se registra. Esto solo sugiere; lo que se confirma se registra con los mismos
// endpoints de aporte de siempre (fondo de tarjeta y fondos de ahorro).

const entero = n => (Number.isFinite(Number(n)) ? Math.max(0, Math.round(Number(n))) : 0)

/**
 * monto: lo que entró. faltanteTC: lo que falta en el fondo TC para cubrir toda la deuda.
 * fondos: [{ nombre, previsto }] fondos de ahorro manuales con su aporte previsto del ciclo.
 *
 * Prioridad: primero la tarjeta (es plata que vence), después cada fondo en el orden recibido.
 * Cada línea es `{ destino: 'tarjeta' | 'fondo', nombre?, sugerido, previsto? }` (sugerido puede ser
 * 0: la línea se muestra igual para poder ajustarla a mano). `libre` es lo que sobra.
 */
export function sugerirReparto({ monto, faltanteTC = 0, fondos = [] } = {}) {
  let resto = entero(monto)
  const lineas = []

  const tarjeta = Math.min(resto, entero(faltanteTC))
  lineas.push({ destino: 'tarjeta', sugerido: tarjeta, faltante: entero(faltanteTC) })
  resto -= tarjeta

  for (const fondo of fondos) {
    const previsto = entero(fondo.previsto)
    const sugerido = Math.min(resto, previsto)
    lineas.push({ destino: 'fondo', nombre: fondo.nombre, emoji: fondo.emoji, sugerido, previsto })
    resto -= sugerido
  }

  return { lineas, libre: resto }
}

// Total de las líneas con sus montos editados (strings del formulario) y lo que queda libre.
export function totalesReparto(monto, montos) {
  const repartido = montos.reduce((s, m) => s + entero(m), 0)
  return { repartido, libre: entero(monto) - repartido, excede: repartido > entero(monto) }
}
