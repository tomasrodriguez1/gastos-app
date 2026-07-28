import { usePasskeyAuth } from '../../hooks/usePasskeyAuth'

export function LoginScreen() {
  const { supported, login, busy, error } = usePasskeyAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-heading text-2xl text-white mb-1">Gastos App</h1>
        <p className="text-sm text-slate-500 mb-8">Acceso con passkey</p>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          {!supported ? (
            <p className="text-sm text-red-400">
              Este navegador no soporta passkeys (WebAuthn). Probá con Safari, Chrome o Edge actualizados.
            </p>
          ) : (
            <>
              <button
                onClick={login}
                disabled={busy}
                className="w-full px-4 py-3 rounded-lg text-sm font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Verificando…' : 'Ingresar con passkey'}
              </button>
              {error && (
                <div className="mt-4 text-xs text-red-400 space-y-2">
                  <p>{error}</p>
                  <button onClick={login} className="underline hover:text-red-300">Reintentar</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
