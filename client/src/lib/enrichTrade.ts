import { calcTrade } from './tradeCalc'
import type { Pair, TradeRow } from '../stores/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface EnrichedTrade extends TradeRow {
  netPnl: number
  rMultiple: number | null
  pips: number | null
  weekday: string
  spread: number
}

export function enrichTrade(t: TradeRow, pair: Pair | undefined): EnrichedTrade {
  let pips: number | null = null
  let grossPnlCalc: number | null = null
  let rMultiple: number | null = null
  if (pair && pair.asset_class === t.asset_class) {
    try {
      const calc = calcTrade(t, pair)
      pips = calc.pips
      grossPnlCalc = calc.grossPnl
      rMultiple = calc.rMultiple
    } catch {
      // mismatched asset class — fall through
    }
  }
  const gross = grossPnlCalc ?? t.gross_pnl ?? 0
  const swap = t.swap ?? 0
  const netPnl = gross + swap
  const lots = t.lots ?? 0
  const spread = pair ? pair.spread_cost * lots : 0
  const weekday = t.open_time ? WEEKDAYS[new Date(t.open_time).getDay()] : ''
  return { ...t, netPnl, rMultiple, pips, weekday, spread }
}
