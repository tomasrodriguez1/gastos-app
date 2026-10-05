import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
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

function IconFondos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 8a7 7 0 1 0-7 7h7a0 0 0 0 0 0 0V8z" />
      <circle cx="16.5" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
      <path d="M5 13c-1 1-2 2.5-2 4" />
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

const NAVEGACION_DESKTOP = [
  {
    grupo: 'Hoy',
    items: [
      { to: '/', end: true, icon: IconDashboard, label: 'Inicio' },
      { to: '/gastos', icon: IconGastos, label: 'Gastos' },
      { to: '/bandeja', icon: IconGastos, label: 'Bandeja', pendientes: true },
    ],
  },
  {
    grupo: 'Planificar',
    items: [
      { to: '/presupuesto', icon: IconPresupuesto, label: 'Presupuesto' },
      { to: '/fondos', icon: IconFondos, label: 'Fondos' },
      { to: '/tarjeta', icon: IconTarjeta, label: 'Tarjetas' },
    ],
  },
  {
    grupo: 'Entender',
    items: [
      { to: '/cashflow', icon: IconCashflow, label: 'Flujo del ciclo' },
      { to: '/analisis', icon: IconAnalisis, label: 'Análisis' },
    ],
  },
]

const MOBILE_NAV_PRINCIPAL = [
  { to: '/', end: true, icon: IconDashboard, label: 'Inicio' },
  { to: '/gastos', icon: IconGastos, label: 'Gastos' },
  { to: '/presupuesto', icon: IconPresupuesto, label: 'Presupuesto' },
]

const MOBILE_NAV_MAS = [
  { to: '/bandeja', icon: IconGastos, label: 'Bandeja', pendientes: true },
  { to: '/cashflow', icon: IconCashflow, label: 'Flujo' },
  { to: '/analisis', icon: IconAnalisis, label: 'Análisis' },
  { to: '/fondos', icon: IconFondos, label: 'Fondos' },
  { to: '/tarjeta', icon: IconTarjeta, label: 'Tarjetas' },
  { to: '/passkeys', icon: IconLlave, label: 'Cuenta' },
]

export function Sidebar({ gastos = [], gastosLocales = [] }) {
  const { isPrivacyModeEnabled, togglePrivacyMode } = usePrivacyMode()
  const { logout } = useAuth()
  const location = useLocation()
  const [menuMasAbierto, setMenuMasAbierto] = useState(false)
  const [menuRegistrarAbierto, setMenuRegistrarAbierto] = useState(false)

  const pendientes = [...gastos, ...gastosLocales]
    .filter(gasto => gasto.estado === 'pendiente' || gasto.estado === 'error_parseo').length

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

  function cerrarMenus() {
    setMenuMasAbierto(false)
    setMenuRegistrarAbierto(false)
  }

  function alternarMas() {
    setMenuMasAbierto(abierto => !abierto)
    setMenuRegistrarAbierto(false)
  }

  function alternarRegistrar() {
    setMenuRegistrarAbierto(abierto => !abierto)
    setMenuMasAbierto(false)
  }

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
          <nav className="flex flex-col gap-5" aria-label="Navegación principal">
            {NAVEGACION_DESKTOP.map(({ grupo, items }) => (
              <div key={grupo}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{grupo}</p>
                <div className="flex flex-col gap-1">
                  {items.map(({ to, end, icon: Icon, label, pendientes: mostrarPendientes }) => (
                    <NavLink key={to} to={to} end={end} className={navClass}>
                      <Icon />
                      <span className="flex-1">{label}</span>
                      {mostrarPendientes && pendientes > 0 && (
                        <span className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-slate-950">
                          {pendientes}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-auto pt-4">
            <NavLink to="/agente" className="mb-2 flex w-full items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15">
              <IconAgente />
              Abrir agente
            </NavLink>
            <NavLink to="/passkeys" className={navClass}>
              <IconLlave />
              Cuenta
            </NavLink>
            <button
              onClick={logout}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-white/4 transition-colors"
            >
              <IconLogout />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav ───────────────────────────────────── */}
      {(menuMasAbierto || menuRegistrarAbierto) && (
        <div
          className="fixed inset-0 z-[199] md:hidden bg-black/50"
          onClick={cerrarMenus}
        />
      )}

      <nav className="fixed bottom-0 inset-x-0 z-[200] md:hidden border-t border-slate-800 bg-[var(--background)]/95 backdrop-blur pb-safe">
        {menuMasAbierto && (
          <div className="border-b border-slate-800 px-3 pt-3 pb-2">
            <div className="grid grid-cols-4 gap-1">
              {MOBILE_NAV_MAS.map(({ to, icon: Icon, label, pendientes: mostrarPendientes }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={mobileNavClass}
                  onClick={cerrarMenus}
                >
                  <span className="relative">
                    <Icon />
                    {mostrarPendientes && pendientes > 0 && (
                      <span className="absolute -top-2 -right-3 min-w-[15px] rounded-full bg-amber-500 px-1 text-center text-[9px] font-bold leading-[15px] text-slate-950">
                        {pendientes}
                      </span>
                    )}
                  </span>
                  <span>{label}</span>
                </NavLink>
              ))}
              <button
                onClick={() => {
                  togglePrivacyMode()
                  cerrarMenus()
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
                  cerrarMenus()
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
        {menuRegistrarAbierto && (
          <div className="border-b border-slate-800 px-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/gastos?nuevo=1"
                onClick={cerrarMenus}
                className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-3 text-left text-sm font-medium text-sky-300 transition-colors active:scale-[0.98]"
              >
                <span className="block">Nuevo gasto</span>
                <span className="mt-0.5 block text-xs font-normal text-sky-300/70">Registrarlo manualmente</span>
              </Link>
              <Link
                to="/agente"
                onClick={cerrarMenus}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-left text-sm font-medium text-emerald-300 transition-colors active:scale-[0.98]"
              >
                <span className="block">Hablar con agente</span>
                <span className="mt-0.5 block text-xs font-normal text-emerald-300/70">Escribir o adjuntar una boleta</span>
              </Link>
            </div>
          </div>
        )}
        <div className="flex items-center h-16 px-1">
          {MOBILE_NAV_PRINCIPAL.slice(0, 2).map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={mobileNavClass}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={alternarRegistrar}
            aria-expanded={menuRegistrarAbierto}
            className={`relative flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium transition-colors min-w-0 flex-1 ${
              menuRegistrarAbierto ? 'text-[var(--accent)]' : 'text-slate-200'
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400 text-xl font-light leading-none text-slate-950">+</span>
            <span>Registrar</span>
          </button>
          {MOBILE_NAV_PRINCIPAL.slice(2).map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={mobileNavClass}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={alternarMas}
            aria-expanded={menuMasAbierto}
            className={`flex flex-col items-center gap-1 px-2 py-1 text-xs font-medium transition-colors min-w-0 flex-1 ${
              menuMasAbierto || rutaActivaEnMas ? 'text-[var(--accent)]' : 'text-muted'
            }`}
          >
            <span className="relative">
              <IconMas />
              {pendientes > 0 && (
                <span className="absolute -top-2 -right-3 min-w-[15px] rounded-full bg-amber-500 px-1 text-center text-[9px] font-bold leading-[15px] text-slate-950">
                  {pendientes}
                </span>
              )}
            </span>
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  )
}
