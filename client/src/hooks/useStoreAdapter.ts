import { useMemo } from 'react'
import type { JournalStore } from '../stores/JournalStore'
import type {
  TradeRow,
  WeeklyNote,
  MonthlyNote,
  PolicyRow,
  PairRow,
} from '../stores/types'

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ext-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface StoreAdapter {
  listTrades: (params?: unknown) => Promise<{ trades: TradeRow[]; total: number; limit: number; offset: number }>
  getTrades: (params?: unknown) => Promise<{ trades: TradeRow[]; total: number; limit: number; offset: number }>
  createTrade: (trade: Partial<TradeRow>) => Promise<TradeRow>
  updateTrade: (idOrExternalId: string | number, patch: Partial<TradeRow>) => Promise<TradeRow>
  deleteTrade: (idOrExternalId: string | number) => Promise<void>
  getTradeViolations: (idOrExternalId: string | number) => Promise<Array<{ policy_external_id: string }>>
  updateTradeViolations: (
    idOrExternalId: string | number,
    violations: Array<string | number>
  ) => Promise<void>

  getNotes: () => Promise<WeeklyNote[]>
  createNote: (note: Partial<WeeklyNote>) => Promise<WeeklyNote>
  deleteNote: (idOrExternalId: string | number) => Promise<void>
  getMonthlyNotes: () => Promise<MonthlyNote[]>
  createMonthlyNote: (note: Partial<MonthlyNote>) => Promise<MonthlyNote>
  deleteMonthlyNote: (idOrExternalId: string | number) => Promise<void>

  getPolicies: () => Promise<PolicyRow[]>
  createPolicy: (policy: Partial<PolicyRow>) => Promise<PolicyRow>
  updatePolicy: (idOrExternalId: string | number, patch: Partial<PolicyRow>) => Promise<PolicyRow>
  deletePolicy: (idOrExternalId: string | number) => Promise<void>
  togglePolicy: (idOrExternalId: string | number, is_active: number) => Promise<PolicyRow>

  getPairs: () => Promise<PairRow[]>
  createPair: (pair: Partial<PairRow>) => Promise<PairRow>
  updatePair: (idOrExternalId: string | number, patch: Partial<PairRow>) => Promise<PairRow>
  deletePair: (idOrExternalId: string | number) => Promise<void>

  getViolationStats: () => Promise<unknown>

  // Export / import — thin pass-through to JournalStore.
  exportAll: JournalStore['exportAll']
  importAll: JournalStore['importAll']

  logout: () => Promise<void>
}

export function useStoreAdapter(store: JournalStore): StoreAdapter {
  return useMemo<StoreAdapter>(() => {
    async function resolveTradeExternalId(idOrExternalId: string | number): Promise<string> {
      if (typeof idOrExternalId === 'string') return idOrExternalId
      const trades = await store.listTrades()
      const found = trades.find((t) => t.id === idOrExternalId)
      if (!found) throw new Error(`Trade not found: ${idOrExternalId}`)
      return found.external_id
    }

    async function resolveNoteExternalId(
      idOrExternalId: string | number,
      list: () => Promise<Array<WeeklyNote | MonthlyNote>>
    ): Promise<string> {
      if (typeof idOrExternalId === 'string') return idOrExternalId
      const rows = await list()
      const found = rows.find((n) => n.id === idOrExternalId)
      if (!found) throw new Error(`Note not found: ${idOrExternalId}`)
      return found.external_id
    }

    return {
      listTrades: async () => {
        const trades = await store.listTrades()
        return { trades, total: trades.length, limit: 0, offset: 0 }
      },
      getTrades: async () => {
        const trades = await store.listTrades()
        return { trades, total: trades.length, limit: 0, offset: 0 }
      },
      createTrade: async (trade) => {
        const external_id = trade.external_id ?? uuid()
        return store.addTrade({ ...(trade as TradeRow), external_id })
      },
      updateTrade: async (idOrExternalId, patch) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        return store.updateTrade(external_id, patch)
      },
      deleteTrade: async (idOrExternalId) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        await store.deleteTrade(external_id)
      },
      getTradeViolations: async (idOrExternalId) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        const rows = await store.listViolationsForTrade(external_id)
        return rows.map((r) => ({ policy_external_id: r.policy_external_id }))
      },
      updateTradeViolations: async (idOrExternalId, violations) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        const policyExternalIds = violations.map(String)
        await store.setViolationsForTrade(external_id, policyExternalIds)
      },

      getNotes: () => store.listWeeklyNotes(),
      createNote: async (note) => {
        const external_id = note.external_id ?? uuid()
        return store.upsertWeeklyNote({ ...(note as WeeklyNote), external_id })
      },
      deleteNote: async (idOrExternalId) => {
        const external_id = await resolveNoteExternalId(idOrExternalId, () => store.listWeeklyNotes())
        await store.deleteWeeklyNote(external_id)
      },
      getMonthlyNotes: () => store.listMonthlyNotes(),
      createMonthlyNote: async (note) => {
        const external_id = note.external_id ?? uuid()
        return store.upsertMonthlyNote({ ...(note as MonthlyNote), external_id })
      },
      deleteMonthlyNote: async (idOrExternalId) => {
        const external_id = await resolveNoteExternalId(idOrExternalId, () => store.listMonthlyNotes())
        await store.deleteMonthlyNote(external_id)
      },

      getPolicies: () => store.listPolicies(),
      createPolicy: async (policy) => {
        const external_id = policy.external_id ?? uuid()
        return store.upsertPolicy({ ...(policy as PolicyRow), external_id })
      },
      updatePolicy: async (idOrExternalId, patch) => {
        const policies = await store.listPolicies()
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : policies.find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Policy not found')
        const current = policies.find((p) => p.external_id === external_id)!
        return store.upsertPolicy({ ...current, ...patch, external_id })
      },
      deletePolicy: async (idOrExternalId) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listPolicies()).find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Policy not found')
        await store.deletePolicy(external_id)
      },
      togglePolicy: async (idOrExternalId, is_active) => {
        const policies = await store.listPolicies()
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : policies.find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Policy not found')
        const current = policies.find((p) => p.external_id === external_id)!
        return store.upsertPolicy({ ...current, is_active, external_id })
      },

      getPairs: () => store.listPairs(),
      createPair: async (pair) => {
        const external_id = pair.external_id ?? uuid()
        return store.upsertPair({ ...(pair as PairRow), external_id })
      },
      updatePair: async (idOrExternalId, patch) => {
        const pairs = await store.listPairs()
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : pairs.find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Pair not found')
        const current = pairs.find((p) => p.external_id === external_id)!
        return store.upsertPair({ ...current, ...patch, external_id })
      },
      deletePair: async (idOrExternalId) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listPairs()).find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Pair not found')
        await store.deletePair(external_id)
      },

      getViolationStats: async () => {
        // Server endpoint; LocalStore returns empty object.
        try {
          const res = await fetch('/api/violations/stats', { credentials: 'include' })
          if (!res.ok) return {}
          return await res.json()
        } catch {
          return {}
        }
      },

      exportAll: () => store.exportAll(),
      importAll: (payload) => store.importAll(payload),

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        } catch (err) {
          console.error('[adapter] logout', err)
        }
      },
    }
  }, [store])
}
