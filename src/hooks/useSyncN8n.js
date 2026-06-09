import { useState } from 'react'

export function useSyncN8n(setGastos) {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [pendingSync, setPendingSync] = useState(null) // null | { gastos, syncedAt }

  async function sincronizar() {
    const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL
    if (!webhookUrl || webhookUrl.includes('your-n8n-instance')) {
      setSyncError('Webhook URL no configurada en .env')
      setTimeout(() => setSyncError(null), 3000)
      return
    }
    setSyncing(true)
    setSyncError(null)
    try {
      const lastSync = localStorage.getItem('lastSync') ?? '2023-01-01'

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: lastSync }),
      })
      if (!res.ok) throw new Error('Error del servidor')
      const raw = await res.json()
      const { entries, syncedAt } = Array.isArray(raw) ? raw[0] : raw

      if (!entries?.length) {
        localStorage.setItem('lastSync', syncedAt)
        setSyncing(false)
        return
      }

      // Read existing sync_keys from DB to deduplicate
      const keysRes = await fetch('/api/gastos/sync-keys')
      if (!keysRes.ok) throw new Error('Error leyendo sync keys')
      const { sync_keys: existingSyncKeys } = await keysRes.json()
      const syncKeySet = new Set(existingSyncKeys)

      const nuevos = entries.filter(e =>
        e.fecha && e.motivo &&
        !syncKeySet.has(`${e.fecha}|${e.motivo.trim().toLowerCase()}`)
      )

      // Show review modal — don't save yet
      setPendingSync({ gastos: nuevos, syncedAt })
    } catch {
      setSyncError('Error al conectar con n8n')
      setTimeout(() => setSyncError(null), 3000)
    } finally {
      setSyncing(false)
    }
  }

  async function confirmarSync(aprobados) {
    const { syncedAt } = pendingSync ?? {}
    setPendingSync(null)

    if (aprobados.length > 0) {
      try {
        const saveRes = await fetch('/api/datos?clave=gastos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(aprobados),
        })
        if (!saveRes.ok) throw new Error('Error guardando')

        const gastosRes = await fetch('/api/datos?clave=gastos')
        if (gastosRes.ok) setGastos(await gastosRes.json())
      } catch {
        // silent — gastos may or may not have saved
      }
    }

    if (syncedAt) localStorage.setItem('lastSync', syncedAt)
  }

  function cancelarSync() {
    setPendingSync(null)
  }

  return { sincronizar, syncing, syncError, pendingSync, confirmarSync, cancelarSync }
}
