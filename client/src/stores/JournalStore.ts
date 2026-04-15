import type {
  TradeRow,
  WeeklyNote,
  MonthlyNote,
  PolicyRow,
  PairRow,
  TradeViolation,
  MigratePayload,
} from './types'

export interface JournalStore {
  listTrades(): Promise<TradeRow[]>
  addTrade(trade: Omit<TradeRow, 'id'>): Promise<TradeRow>
  updateTrade(externalId: string, patch: Partial<TradeRow>): Promise<TradeRow>
  deleteTrade(externalId: string): Promise<void>

  listWeeklyNotes(): Promise<WeeklyNote[]>
  upsertWeeklyNote(note: WeeklyNote): Promise<WeeklyNote>
  deleteWeeklyNote(externalId: string): Promise<void>

  listMonthlyNotes(): Promise<MonthlyNote[]>
  upsertMonthlyNote(note: MonthlyNote): Promise<MonthlyNote>
  deleteMonthlyNote(externalId: string): Promise<void>

  listPolicies(): Promise<PolicyRow[]>
  upsertPolicy(policy: PolicyRow): Promise<PolicyRow>
  deletePolicy(externalId: string): Promise<void>

  listPairs(): Promise<PairRow[]>
  upsertPair(pair: PairRow): Promise<PairRow>
  deletePair(externalId: string): Promise<void>

  listViolationsForTrade(tradeExternalId: string): Promise<TradeViolation[]>
  setViolationsForTrade(tradeExternalId: string, policyExternalIds: string[]): Promise<void>

  exportAll(): Promise<MigratePayload>
  importAll(payload: MigratePayload): Promise<ImportResult>
  clearAll(): Promise<void>
}

export interface ImportResult {
  trades: number
  weekly_notes: number
  monthly_notes: number
  policies: number
  pairs: number
  trade_violations: number
}
