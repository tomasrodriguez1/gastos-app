// Mensaje de cobro de clases para copiar y pegar en WhatsApp (sin datos de transferencia: el
// apoderado ya los tiene). Una sección por alumno con cada clase y su fecha, y el total.
//
//   Hola Isabel, ¿cómo estás?
//
//   Te paso el detalle de las clases de junio:
//
//   *Cristobal Mena*
//   • martes 2 de junio, 19:00
//   ...
//   Subtotal: 4 clases, $80.000
//
//   El total del mes fue $260.000.

import { formatCLP } from './formatters'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function partesFecha(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  return { y, m, d, dia: DIAS[new Date(y, m - 1, d).getDay()] }
}

// "martes 2 de junio"
export function fechaLarga(fecha) {
  const { m, d, dia } = partesFecha(fecha)
  return `${dia} ${d} de ${MESES[m - 1]}`
}

const horasTexto = (h) => `${String(h).replace('.', ',')} h`

// clases: [{ alumno, fecha, hora_inicio, horas, monto }]
export function armarMensajeCobro({ apoderado, clases }) {
  const ordenadas = [...clases].sort((a, b) =>
    `${a.fecha} ${a.hora_inicio}`.localeCompare(`${b.fecha} ${b.hora_inicio}`))
  const total = ordenadas.reduce((s, c) => s + c.monto, 0)
  const meses = [...new Set(ordenadas.map(c => c.fecha.slice(0, 7)))]
  const unMes = meses.length === 1
  const anios = new Set(ordenadas.map(c => c.fecha.slice(0, 4)))
  // El monto por clase solo aporta si no son todas iguales; si lo son, basta el subtotal.
  const montosDistintos = new Set(ordenadas.map(c => c.monto)).size > 1

  const porAlumno = new Map()
  for (const c of ordenadas) porAlumno.set(c.alumno, [...(porAlumno.get(c.alumno) || []), c])
  const variosAlumnos = porAlumno.size > 1

  const lineas = []
  const nombre = apoderado?.trim()
  lineas.push(nombre ? `Hola ${nombre}, ¿cómo estás?` : 'Hola, ¿cómo estás?', '')
  if (unMes) {
    const { m, y } = partesFecha(`${meses[0]}-01`)
    const conAnio = y !== new Date().getFullYear() ? ` ${y}` : ''
    lineas.push(`Te paso el detalle de las clases de ${MESES[m - 1]}${conAnio}:`, '')
  } else {
    lineas.push('Te paso el detalle de las clases:', '')
  }

  for (const [alumno, lista] of [...porAlumno].sort(([a], [b]) => a.localeCompare(b))) {
    lineas.push(`*${alumno}*`)
    for (const c of lista) {
      let linea = `• ${fechaLarga(c.fecha)}`
      if (anios.size > 1) linea += ` de ${c.fecha.slice(0, 4)}`
      linea += `, ${c.hora_inicio}`
      if (c.horas !== 1) linea += ` (${horasTexto(c.horas)})`
      if (montosDistintos) linea += ` — ${formatCLP(c.monto)}`
      lineas.push(linea)
    }
    if (variosAlumnos) {
      const subtotal = lista.reduce((s, c) => s + c.monto, 0)
      lineas.push(`Subtotal: ${lista.length} clase${lista.length === 1 ? '' : 's'}, ${formatCLP(subtotal)}`)
    }
    lineas.push('')
  }

  const n = ordenadas.length
  lineas.push(unMes
    ? `El total del mes fue ${formatCLP(total)} (${n} clase${n === 1 ? '' : 's'}).`
    : `El total es ${formatCLP(total)} (${n} clase${n === 1 ? '' : 's'}).`)
  return lineas.join('\n')
}

// Link de WhatsApp con el mensaje escrito. Números chilenos de 9 dígitos (9XXXXXXXX) se
// completan con el 56. Sin teléfono válido → null (queda solo "Copiar").
export function linkWhatsApp(telefono, texto) {
  let digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length === 9 && digitos.startsWith('9')) digitos = `56${digitos}`
  if (digitos.length < 10) return null
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`
}
