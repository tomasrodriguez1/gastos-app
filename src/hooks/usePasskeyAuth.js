import { useCallback, useState } from 'react'
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser'
import { apiFetch, apiJson } from '../utils/apiClient'
import { useAuth } from '../contexts/AuthContext'

function friendlyError(e) {
  if (e?.name === 'NotAllowedError') return 'Cancelaste la operación o se agotó el tiempo. Intentá de nuevo.'
  if (e?.message) return e.message
  return 'Ocurrió un error inesperado.'
}

export function usePasskeyAuth() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { refresh } = useAuth()

  const supported = browserSupportsWebAuthn()

  const bootstrap = useCallback(async (secret, name) => {
    setBusy(true)
    setError(null)
    try {
      const optionsRes = await apiFetch('/api/auth/passkey/register/options', {
        method: 'POST',
        headers: { 'X-Bootstrap-Secret': secret },
      })
      if (!optionsRes.ok) {
        const body = await optionsRes.json().catch(() => null)
        throw new Error(body?.error || 'Secreto de bootstrap incorrecto')
      }
      const optionsJSON = await optionsRes.json()
      const attResp = await startRegistration({ optionsJSON })

      const verifyRes = await apiFetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Secret': secret },
        body: JSON.stringify({ ...attResp, name: name || undefined }),
      })
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => null)
        throw new Error(body?.error || 'No se pudo verificar el registro')
      }
      await refresh()
      return true
    } catch (e) {
      setError(friendlyError(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const addPasskey = useCallback(async (name) => {
    setBusy(true)
    setError(null)
    try {
      const optionsJSON = await apiJson('/api/auth/passkey/register/options', { method: 'POST' })
      const attResp = await startRegistration({ optionsJSON })
      await apiJson('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...attResp, name: name || undefined }),
      })
      return true
    } catch (e) {
      setError(friendlyError(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const login = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const optionsRes = await apiFetch('/api/auth/passkey/login/options', { method: 'POST' })
      if (!optionsRes.ok) {
        const body = await optionsRes.json().catch(() => null)
        throw new Error(body?.error || 'No se pudo iniciar el login')
      }
      const optionsJSON = await optionsRes.json()
      const authResp = await startAuthentication({ optionsJSON })

      const verifyRes = await apiFetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResp),
      })
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => null)
        throw new Error(body?.error || 'No se pudo verificar el inicio de sesión')
      }
      await refresh()
      return true
    } catch (e) {
      setError(friendlyError(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [refresh])

  return { supported, bootstrap, addPasskey, login, busy, error, setError }
}
