import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export function BotonActualizar({ onSync, syncing, error }) {
  const isOnline = useOnlineStatus()
  const disabled = syncing || !isOnline
  const buttonClass = [
    'flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-sm font-medium hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all',
    error ? 'animate-pulse border-red-500/50 text-red-400' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
      <button
        onClick={onSync}
        disabled={disabled}
        className={buttonClass}
      >
        <span className={`text-base ${syncing ? 'animate-spin inline-block' : ''}`}>
          {syncing ? '⟳' : '↻'}
        </span>
        {!isOnline ? 'Sin conexión' : syncing ? 'Actualizando...' : 'Actualizar datos'}
      </button>
    </div>
  )
}
