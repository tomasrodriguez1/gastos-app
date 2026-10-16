import { describe, test, expect } from 'bun:test'
import { armarMensajeCobro, fechaLarga, linkWhatsApp } from './mensajeCobro'

const clase = (alumno, fecha, hora_inicio, extra = {}) => ({ alumno, fecha, hora_inicio, horas: 1, monto: 20000, ...extra })

describe('mensaje de cobro', () => {
  test('fecha larga en español', () => {
    expect(fechaLarga('2026-06-02')).toBe('martes 2 de junio')
    expect(fechaLarga('2026-10-04')).toBe('domingo 4 de octubre')
  })

  test('familia en un mes: saludo, detalle por alumno con cada fecha, subtotales y total', () => {
    const texto = armarMensajeCobro({
      apoderado: 'Isabel',
      clases: [
        clase('Luciano Mena', '2026-06-04', '18:00'),
        clase('Cristobal Mena', '2026-06-02', '19:00'),
        clase('Luciano Mena', '2026-06-01', '18:00'),
        clase('Cristobal Mena', '2026-06-07', '18:30'),
      ],
    })
    const anio = new Date().getFullYear() === 2026 ? '' : ' 2026'
    expect(texto).toBe([
      'Hola Isabel, ¿cómo estás?',
      '',
      `Te paso el detalle de las clases de junio${anio}:`,
      '',
      '*Cristobal Mena*',
      '• martes 2 de junio, 19:00',
      '• domingo 7 de junio, 18:30',
      'Subtotal: 2 clases, $40.000',
      '',
      '*Luciano Mena*',
      '• lunes 1 de junio, 18:00',
      '• jueves 4 de junio, 18:00',
      'Subtotal: 2 clases, $40.000',
      '',
      'El total del mes fue $80.000 (4 clases).',
    ].join('\n'))
  })

  test('un alumno, varios meses, duración y montos distintos; sin apoderado', () => {
    const texto = armarMensajeCobro({
      apoderado: '',
      clases: [
        clase('Baltazar Martinić', '2026-09-30', '17:00', { horas: 1.5, monto: 27000 }),
        clase('Baltazar Martinić', '2026-10-02', '17:00', { monto: 18000 }),
      ],
    })
    expect(texto).toContain('Hola, ¿cómo estás?')
    expect(texto).toContain('Te paso el detalle de las clases:')
    expect(texto).toContain('• miércoles 30 de septiembre, 17:00 (1,5 h) — $27.000')
    expect(texto).not.toContain('Subtotal')
    expect(texto).toContain('El total es $45.000 (2 clases).')
  })

  test('link de WhatsApp: completa el 56 de Chile y codifica el texto', () => {
    expect(linkWhatsApp('9 8765 4321', 'Hola ¿x?')).toBe('https://wa.me/56987654321?text=Hola%20%C2%BFx%3F')
    expect(linkWhatsApp('+56 9 8765 4321', 'a')).toBe('https://wa.me/56987654321?text=a')
    expect(linkWhatsApp('', 'a')).toBeNull()
    expect(linkWhatsApp('1234', 'a')).toBeNull()
  })
})
