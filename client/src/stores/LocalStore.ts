import Dexie, { type Table } from 'dexie'
import type {
  TradeRow,
  WeeklyNote,
  MonthlyNote,
  PolicyRow,
  PairRow,
  TradeViolation,
  MigratePayload,
} from './types'
import type { JournalStore } from './JournalStore'
import { DEFAULT_PAIRS, DEFAULT_POLICIES } from '../lib/defaults'

type ViolationRow = TradeViolation & { id?: number }

class JournalDB extends Dexie {
  trades!: Table<TradeRow, string>
  weekly_notes!: Table<WeeklyNote, string>
  monthly_notes!: Table<MonthlyNote, string>
  policies!: Table<PolicyRow, string>
  pairs!: Table<PairRow, string>
  trade_violations!: Table<ViolationRow, number>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      trades: 'external_id, open_time, pair',
      weekly_notes: 'external_id, week',
      monthly_notes: 'external_id, month',
      policies: 'external_id, sort_order',
      pairs: 'external_id, sort_order',
      trade_violations: '++id, trade_external_id',
    })
  }
}

export class LocalStore implements JournalStore {
  private db: JournalDB
  private initPromise: Promise<void> | null = null

  constructor(dbName = 'journalLocal') {
    this.db = new JournalDB(dbName)
  }

  private async ensureSeeded(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      const pairCount = await this.db.pairs.count()
      const policyCount = await this.db.policies.count()
      if (pairCount > 0 || policyCount > 0) return
      await this.db.transaction('rw', this.db.pairs, this.db.policies, async () => {
        await this.db.pairs.bulkPut(DEFAULT_PAIRS)
        await this.db.policies.bulkPut(DEFAULT_POLICIES)
      })
    })()
    return this.initPromise
  }

  async listTrades(): Promise<TradeRow[]> {
    return this.db.trades.orderBy('open_time').reverse().toArray()
  }

  async addTrade(trade: Omit<TradeRow, 'id'>): Promise<TradeRow> {
    await this.db.trades.put(trade as TradeRow)
    return trade as TradeRow
  }

  async updateTrade(externalId: string, patch: Partial<TradeRow>): Promise<TradeRow> {
    const current = await this.db.trades.get(externalId)
    if (!current) throw new Error(`trade not found: ${externalId}`)
    const next = { ...current, ...patch, external_id: externalId } as TradeRow
    await this.db.trades.put(next)
    return next
  }

  async deleteTrade(externalId: string): Promise<void> {
    await this.db.trades.delete(externalId)
  }

  async listWeeklyNotes(): Promise<WeeklyNote[]> {
    return this.db.weekly_notes.orderBy('week').reverse().toArray()
  }

  async upsertWeeklyNote(note: WeeklyNote): Promise<WeeklyNote> {
    await this.db.weekly_notes.put(note)
    return note
  }

  async deleteWeeklyNote(externalId: string): Promise<void> {
    await this.db.weekly_notes.delete(externalId)
  }

  async listMonthlyNotes(): Promise<MonthlyNote[]> {
    return this.db.monthly_notes.orderBy('month').reverse().toArray()
  }

  async upsertMonthlyNote(note: MonthlyNote): Promise<MonthlyNote> {
    await this.db.monthly_notes.put(note)
    return note
  }

  async deleteMonthlyNote(externalId: string): Promise<void> {
    await this.db.monthly_notes.delete(externalId)
  }

  async listPolicies(): Promise<PolicyRow[]> {
    await this.ensureSeeded()
    return this.db.policies.orderBy('sort_order').toArray()
  }

  async upsertPolicy(policy: PolicyRow): Promise<PolicyRow> {
    await this.db.policies.put(policy)
    return policy
  }

  async deletePolicy(externalId: string): Promise<void> {
    await this.db.policies.delete(externalId)
  }

  async listPairs(): Promise<PairRow[]> {
    await this.ensureSeeded()
    return this.db.pairs.orderBy('sort_order').toArray()
  }

  async upsertPair(pair: PairRow): Promise<PairRow> {
    await this.db.pairs.put(pair)
    return pair
  }

  async deletePair(externalId: string): Promise<void> {
    await this.db.pairs.delete(externalId)
  }

  async listViolationsForTrade(tradeExternalId: string): Promise<TradeViolation[]> {
    const rows = await this.db.trade_violations
      .where('trade_external_id')
      .equals(tradeExternalId)
      .toArray()
    return rows.map(({ id: _id, ...rest }) => rest)
  }

  async setViolationsForTrade(
    tradeExternalId: string,
    policyExternalIds: string[]
  ): Promise<void> {
    await this.db.transaction('rw', this.db.trade_violations, async () => {
      await this.db.trade_violations
        .where('trade_external_id')
        .equals(tradeExternalId)
        .delete()
      for (const policyExternalId of policyExternalIds) {
        await this.db.trade_violations.add({
          trade_external_id: tradeExternalId,
          policy_external_id: policyExternalId,
        })
      }
    })
  }

  async exportAll(): Promise<MigratePayload> {
    const [trades, weekly_notes, monthly_notes, policies, pairs, trade_violations] =
      await Promise.all([
        this.db.trades.toArray(),
        this.db.weekly_notes.toArray(),
        this.db.monthly_notes.toArray(),
        this.db.policies.toArray(),
        this.db.pairs.toArray(),
        this.db.trade_violations.toArray(),
      ])
    return {
      trades,
      weekly_notes,
      monthly_notes,
      policies,
      pairs,
      trade_violations: trade_violations.map(({ id: _id, ...rest }) => rest),
    }
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.trades,
      this.db.weekly_notes,
      this.db.monthly_notes,
      this.db.policies,
      this.db.pairs,
      this.db.trade_violations,
      async () => {
        await Promise.all([
          this.db.trades.clear(),
          this.db.weekly_notes.clear(),
          this.db.monthly_notes.clear(),
          this.db.policies.clear(),
          this.db.pairs.clear(),
          this.db.trade_violations.clear(),
        ])
      }
    )
    this.initPromise = null
  }
}
