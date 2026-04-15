import type { Trade, Pair, TradeRow } from '../stores/types'

export interface TradeCalcOutput {
  pips: number | null
  grossPnl: number | null
  rMultiple: number | null
}

export interface StatsBreakdown {
  name: string
  count: number
  winRate: number
  pnl: number
  avgR: number
}

export interface CalcStatsOutput {
  tradeCount: number
  winCount: number
  lossCount: number
  winRate: number
  totalNet: number
  totalGross: number
  totalSpread: number
  totalSwap: number
  avgWin: number
  avgLoss: number
  avgR: number
  profitFactor: number
  byPair: StatsBreakdown[]
  byStrategy: StatsBreakdown[]
  byEmotion: StatsBreakdown[]
  byDay: StatsBreakdown[]
  byTimeframe: StatsBreakdown[]
  cumPnl: Array<{ idx: number; date: string; pnl: number }>
  maxWinStreak: number
  maxLossStreak: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weekday(dateStr: string): string {
  return WEEKDAYS[new Date(dateStr).getDay()]
}

export function calcStats(
  trades: TradeRow[],
  pairsByName: Map<string, Pair>
): CalcStatsOutput | null {
  const active = trades.filter((t) => t.status !== 'missed')
  if (active.length === 0) return null

  type Enriched = TradeRow & {
    wd: string
    calc: TradeCalcOutput
    netPnl: number
    spread: number
  }
  const enriched: Enriched[] = active.map((t) => {
    const pair = pairsByName.get(t.pair)
    let calc: TradeCalcOutput
    if (!pair) {
      calc = { pips: null, grossPnl: t.gross_pnl ?? null, rMultiple: null }
    } else {
      try {
        calc = calcTrade(t, pair)
      } catch {
        calc = { pips: null, grossPnl: t.gross_pnl ?? null, rMultiple: null }
      }
    }
    const gross = calc.grossPnl ?? t.gross_pnl ?? 0
    const swap = t.swap ?? 0
    const netPnl = gross + swap
    const lots = t.lots ?? 0
    const spread = pair ? pair.spread_cost * lots : 0
    return { ...t, wd: weekday(t.open_time), calc, netPnl, spread }
  })

  const wins = enriched.filter((t) => t.netPnl > 0)
  const losses = enriched.filter((t) => t.netPnl < 0)
  const totalNet = enriched.reduce((s, t) => s + t.netPnl, 0)
  const totalGross = enriched.reduce((s, t) => s + (t.calc.grossPnl ?? 0), 0)
  const totalSpread = enriched.reduce((s, t) => s + t.spread, 0)
  const totalSwap = enriched.reduce((s, t) => s + (t.swap ?? 0), 0)
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.netPnl, 0) / losses.length : 0
  const rTrades = enriched.filter((t) => t.calc.rMultiple !== null)
  const avgR = rTrades.length
    ? rTrades.reduce((s, t) => s + (t.calc.rMultiple ?? 0), 0) / rTrades.length
    : 0

  const lossSum = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0))
  const winSum = wins.reduce((s, t) => s + t.netPnl, 0)
  const profitFactor = lossSum > 0 ? winSum / lossSum : winSum > 0 ? Infinity : 0

  type Bucket = { count: number; wins: number; totalPnl: number; totalR: number; rCount: number }
  const buckets: Record<string, Record<string, Bucket>> = {
    pair: {},
    strategy: {},
    emotion: {},
    wd: {},
    timeframe: {},
  }
  for (const t of enriched) {
    for (const [dim, keyRaw] of [
      ['pair', t.pair] as const,
      ['strategy', t.strategy] as const,
      ['emotion', t.emotion ?? '—'] as const,
      ['wd', t.wd] as const,
      ['timeframe', t.timeframe] as const,
    ]) {
      const key = keyRaw ?? '—'
      if (!buckets[dim][key]) buckets[dim][key] = { count: 0, wins: 0, totalPnl: 0, totalR: 0, rCount: 0 }
      const b = buckets[dim][key]
      b.count++
      if (t.netPnl > 0) b.wins++
      b.totalPnl += t.netPnl
      if (t.calc.rMultiple !== null) {
        b.totalR += t.calc.rMultiple
        b.rCount++
      }
    }
  }

  function toArr(m: Record<string, Bucket>): StatsBreakdown[] {
    return Object.entries(m).map(([k, v]) => ({
      name: k,
      count: v.count,
      winRate: v.count ? (v.wins / v.count) * 100 : 0,
      pnl: Math.round(v.totalPnl * 100) / 100,
      avgR: v.rCount ? Math.round((v.totalR / v.rCount) * 100) / 100 : 0,
    }))
  }

  const sorted = [...enriched].sort((a, b) => a.open_time.localeCompare(b.open_time))
  let cum = 0
  const cumPnl = sorted.map((t, i) => {
    cum += t.netPnl
    return { idx: i + 1, date: t.open_time.slice(0, 10), pnl: Math.round(cum * 100) / 100 }
  })

  let maxWinStreak = 0
  let maxLossStreak = 0
  let curWin = 0
  let curLoss = 0
  for (const t of sorted) {
    if (t.netPnl > 0) {
      curWin++
      curLoss = 0
      maxWinStreak = Math.max(maxWinStreak, curWin)
    } else if (t.netPnl < 0) {
      curLoss++
      curWin = 0
      maxLossStreak = Math.max(maxLossStreak, curLoss)
    } else {
      curWin = 0
      curLoss = 0
    }
  }

  return {
    tradeCount: enriched.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: enriched.length ? (wins.length / enriched.length) * 100 : 0,
    totalNet: Math.round(totalNet * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
    totalSpread: Math.round(totalSpread * 100) / 100,
    totalSwap: Math.round(totalSwap * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    avgR: Math.round(avgR * 100) / 100,
    profitFactor: Number.isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : profitFactor,
    byPair: toArr(buckets.pair),
    byStrategy: toArr(buckets.strategy),
    byEmotion: toArr(buckets.emotion),
    byDay: toArr(buckets.wd),
    byTimeframe: toArr(buckets.timeframe),
    cumPnl,
    maxWinStreak,
    maxLossStreak,
  }
}

export function calcTrade(trade: Trade, pair: Pair): TradeCalcOutput {
  if (!trade.direction) throw new Error('Trade direction missing')
  if (trade.asset_class !== pair.asset_class) {
    throw new Error(
      `Trade asset_class ${trade.asset_class} does not match pair ${pair.asset_class}`
    )
  }

  switch (trade.asset_class) {
    case 'crypto_perp':
      return calcCrypto(trade)
    case 'forex':
    case 'metals':
    case 'energy':
      return calcPipBased(trade, pair)
  }
}

function calcCrypto(trade: Trade): TradeCalcOutput {
  const grossPnl = trade.gross_pnl ?? null
  const rMultiple =
    grossPnl !== null && trade.risk_amount && trade.risk_amount !== 0
      ? grossPnl / trade.risk_amount
      : null
  return { pips: null, grossPnl, rMultiple }
}

function calcPipBased(trade: Trade, pair: Pair): TradeCalcOutput {
  if (trade.exit_price == null) {
    return { pips: null, grossPnl: null, rMultiple: null }
  }

  const sign = trade.direction === 'long' ? 1 : -1
  const priceDelta = (trade.exit_price - trade.entry) * sign
  const lots = trade.lots ?? 0
  const grossPnl = priceDelta * pair.contract_size * lots

  const pipMultiplier =
    pair.asset_class === 'forex'
      ? (pair.price_precision >= 4 ? 10000 : 100)
      : 1
  const pips = priceDelta * pipMultiplier

  const rMultiple =
    trade.risk_amount && trade.risk_amount !== 0
      ? grossPnl / trade.risk_amount
      : null

  return { pips, grossPnl, rMultiple }
}
