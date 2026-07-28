import { useState } from 'react'
import { usePasskeyAuth } from '../../hooks/usePasskeyAuth'

export function BootstrapScreen() {
  const { supported, bootstrap, busy, error } = usePasskeyAuth()
  const [secret, setSecret] = useState('')
  const [name, setName] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!secret) return
    await bootstrap(secret, name.trim())
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl text-white text-center mb-1">Gastos App</h1>
        <p className="text-sm text-slate-500 text-center mb-8">Configuración inicial de acceso</p>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          {!supported ? (
            <p className="text-sm text-red-400">
              Este navegador no soporta passkeys (WebAuthn). Probá con Safari, Chrome o Edge actualizados.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
                  Secreto de bootstrap
                </label>
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  placeholder="PASSKEY_BOOTSTRAP_SECRET"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
                  Nombre de la passkey (opcional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: 1Password, MacBook, iPhone"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
                />
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={busy || !secret}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Creando passkey…' : 'Crear passkey'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
