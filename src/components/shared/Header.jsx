import { NavLink } from 'react-router-dom'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'

export function Sidebar() {
  const { isPrivacyModeEnabled, togglePrivacyMode } = usePrivacyMode()

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-white/8 text-foreground'
        : 'text-muted hover:text-foreground hover:bg-white/4'
    }`

  return (
    <aside className="border-b border-slate-800 bg-[var(--background)]/95 backdrop-blur md:fixed md:inset-y-0 md:left-0 md:z-50 md:w-64 md:border-b-0 md:border-r md:pt-safe">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 md:min-h-screen md:flex-col md:items-stretch md:justify-start md:px-5 md:py-6">
        <div className="flex items-center justify-between gap-3 md:mb-6">
          <span className="font-heading text-xl text-white">Gastos</span>
          <button
            onClick={togglePrivacyMode}
            className="hidden h-9 rounded-lg border border-slate-800 px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 md:block"
            title={isPrivacyModeEnabled ? 'Mostrar montos' : 'Ocultar montos'}
          >
            {isPrivacyModeEnabled ? 'Mostrar' : 'Ocultar'}
          </button>
        </div>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <NavLink to="/" end className={navClass}>Dashboard</NavLink>
          <NavLink to="/cashflow" className={navClass}>Cashflow</NavLink>
          <NavLink to="/gastos" className={navClass}>Gastos</NavLink>
          <NavLink to="/presupuesto" className={navClass}>Presupuesto</NavLink>
        </nav>
        <div className="md:hidden">
          <button
            onClick={togglePrivacyMode}
            className="h-9 rounded-lg border border-slate-800 px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            title={isPrivacyModeEnabled ? 'Mostrar montos' : 'Ocultar montos'}
          >
            {isPrivacyModeEnabled ? 'Mostrar' : 'Ocultar'}
          </button>
        </div>
      </div>
    </aside>
  )
}
