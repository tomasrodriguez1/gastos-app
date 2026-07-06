import { useState } from 'react'
import { SelectorMes } from '../components/shared/SelectorMes'
import { ComparadorMensual } from '../components/Analisis/ComparadorMensual'
import { TendenciasCategorias } from '../components/Analisis/TendenciasCategorias'
import { GastosRecurrentes } from '../components/Analisis/GastosRecurrentes'
import { GraficoTendenciaCategoria } from '../components/Dashboard/GraficoTendenciaCategoria'
import { getMesActual } from '../utils/formatters'

export function AnalisisPage({ gastos, meses }) {
  const [mes, setMes] = useState(getMesActual)

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-heading text-3xl text-white">Análisis</h1>
        <SelectorMes mes={mes} meses={meses} onChange={setMes} />
      </div>

      <ComparadorMensual gastos={gastos} mes={mes} />

      <TendenciasCategorias gastos={gastos} mes={mes} />

      <GraficoTendenciaCategoria gastos={gastos} mesActual={mes} />

      <GastosRecurrentes gastos={gastos} />
    </main>
  )
}
