import type { PairRow, PolicyRow } from '../stores/types'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const RAW_PAIRS: Array<Omit<PairRow, 'external_id' | 'id'>> = [
  // Forex (22)
  { name: 'EUR/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 3.5, sort_order: 0 },
  { name: 'GBP/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4, sort_order: 1 },
  { name: 'USD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 3, sort_order: 2 },
  { name: 'AUD/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 3.5, sort_order: 3 },
  { name: 'NZD/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4.5, sort_order: 4 },
  { name: 'USD/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4, sort_order: 5 },
  { name: 'USD/CHF', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4, sort_order: 6 },
  { name: 'EUR/GBP', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4.5, sort_order: 7 },
  { name: 'EUR/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5, sort_order: 8 },
  { name: 'GBP/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 6, sort_order: 9 },
  { name: 'AUD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5, sort_order: 10 },
  { name: 'NZD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5, sort_order: 11 },
  { name: 'CAD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5, sort_order: 12 },
  { name: 'AUD/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4, sort_order: 13 },
  { name: 'EUR/AUD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5, sort_order: 14 },
  { name: 'EUR/CHF', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5, sort_order: 15 },
  { name: 'GBP/CHF', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5, sort_order: 16 },
  { name: 'CHF/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5, sort_order: 17 },
  { name: 'EUR/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5, sort_order: 18 },
  { name: 'GBP/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5, sort_order: 19 },
  { name: 'GBP/AUD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5, sort_order: 20 },
  { name: 'AUD/NZD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4, sort_order: 21 },
  // Metals (2)
  { name: 'XAU/USD', asset_class: 'metals', contract_size: 100, price_precision: 2, spread_cost: 12, sort_order: 22 },
  { name: 'XAG/USD', asset_class: 'metals', contract_size: 5000, price_precision: 3, spread_cost: 10, sort_order: 23 },
  // Energy (3)
  { name: 'USOil', asset_class: 'energy', contract_size: 1000, price_precision: 2, spread_cost: 5, sort_order: 24 },
  { name: 'UKOil', asset_class: 'energy', contract_size: 1000, price_precision: 2, spread_cost: 6, sort_order: 25 },
  { name: 'NGAS', asset_class: 'energy', contract_size: 10000, price_precision: 3, spread_cost: 8, sort_order: 26 },
  // Crypto perp (6)
  { name: 'BTC/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 2, spread_cost: 0, sort_order: 27 },
  { name: 'ETH/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 2, spread_cost: 0, sort_order: 28 },
  { name: 'SOL/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 3, spread_cost: 0, sort_order: 29 },
  { name: 'AVAX/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 3, spread_cost: 0, sort_order: 30 },
  { name: 'ARB/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 4, spread_cost: 0, sort_order: 31 },
  { name: 'DOGE/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 5, spread_cost: 0, sort_order: 32 },
]

const RAW_POLICIES: Array<Omit<PolicyRow, 'external_id' | 'id'>> = [
  { category: 'rules', title: 'Daily loss <= 2% of account equity', content: 'When cumulative daily loss reaches 2%, stop trading immediately to avoid emotional compounding.', phase: 'both', sort_order: 0, is_active: 1 },
  { category: 'rules', title: 'Stop after 3 consecutive losses', content: 'Three losses in a row signals strategy-market mismatch; continuing raises loss probability.', phase: 'both', sort_order: 1, is_active: 1 },
  { category: 'rules', title: 'No trades 30 min before or after high-impact data', content: 'Around NFP, CPI, and rate decisions, spreads widen and moves are erratic.', phase: 'entry', sort_order: 2, is_active: 1 },
  { category: 'rules', title: 'Every trade has a stop-loss', content: 'The stop is your capital guarantee. No stop means unbounded risk. Always place it when entering.', phase: 'entry', sort_order: 3, is_active: 1 },
  { category: 'rules', title: 'No revenge trading', content: 'Doubling down to win back losses is the single most common cause of account blow-ups. Step away.', phase: 'entry', sort_order: 4, is_active: 1 },
  { category: 'strategy', title: 'Wait for pullback confirmation in trends', content: 'Chasing tops and bottoms in trends burns capital. Wait for retracement to support or resistance.', phase: 'entry', sort_order: 5, is_active: 1 },
  { category: 'strategy', title: 'Require candle close to confirm breakouts', content: 'False breakouts are rampant. Wait for close above/below the level on your chosen timeframe.', phase: 'entry', sort_order: 6, is_active: 1 },
  { category: 'strategy', title: 'Halve size on counter-trend trades', content: 'Counter-trend setups have lower win rates. Reduce size so an incorrect read stays survivable.', phase: 'entry', sort_order: 7, is_active: 1 },
  { category: 'strategy', title: 'Require alignment across two timeframes', content: 'At least two timeframes must agree on direction before entering. Example: H4 + H1 both long.', phase: 'entry', sort_order: 8, is_active: 1 },
  { category: 'strategy', title: 'Write entry thesis and target before placing the order', content: 'Documenting why, where to exit, and where to stop forces clarity and prevents gut-feel entries.', phase: 'entry', sort_order: 9, is_active: 1 },
  { category: 'risk', title: 'Single-trade risk <= 1% of equity', content: 'Capping risk per trade means ten consecutive losses leaves 90%+ of capital intact.', phase: 'entry', sort_order: 10, is_active: 1 },
  { category: 'risk', title: 'Max 3 open positions in same direction', content: 'Concentrated same-direction exposure amplifies drawdowns on reversal. Diversify.', phase: 'entry', sort_order: 11, is_active: 1 },
  { category: 'risk', title: 'Skip trades with reward-to-risk below 1.5', content: 'Take only setups where potential profit is at least 1.5x the planned loss. Long term this is what pays.', phase: 'entry', sort_order: 12, is_active: 1 },
  { category: 'risk', title: 'Move stop to breakeven after 1R profit', content: 'Once a trade is in 1R profit, trail the stop to entry. A winner never becomes a loser.', phase: 'exit', sort_order: 13, is_active: 1 },
  { category: 'risk', title: 'Weekly loss <= 5% of equity', content: 'Cumulative weekly drawdown cap prevents continued bleeding in adverse market phases.', phase: 'both', sort_order: 14, is_active: 1 },
  { category: 'rules', title: 'Check funding rate before holding overnight', content: 'Negative funding against your direction can exceed 100% annualized. Read the rate before every overnight hold.', phase: 'entry', sort_order: 15, is_active: 1 },
  { category: 'rules', title: 'No trading in first 5 minutes after listing', content: 'New listings see extreme volatility, thin liquidity, and frequent wicks that liquidate even small-size positions.', phase: 'entry', sort_order: 16, is_active: 1 },
  { category: 'rules', title: 'Close DEX positions before chain-congestion events', content: 'Major airdrop claims, protocol upgrades, or token launches spike gas and oracle lag. Exit proactively.', phase: 'entry', sort_order: 17, is_active: 1 },
]

export const DEFAULT_PAIRS: PairRow[] = RAW_PAIRS.map((p) => ({
  ...p,
  external_id: `seed-pair-${slugify(p.name)}`,
}))

export const DEFAULT_POLICIES: PolicyRow[] = RAW_POLICIES.map((p, i) => ({
  ...p,
  external_id: `seed-policy-${String(i).padStart(2, '0')}`,
}))
