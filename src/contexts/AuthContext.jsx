/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiFetch } from '../utils/apiClient'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [status, setStatus] = useState({
    authenticated: false,
    passkeyConfigured: false,
    bootstrapRequired: false,
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/status')
      if (res.ok) setStatus(await res.json())
    } catch {
      // Sin conexión — mantiene el último estado conocido.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/auth/status')
        if (ignore) return
        if (res.ok) setStatus(await res.json())
      } catch {
        // Sin conexión — mantiene el último estado conocido.
      } finally {
        if (!ignore) setLoading(false)
      }
    })()
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    function onUnauthorized() {
      setStatus((prev) => ({ ...prev, authenticated: false }))
    }
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setStatus((prev) => ({ ...prev, authenticated: false }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...status, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
