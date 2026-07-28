import { useAuth } from '../../contexts/AuthContext'
import { BootstrapScreen } from './BootstrapScreen'
import { LoginScreen } from './LoginScreen'

export function RouteGuard({ children }) {
  const { loading, authenticated, bootstrapRequired } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-800" />
      </div>
    )
  }

  if (!authenticated && bootstrapRequired) return <BootstrapScreen />
  if (!authenticated) return <LoginScreen />

  return children
}
