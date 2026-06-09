import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export function BotonActualizar({ onSync, syncing, error, compact = false }) {
  const isOnline = useOnlineStatus()
  const disabled = syncing || !isOnline
  const buttonClass = [
    'flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 font-medium hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all',
    compact ? 'px-2.5 py-2 text-base' : 'px-4 py-2 text-sm',
    error ? 'animate-pulse border-red-500/50 text-red-400' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="flex items-center gap-3">
      {error && !compact && (
        <span className="text-xs text-red-400">{error}</span>
      )}
      <button
        onClick={onSync}
        disabled={disabled}
        className={buttonClass}
        title={!isOnline ? 'Sin conexión' : syncing ? 'Actualizando...' : 'Actualizar datos'}
      >
        <span className={syncing ? 'animate-spin inline-block' : ''}>↻</span>
        {!compact && (!isOnline ? 'Sin conexión' : syncing ? 'Actualizando...' : 'Actualizar datos')}
      </button>
    </div>
  )
}
