import type {
  TradeRow,
  WeeklyNote,
  MonthlyNote,
  PolicyRow,
  PairRow,
  TradeViolation,
  MigratePayload,
} from './types'
import type { JournalStore, ImportResult } from './JournalStore'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function request<T>(path: string, method: HttpMethod = 'GET', body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
  }
  if (body !== undefined) init.body = JSON.stringify(body)

  const res = await fetch(path, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = (data && (data as { error?: string }).error) || res.statusText || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

export class ApiStore implements JournalStore {
  async listTrades(): Promise<TradeRow[]> {
    const res = await request<{ trades: TradeRow[] }>('/api/trades')
    return res.trades ?? []
  }

  async addTrade(trade: Omit<TradeRow, 'id'>): Promise<TradeRow> {
    return request<TradeRow>('/api/trades', 'POST', trade)
  }

  async updateTrade(externalId: string, patch: Partial<TradeRow>): Promise<TradeRow> {
    return request<TradeRow>(`/api/trades/by-external/${encodeURIComponent(externalId)}`, 'PUT', patch)
  }

  async deleteTrade(externalId: string): Promise<void> {
    await request<unknown>(`/api/trades/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listWeeklyNotes(): Promise<WeeklyNote[]> {
    return request<WeeklyNote[]>('/api/notes')
  }

  async upsertWeeklyNote(note: WeeklyNote): Promise<WeeklyNote> {
    return request<WeeklyNote>(
      `/api/notes/by-external/${encodeURIComponent(note.external_id)}`,
      'PUT',
      note
    )
  }

  async deleteWeeklyNote(externalId: string): Promise<void> {
    await request<unknown>(`/api/notes/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listMonthlyNotes(): Promise<MonthlyNote[]> {
    return request<MonthlyNote[]>('/api/monthly-notes')
  }

  async upsertMonthlyNote(note: MonthlyNote): Promise<MonthlyNote> {
    return request<MonthlyNote>(
      `/api/monthly-notes/by-external/${encodeURIComponent(note.external_id)}`,
      'PUT',
      note
    )
  }

  async deleteMonthlyNote(externalId: string): Promise<void> {
    await request<unknown>(
      `/api/monthly-notes/by-external/${encodeURIComponent(externalId)}`,
      'DELETE'
    )
  }

  async listPolicies(): Promise<PolicyRow[]> {
    return request<PolicyRow[]>('/api/policies')
  }

  async upsertPolicy(policy: PolicyRow): Promise<PolicyRow> {
    return request<PolicyRow>(
      `/api/policies/by-external/${encodeURIComponent(policy.external_id)}`,
      'PUT',
      policy
    )
  }

  async deletePolicy(externalId: string): Promise<void> {
    await request<unknown>(`/api/policies/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listPairs(): Promise<PairRow[]> {
    return request<PairRow[]>('/api/pairs')
  }

  async upsertPair(pair: PairRow): Promise<PairRow> {
    return request<PairRow>(
      `/api/pairs/by-external/${encodeURIComponent(pair.external_id)}`,
      'PUT',
      pair
    )
  }

  async deletePair(externalId: string): Promise<void> {
    await request<unknown>(`/api/pairs/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listViolationsForTrade(tradeExternalId: string): Promise<TradeViolation[]> {
    return request<TradeViolation[]>(
      `/api/trades/by-external/${encodeURIComponent(tradeExternalId)}/violations`
    )
  }

  async setViolationsForTrade(
    tradeExternalId: string,
    policyExternalIds: string[]
  ): Promise<void> {
    await request<unknown>(
      `/api/trades/by-external/${encodeURIComponent(tradeExternalId)}/violations`,
      'PUT',
      { policy_external_ids: policyExternalIds }
    )
  }

  async exportAll(): Promise<MigratePayload> {
    // No dedicated /api/export endpoint — aggregate from list calls.
    // trade_violations are per-trade; fetch each trade's violations in
    // parallel and denormalize into flat rows.
    const [trades, weekly_notes, monthly_notes, policies, pairs] = await Promise.all([
      this.listTrades(),
      this.listWeeklyNotes(),
      this.listMonthlyNotes(),
      this.listPolicies(),
      this.listPairs(),
    ])
    const violationLists = await Promise.all(
      trades.map((t) => this.listViolationsForTrade(t.external_id))
    )
    const trade_violations = violationLists.flat()
    return { trades, weekly_notes, monthly_notes, policies, pairs, trade_violations }
  }

  async importAll(payload: MigratePayload): Promise<ImportResult> {
    // /api/migrate already does INSERT OR IGNORE with external_id dedup,
    // which is exactly the semantics we want for import-merge.
    return request<ImportResult>('/api/migrate', 'POST', payload)
  }

  async clearAll(): Promise<void> {
    // No-op: server never exposes a "clear all" endpoint for authenticated users.
  }
}
