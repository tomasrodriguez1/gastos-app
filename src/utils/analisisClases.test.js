import { describe, test, expect } from 'bun:test'
import { analizarClases } from './analisisClases'

let id = 0
const clase = (alumno, fecha, extra = {}) => ({
  id: ++id, fecha, hora_inicio: '18:00', horas: 1, modalidad: 'presencial', precio_hora: 20000, monto: 20000,
  cobro: 'pagado', alumno_id: alumno.length, alumno, familia_id: null, familia: null, ...extra,
})
const mena = (alumno, fecha, extra) => clase(alumno, fecha, { familia_id: 1, familia: 'Mena', ...extra })

const CLASES = [
  // junio de 3 años: 2024 (2 al día 10 + 1 después), 2025 (1 al día 10 + 1 después), 2026 en curso
  mena('Luciano Mena', '2024-06-03'), mena('Luciano Mena', '2024-06-05'), mena('Cristobal Mena', '2024-06-20', { hora_inicio: '19:00' }),
  clase('Baltazar', '2025-06-02', { modalidad: 'online', monto: 18000, precio_hora: 18000 }),
  clase('Baltazar', '2025-06-25', { modalidad: 'online', monto: 18000, precio_hora: 18000 }),
  mena('Luciano Mena', '2026-06-01', { cobro: 'pendiente' }), mena('Cristobal Mena', '2026-06-08', { cobro: 'pendiente' }),
  clase('Rafaela', '2026-04-14', { horas: 1.5, monto: 30000 }),
]

describe('análisis de clases', () => {
  const a = analizarClases(CLASES, { hoy: '2026-06-10' })

  test('KPIs: facturado, cobrado, pendiente, alumnos', () => {
    expect(a.kpis).toMatchObject({
      facturado: 166000, cobrado: 126000, sinCobrar: 40000, clases: 8, horas: 8.5, alumnos: 4, porClase: 20750,
    })
    expect(a.kpis.pctPendiente).toBe(24.1)
  })

  test('mensual y por año con variación del facturado/mes', () => {
    expect(a.mensual).toMatchObject({ mesesActivos: 4, ingresoProm: 41500, ingresoMediana: 38000 })
    expect([a.mensual.mejor.mes, a.mensual.mejor.ingreso]).toEqual(['2024-06', 60000])
    expect(a.mensual.peor.mes).toBe('2026-04')
    expect(a.porAnio.map(x => [x.anio, x.ingresoMes, x.variacion])).toEqual([
      ['2024', 60000, null], ['2025', 36000, -40], ['2026', 35000, -3],
    ])
    expect(a.porAnio.at(-1).enCurso).toBe(true)
  })

  test('mismo mes entre años, con el año en curso marcado', () => {
    expect(a.mismoMes(6).map(x => [x.anio, x.clases, x.ingreso, x.enCurso])).toEqual([
      ['2024', 3, 60000, false], ['2025', 2, 36000, false], ['2026', 2, 40000, true],
    ])
    expect(a.mismoMes(1)).toEqual([])
  })

  test('proyección: lo de hoy × crecimiento histórico después del mismo día', () => {
    // 2024: 40k al día 10 → 60k (×1,5). 2025: 18k → 36k (×2). Promedio ×1,75 → 40k × 1,75.
    expect(a.proyeccion).toMatchObject({ dia: 10, diasMes: 30, actual: { ingreso: 40000, clases: 2 }, proyectado: 70000, basadoEnHistoria: true })
    expect(a.proyeccion.anioAnterior).toEqual({ anio: '2025', final: 36000 })
    expect(a.proyeccion.anteriores.map(x => [x.anio, x.ingreso])).toEqual([['2024', 40000], ['2025', 18000]])
  })

  test('distribuciones: día, hora, mapa, modalidad, tarifas', () => {
    expect(a.horaData.map(h => [h.hora, h.clases])).toEqual([['18:00', 7], ['19:00', 1]])
    expect(a.mapaCalor.max).toBeGreaterThan(0)
    expect(a.modalidad.map(m => [m.modalidad, m.clases])).toEqual([['Presencial', 6], ['Online', 2]])
    expect(a.precios.map(p => [p.precio, p.clases])).toEqual([[18000, 2], [20000, 6]])
    expect(a.diaSemana.reduce((s, d) => s + d.clases, 0)).toBe(8)
  })

  test('familias con hermanos, ranking e insights', () => {
    expect(a.familias).toEqual([expect.objectContaining({ nombre: 'Mena', alumnos: ['Cristobal Mena', 'Luciano Mena'], clases: 5, ingreso: 100000, sinCobrar: 40000 })])
    expect(a.ranking[0]).toMatchObject({ alumno: 'Luciano Mena', ingreso: 60000, desde: '2024-06', familia: 'Mena' })
    const titulos = a.insights.map(i => i.titulo)
    expect(titulos).toContain('Concentración')
    expect(titulos).toContain('Riesgo de cliente') // familia Mena = 60%
    expect(a.insights.find(i => i.titulo === 'Concentración').texto).toContain('familia Mena = 60%')
    expect(a.insights.find(i => i.titulo === 'Sin cobrar').texto).toContain('Luciano Mena $20k')
  })

  test('mes sin historia: proyección proporcional a los días', () => {
    const b = analizarClases([clase('X', '2026-06-05')], { hoy: '2026-06-10' })
    expect(b.proyeccion).toMatchObject({ proyectado: 60000, basadoEnHistoria: false, anioAnterior: null })
  })
})
