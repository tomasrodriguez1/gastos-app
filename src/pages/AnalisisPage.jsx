import { useState } from 'react'
import { SelectorCiclo } from '../components/shared/SelectorCiclo'
import { ComparadorMensual } from '../components/Analisis/ComparadorMensual'
import { TendenciasCategorias } from '../components/Analisis/TendenciasCategorias'
import { GastosRecurrentes } from '../components/Analisis/GastosRecurrentes'
import { GraficoTendenciaCategoria } from '../components/Dashboard/GraficoTendenciaCategoria'
import { obtenerCicloActual } from '../utils/ciclos'

export function AnalisisPage({ gastos, ciclos }) {
  const [ciclo, setCiclo] = useState(obtenerCicloActual)

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-heading text-3xl text-white">Análisis</h1>
        <SelectorCiclo ciclo={ciclo} ciclos={ciclos} onChange={setCiclo} />
      </div>

      <ComparadorMensual gastos={gastos} mes={ciclo} />

      <TendenciasCategorias gastos={gastos} mes={ciclo} />

      <GraficoTendenciaCategoria gastos={gastos} mesActual={ciclo} />

      <GastosRecurrentes gastos={gastos} />
    </main>
  )
}
