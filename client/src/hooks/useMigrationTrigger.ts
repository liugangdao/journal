import { useEffect } from 'react'
import { getLocalStore } from './useStore'

export type MigrationStatus = 'idle' | 'running' | 'success' | 'error'

/**
 * Reads the ?just_signed_in=1 flag from the URL on mount and, if present,
 * drains the client LocalStore into the authenticated user's server rows
 * via POST /api/migrate. On success the local Dexie DB is cleared and the
 * query flag is removed from the URL via history.replaceState so a refresh
 * does not re-trigger the migration.
 *
 * Failure mode: the local data is preserved (never cleared on error). The
 * caller-supplied onStatus callback reports 'idle' → 'running' → 'success'
 * or 'error' transitions.
 */
export function useMigrationTrigger(onStatus?: (s: MigrationStatus) => void): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('just_signed_in') !== '1') return

    let cancelled = false
    ;(async () => {
      onStatus?.('running')
      try {
        const local = getLocalStore()
        const payload = await local.exportAll()
        const total =
          payload.trades.length +
          payload.weekly_notes.length +
          payload.monthly_notes.length +
          payload.policies.length +
          payload.pairs.length +
          payload.trade_violations.length

        if (total > 0) {
          const res = await fetch('/api/migrate', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
          }
          await local.clearAll()
        }
        if (!cancelled) onStatus?.('success')
      } catch (err) {
        console.error('[migrate] failed', err)
        if (!cancelled) onStatus?.('error')
      } finally {
        const url = new URL(window.location.href)
        url.searchParams.delete('just_signed_in')
        window.history.replaceState(null, '', url.toString())
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
