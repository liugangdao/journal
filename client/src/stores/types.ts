export type AssetClass = 'forex' | 'metals' | 'energy' | 'crypto_perp'
export type Direction = 'long' | 'short'
export type TradeStatus = 'open' | 'closed' | 'missed'
export type PolicyPhase = 'entry' | 'exit' | 'both'

export interface Pair {
  name: string
  asset_class: AssetClass
  contract_size: number
  price_precision: number
  spread_cost: number
}

export interface Trade {
  pair: string
  asset_class: AssetClass
  direction: Direction
  lots?: number
  quantity?: number
  entry: number
  stop: number
  target?: number
  exit_price?: number
  gross_pnl?: number
  risk_amount?: number
  status: TradeStatus
}

export interface TradeRow extends Trade {
  id?: number
  external_id: string
  open_time: string
  close_time?: string | null
  strategy: string
  timeframe: string
  swap?: number
  score?: string | null
  emotion?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface WeeklyNote {
  id?: number
  external_id: string
  week: string
  lesson?: string
  plan?: string
  created_at?: string
}

export interface MonthlyNote {
  id?: number
  external_id: string
  month: string
  lesson?: string
  plan?: string
  created_at?: string
}

export interface PolicyRow {
  id?: number
  external_id: string
  category: string
  title: string
  content: string
  sort_order: number
  is_active: number
  phase: PolicyPhase
  created_at?: string
  updated_at?: string
}

export interface PairRow extends Pair {
  id?: number
  external_id: string
  sort_order: number
}

export interface TradeViolation {
  id?: number
  trade_external_id: string
  policy_external_id: string
  notes?: string
  created_at?: string
}

export interface MigratePayload {
  trades: TradeRow[]
  weekly_notes: WeeklyNote[]
  monthly_notes: MonthlyNote[]
  policies: PolicyRow[]
  pairs: PairRow[]
  trade_violations: TradeViolation[]
}
