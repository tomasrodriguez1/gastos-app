import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SelectorCiclo } from '../components/shared/SelectorCiclo'
import { ComparadorMensual } from '../components/Analisis/ComparadorMensual'
import { TendenciasCategorias } from '../components/Analisis/TendenciasCategorias'
import { GastosRecurrentes } from '../components/Analisis/GastosRecurrentes'
import { GraficoEvolucionPresupuesto } from '../components/Dashboard/GraficoEvolucionPresupuesto'
import { GraficoTendencia } from '../components/Dashboard/GraficoTendencia'
import { GraficoTendenciaCategoria } from '../components/Dashboard/GraficoTendenciaCategoria'
import { obtenerCicloActual } from '../utils/ciclos'

export function AnalisisPage({ gastos, ciclos }) {
  const [ciclo, setCiclo] = useState(obtenerCicloActual)

  return (
    <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl text-white">Análisis histórico</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cómo vino el gasto entre ciclos. Lo de hoy está en el <Link to="/" className="text-sky-300 hover:text-sky-200">inicio</Link>.
          </p>
        </div>
        <SelectorCiclo ciclo={ciclo} ciclos={ciclos} onChange={setCiclo} />
      </div>

      <GraficoEvolucionPresupuesto gastos={gastos} />

      <GraficoTendencia gastos={gastos} mesActual={ciclo} />

      <ComparadorMensual gastos={gastos} mes={ciclo} />

      <TendenciasCategorias gastos={gastos} mes={ciclo} />

      <GraficoTendenciaCategoria gastos={gastos} mesActual={ciclo} />

      <GastosRecurrentes gastos={gastos} />
    </main>
  )
}
