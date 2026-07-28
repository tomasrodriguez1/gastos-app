import { useEffect, useState } from 'react'
import { apiJson } from '../utils/apiClient'
import { usePasskeyAuth } from '../hooks/usePasskeyAuth'
import { useAuth } from '../contexts/AuthContext'
import { formatFechaHora } from '../utils/formatters'

export function PasskeysPage() {
  const [passkeys, setPasskeys] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [newName, setNewName] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const { addPasskey, busy, error: addError, setError: setAddError } = usePasskeyAuth()
  const { logout } = useAuth()

  async function cargar() {
    try {
      const data = await apiJson('/api/auth/passkeys')
      setPasskeys(data.passkeys)
      setLoadError(null)
    } catch (e) {
      setLoadError(e.message)
    }
  }

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const data = await apiJson('/api/auth/passkeys')
        if (ignore) return
        setPasskeys(data.passkeys)
        setLoadError(null)
      } catch (e) {
        if (!ignore) setLoadError(e.message)
      }
    })()
    return () => { ignore = true }
  }, [])

  async function handleAgregar(e) {
    e.preventDefault()
    const ok = await addPasskey(newName.trim())
    if (ok) {
      setNewName('')
      await cargar()
    }
  }

  async function handleEliminar(id) {
    setDeleteError(null)
    try {
      await apiJson(`/api/auth/passkeys/${id}`, { method: 'DELETE' })
      setConfirmingId(null)
      await cargar()
    } catch (e) {
      setDeleteError(e.message)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 pb-24 md:pb-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl text-white">Passkeys</h1>
        <button
          onClick={logout}
          className="md:hidden px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}

      {passkeys && (
        <div className="space-y-3">
          {passkeys.length === 0 && (
            <p className="text-sm text-slate-500">No hay passkeys registradas.</p>
          )}
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm font-medium text-slate-200">{pk.name || 'Passkey sin nombre'}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Creada {formatFechaHora(pk.createdAt)}
                  {pk.lastUsedAt && ` · Último uso ${formatFechaHora(pk.lastUsedAt)}`}
                </div>
              </div>

              {confirmingId === pk.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">¿Eliminar?</span>
                  <button
                    onClick={() => handleEliminar(pk.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(pk.id)}
                  disabled={passkeys.length <= 1}
                  title={passkeys.length <= 1 ? 'No podés eliminar la última passkey' : undefined}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Eliminar
                </button>
              )}
            </div>
          ))}
          {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
        </div>
      )}

      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
        <h2 className="text-sm font-medium text-slate-200 mb-3">Agregar otra passkey</h2>
        <form onSubmit={handleAgregar} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              setAddError(null)
            }}
            placeholder="Ej: iCloud Keychain"
            className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Agregando…' : 'Agregar'}
          </button>
        </form>
        {addError && <p className="text-xs text-red-400 mt-2">{addError}</p>}
      </div>
    </div>
  )
}
