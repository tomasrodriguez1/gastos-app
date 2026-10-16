// Análisis de clases particulares para /clases/analisis. Función pura sobre las clases dictadas
// (GET /api/clases/analisis), así se testea sin UI.
//
// "Ingreso" acá es lo facturado: el monto de cada clase dictada, por la fecha de la clase,
// esté cobrada o no. Lo cobrado y lo pendiente se muestran aparte. No usa la tabla `ingreso`
// (que solo tiene los pagos registrados en la app, no la historia importada de Notion).

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const suma = (lista, f) => lista.reduce((s, x) => s + f(x), 0)
const redondear1 = (n) => Math.round(n * 10) / 10

// 0 = lunes … 6 = domingo
function diaSemana(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

function mediana(valores) {
  if (!valores.length) return 0
  const v = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(v.length / 2)
  return v.length % 2 ? v[mitad] : (v[mitad - 1] + v[mitad]) / 2
}

export function variacion(actual, anterior) {
  if (!anterior) return null
  return Math.round(((actual - anterior) / anterior) * 100)
}

function acumular(clases) {
  return { ingreso: suma(clases, c => c.monto), clases: clases.length, horas: suma(clases, c => c.horas) }
}

function agruparPor(lista, clave) {
  const mapa = new Map()
  for (const x of lista) {
    const k = clave(x)
    if (!mapa.has(k)) mapa.set(k, [])
    mapa.get(k).push(x)
  }
  return mapa
}

// Cuenta de cobro: la familia si tiene, si no el alumno.
const claveCuenta = (c) => (c.familia_id != null ? `f${c.familia_id}` : `a${c.alumno_id}`)
const nombreCuenta = (c) => (c.familia_id != null ? `familia ${c.familia}` : c.alumno)

export function analizarClases(clases, { hoy }) {
  const mesActual = hoy.slice(0, 7)
  const diaHoy = Number(hoy.slice(8, 10))

  // ─── KPIs ───
  const facturado = suma(clases, c => c.monto)
  const sinCobrar = suma(clases.filter(c => c.cobro === 'pendiente'), c => c.monto)
  const kpis = {
    facturado,
    cobrado: facturado - sinCobrar,
    sinCobrar,
    pctPendiente: facturado ? redondear1((sinCobrar / facturado) * 100) : 0,
    clases: clases.length,
    horas: suma(clases, c => c.horas),
    alumnos: new Set(clases.map(c => c.alumno_id)).size,
    porClase: clases.length ? Math.round(facturado / clases.length) : 0,
  }

  // ─── Por mes y año ───
  const porMesMapa = agruparPor(clases, c => c.fecha.slice(0, 7))
  const meses = [...porMesMapa.keys()].sort().map(mes => ({ mes, ...acumular(porMesMapa.get(mes)) }))
  const ingresosMes = meses.map(m => m.ingreso)
  const mejor = meses.reduce((a, b) => (!a || b.ingreso > a.ingreso ? b : a), null)
  const peor = meses.reduce((a, b) => (!a || b.ingreso < a.ingreso ? b : a), null)
  const mensual = {
    mesesActivos: meses.length,
    ingresoProm: meses.length ? Math.round(suma(meses, m => m.ingreso) / meses.length) : 0,
    clasesProm: meses.length ? redondear1(kpis.clases / meses.length) : 0,
    horasProm: meses.length ? redondear1(kpis.horas / meses.length) : 0,
    ingresoMediana: Math.round(mediana(ingresosMes)),
    mejor,
    peor,
  }

  const anios = [...new Set(meses.map(m => m.mes.slice(0, 4)))].sort()
  const porAnio = anios.map((anio) => {
    const delAnio = meses.filter(m => m.mes.startsWith(anio))
    const total = acumular(clases.filter(c => c.fecha.startsWith(anio)))
    const n = delAnio.length
    return {
      anio,
      meses: n,
      ...total,
      clasesMes: redondear1(total.clases / n),
      horasMes: redondear1(total.horas / n),
      ingresoMes: Math.round(total.ingreso / n),
      enCurso: anio === hoy.slice(0, 4),
    }
  })
  porAnio.forEach((a, i) => { a.variacion = i > 0 ? variacion(a.ingresoMes, porAnio[i - 1].ingresoMes) : null })

  // Barras agrupadas: una fila por mes del año, una columna por año.
  const ingresosMesAnio = MESES_CORTOS.map((nombre, i) => {
    const fila = { mes: nombre }
    for (const anio of anios) {
      const m = meses.find(x => x.mes === `${anio}-${String(i + 1).padStart(2, '0')}`)
      fila[anio] = m ? m.ingreso : 0
      fila[`${anio}_clases`] = m ? m.clases : 0
    }
    return fila
  })
  const estacionalidad = MESES_CORTOS.map((nombre, i) => {
    const delMes = clases.filter(c => Number(c.fecha.slice(5, 7)) === i + 1)
    return { mes: nombre, ...acumular(delMes) }
  })

  // ─── Distribuciones ───
  const diaSemanaData = DIAS_CORTOS.map((dia, i) => {
    const del = clases.filter(c => diaSemana(c.fecha) === i)
    return { dia, ...acumular(del) }
  })
  const horasDelDia = [...new Set(clases.map(c => Number(c.hora_inicio.slice(0, 2))))].sort((a, b) => a - b)
  const horaData = horasDelDia.map(h => {
    const del = clases.filter(c => Number(c.hora_inicio.slice(0, 2)) === h)
    return { hora: `${String(h).padStart(2, '0')}:00`, h, ...acumular(del) }
  })
  const mapaCalor = {
    horas: horasDelDia,
    filas: DIAS_CORTOS.map((dia, i) => ({
      dia,
      valores: horasDelDia.map(h => clases.filter(c => diaSemana(c.fecha) === i && Number(c.hora_inicio.slice(0, 2)) === h).length),
    })),
  }
  mapaCalor.max = Math.max(0, ...mapaCalor.filas.flatMap(f => f.valores))

  const modalidad = ['presencial', 'online'].map(m => {
    const del = clases.filter(c => c.modalidad === m)
    return { modalidad: m === 'online' ? 'Online' : 'Presencial', ...acumular(del) }
  })

  const precios = [...agruparPor(clases, c => c.precio_hora)]
    .map(([precio, lista]) => ({ precio, clases: lista.length }))
    .sort((a, b) => a.precio - b.precio)

  // ─── Familias y alumnos ───
  const familias = [...agruparPor(clases.filter(c => c.familia_id != null), c => c.familia_id)]
    .map(([id, lista]) => ({
      familia_id: id,
      nombre: lista[0].familia,
      alumnos: [...new Set(lista.map(c => c.alumno))].sort(),
      ...acumular(lista),
      sinCobrar: suma(lista.filter(c => c.cobro === 'pendiente'), c => c.monto),
    }))
    .filter(f => f.alumnos.length > 1)
    .sort((a, b) => b.ingreso - a.ingreso)

  const ranking = [...agruparPor(clases, c => c.alumno_id)]
    .map(([id, lista]) => {
      const total = acumular(lista)
      const online = lista.filter(c => c.modalidad === 'online').length
      return {
        alumno_id: id,
        alumno: lista[0].alumno,
        familia: lista[0].familia,
        ...total,
        porClase: Math.round(total.ingreso / total.clases),
        sinCobrar: suma(lista.filter(c => c.cobro === 'pendiente'), c => c.monto),
        modalidad: online > lista.length / 2 ? 'Online' : 'Presencial',
        desde: lista.map(c => c.fecha).sort()[0].slice(0, 7),
        ultima: lista.map(c => c.fecha).sort().at(-1),
      }
    })
    .sort((a, b) => b.ingreso - a.ingreso)

  // ─── Mes en curso vs mismo mes de años anteriores ───
  function mismoMes(numMes) {
    const mm = String(numMes).padStart(2, '0')
    return anios.map((anio) => {
      const del = clases.filter(c => c.fecha.startsWith(`${anio}-${mm}`))
      return { anio, ...acumular(del), enCurso: `${anio}-${mm}` === mesActual }
    }).filter(f => f.clases > 0 || f.enCurso)
      .map((f, i, arr) => ({ ...f, variacion: i > 0 ? variacion(f.ingreso, arr[i - 1].ingreso) : null }))
  }

  // Lo que se llevaba al mismo día del mes en años previos.
  const mmActual = mesActual.slice(5, 7)
  const actualAlDia = acumular(clases.filter(c => c.fecha.startsWith(mesActual) && Number(c.fecha.slice(8, 10)) <= diaHoy))
  const anteriores = anios.filter(a => a < hoy.slice(0, 4)).map(anio => {
    const delMes = clases.filter(c => c.fecha.startsWith(`${anio}-${mmActual}`))
    const alDia = acumular(delMes.filter(c => Number(c.fecha.slice(8, 10)) <= diaHoy))
    return { anio, alDia, final: acumular(delMes) }
  }).filter(a => a.final.clases > 0)

  // Proyección: lo de hoy × cuánto creció este mes, en promedio, después de este día en años
  // previos (solo años con algo al día de hoy). Sin historia → proporcional a los días.
  const [y, m] = mesActual.split('-').map(Number)
  const diasMes = new Date(y, m, 0).getDate()
  const factores = anteriores.filter(a => a.alDia.ingreso > 0).map(a => a.final.ingreso / a.alDia.ingreso)
  const factor = factores.length ? suma(factores, f => f) / factores.length : diasMes / Math.max(diaHoy, 1)
  const factorClases = anteriores.filter(a => a.alDia.clases > 0).map(a => a.final.clases / a.alDia.clases)
  const ultimoAnio = anteriores.at(-1)
  const proyeccion = {
    mes: mesActual,
    dia: diaHoy,
    diasMes,
    actual: actualAlDia,
    proyectado: Math.round(actualAlDia.ingreso * factor),
    clasesProyectadas: Math.round(actualAlDia.clases * (factorClases.length ? suma(factorClases, f => f) / factorClases.length : factor)),
    basadoEnHistoria: factores.length > 0,
    vsPromedio: variacion(Math.round(actualAlDia.ingreso * factor), mensual.ingresoProm),
    anioAnterior: ultimoAnio ? { anio: ultimoAnio.anio, final: ultimoAnio.final.ingreso } : null,
    vsAnioAnterior: ultimoAnio ? variacion(Math.round(actualAlDia.ingreso * factor), ultimoAnio.final.ingreso) : null,
    anteriores: anteriores.map(a => ({ anio: a.anio, ingreso: a.alDia.ingreso, clases: a.alDia.clases, variacion: variacion(actualAlDia.ingreso, a.alDia.ingreso) })),
  }

  // ─── Insights ───
  const insights = []
  const cuentas = [...agruparPor(clases, claveCuenta)]
    .map(([, lista]) => ({ nombre: nombreCuenta(lista[0]), ingreso: suma(lista, c => c.monto) }))
    .sort((a, b) => b.ingreso - a.ingreso)
  if (cuentas.length && facturado) {
    const top = cuentas[0]
    const pctTop = Math.round((top.ingreso / facturado) * 100)
    const pctTop3 = Math.round((suma(ranking.slice(0, 3), r => r.ingreso) / facturado) * 100)
    insights.push({
      tipo: 'info',
      titulo: 'Concentración',
      texto: `${top.nombre} = ${pctTop}% del total facturado. Los 3 alumnos principales = ${pctTop3}%.`,
    })
    if (pctTop >= 25) {
      insights.push({
        tipo: 'riesgo',
        titulo: 'Riesgo de cliente',
        texto: `Si ${top.nombre.startsWith('familia ') ? `la ${top.nombre}` : top.nombre} deja de tomar clases, pierdes cerca del ${pctTop}% del negocio de golpe.`,
      })
    }
  }
  if (sinCobrar > 0) {
    const deudas = ranking.filter(r => r.sinCobrar > 0).sort((a, b) => b.sinCobrar - a.sinCobrar).slice(0, 3)
    insights.push({
      tipo: 'alerta',
      titulo: 'Sin cobrar',
      texto: `${String(kpis.pctPendiente).replace('.', ',')}% de lo facturado. Mayores deudas: ${deudas.map(d => `${d.alumno} ${formatoCorto(d.sinCobrar)}`).join(', ')}.`,
    })
  }
  if (horaData.length) {
    const oro = horaData.reduce((a, b) => (b.clases > a.clases ? b : a))
    const dias = [...diaSemanaData].sort((a, b) => b.clases - a.clases)
    insights.push({
      tipo: 'info',
      titulo: `Hora peak ${oro.hora}`,
      texto: `${Math.round((oro.clases / kpis.clases) * 100)}% de las clases. Días más fuertes: ${dias[0].dia} y ${dias[1].dia}; más flojos: ${dias.at(-2).dia} y ${dias.at(-1).dia}.`,
    })
  }
  const [pres, onl] = modalidad
  if (kpis.clases) {
    insights.push({
      tipo: 'info',
      titulo: `${Math.round((pres.clases / kpis.clases) * 100)}% presencial`,
      texto: `Online es el ${facturado ? Math.round((onl.ingreso / facturado) * 100) : 0}% de lo facturado.`,
    })
  }

  return {
    kpis, mensual, meses, porAnio, anios, ingresosMesAnio, estacionalidad, diaSemana: diaSemanaData,
    horaData, mapaCalor, modalidad, precios, familias, ranking, mismoMes, proyeccion, insights,
  }
}

// $460.000 → "$460k" para textos cortos.
function formatoCorto(n) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`
}
