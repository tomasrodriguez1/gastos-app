import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { usePrivacyMode } from '../../contexts/PrivacyModeContext'
import { useAuth } from '../../contexts/AuthContext'

// ─── Íconos SVG inline ────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconCashflow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

function IconAnalisis() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function IconGastos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )
}

function IconPresupuesto() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 0 1 0 20A10 10 0 0 1 12 2z" />
      <path d="M12 2 A10 10 0 0 1 22 12 L12 12Z" fill="currentColor" opacity="0.25" stroke="none"/>
      <line x1="12" y1="12" x2="12" y2="2" />
      <line x1="12" y1="12" x2="20" y2="16" />
    </svg>
  )
}

function IconTarjeta() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  )
}

function IconAgente() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="10" x2="8" y2="10.01" />
      <line x1="12" y1="10" x2="12" y2="10.01" />
      <line x1="16" y1="10" x2="16" y2="10.01" />
    </svg>
  )
}

function IconLlave() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function IconOjo({ open }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function IconMas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

// ─── Sidebar desktop (sin cambios) ───────────────────────────────────────────

const MOBILE_NAV_PRINCIPAL = [
  { to: '/', end: true, icon: IconDashboard, label: 'Dashboard' },
  { to: '/gastos', icon: IconGastos, label: 'Gastos' },
  { to: '/agente', icon: IconAgente, label: 'Agente' },
  { to: '/presupuesto', icon: IconPresupuesto, label: 'Presup.' },
]

const MOBILE_NAV_MAS = [
  { to: '/cashflow', icon: IconCashflow, label: 'Cashflow' },
  { to: '/analisis', icon: IconAnalisis, label: 'Análisis' },
  { to: '/tarjeta', icon: IconTarjeta, label: 'Tarjeta' },
  { to: '/passkeys', icon: IconLlave, label: 'Cuenta' },
]

export function Sidebar() {
  const { isPrivacyModeEnabled, togglePrivacyMode } = usePrivacyMode()
  const { logout } = useAuth()
  const location = useLocation()
  const [menuMasAbierto, setMenuMasAbierto] = useState(false)

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-white/8 text-foreground'
        : 'text-muted hover:text-foreground hover:bg-white/4'
    }`

  const mobileNavClass = ({ isActive }) =>
    `flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium transition-colors min-w-0 flex-1 ${
      isActive
        ? 'text-[var(--accent)]'
        : 'text-muted'
    }`

  const rutaActivaEnMas = MOBILE_NAV_MAS.some((item) => item.to === location.pathname)

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:block md:fixed md:inset-y-0 md:left-0 md:z-50 md:w-64 border-r border-slate-800 bg-[var(--background)]/95 backdrop-blur pt-safe">
        <div className="flex min-h-screen flex-col items-stretch justify-start px-5 py-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <span className="font-heading text-xl text-white">Gastos</span>
            <button
              onClick={togglePrivacyMode}
              className="h-9 rounded-lg border border-slate-800 px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              title={isPrivacyModeEnabled ? 'Mostrar montos' : 'Ocultar montos'}
            >
              {isPrivacyModeEnabled ? 'Mostrar' : 'Ocultar'}
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            <NavLink to="/" end className={navClass}>Dashboard</NavLink>
            <NavLink to="/cashflow" className={navClass}>Cashflow</NavLink>
            <NavLink to="/analisis" className={navClass}>Análisis</NavLink>
            <NavLink to="/gastos" className={navClass}>Gastos</NavLink>
            <NavLink to="/agente" className={navClass}>Agente</NavLink>
            <NavLink to="/tarjeta" className={navClass}>Tarjeta</NavLink>
            <NavLink to="/presupuesto" className={navClass}>Presupuesto</NavLink>
            <NavLink to="/passkeys" className={navClass}>Cuenta</NavLink>
          </nav>
          <div className="mt-auto pt-4">
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-white/4 transition-colors"
            >
              <IconLogout />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav ───────────────────────────────────── */}
      {menuMasAbierto && (
        <div
          className="fixed inset-0 z-[199] md:hidden bg-black/50"
          onClick={() => setMenuMasAbierto(false)}
        />
      )}

      <nav className="fixed bottom-0 inset-x-0 z-[200] md:hidden border-t border-slate-800 bg-[var(--background)]/95 backdrop-blur pb-safe">
        {menuMasAbierto && (
          <div className="border-b border-slate-800 px-3 pt-3 pb-2">
            <div className="grid grid-cols-4 gap-1">
              {MOBILE_NAV_MAS.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={mobileNavClass}
                  onClick={() => setMenuMasAbierto(false)}
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
              <button
                onClick={() => {
                  togglePrivacyMode()
                  setMenuMasAbierto(false)
                }}
                className={`flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium transition-colors min-w-0 ${
                  isPrivacyModeEnabled ? 'text-[var(--accent)]' : 'text-muted'
                }`}
              >
                <IconOjo open={!isPrivacyModeEnabled} />
                <span>{isPrivacyModeEnabled ? 'Mostrar' : 'Ocultar'}</span>
              </button>
              <button
                onClick={() => {
                  setMenuMasAbierto(false)
                  logout()
                }}
                className="flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium text-muted transition-colors min-w-0"
              >
                <IconLogout />
                <span>Salir</span>
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center h-16 px-1">
          {MOBILE_NAV_PRINCIPAL.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={mobileNavClass}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMenuMasAbierto((v) => !v)}
            className={`flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium transition-colors min-w-0 flex-1 ${
              menuMasAbierto || rutaActivaEnMas ? 'text-[var(--accent)]' : 'text-muted'
            }`}
          >
            <IconMas />
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  )
}
