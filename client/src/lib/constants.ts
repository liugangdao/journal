import { en } from '../i18n/en'

export const PAIRS: string[] = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'NZD/USD', 'USD/CAD',
  'USD/CHF', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'NZD/JPY',
  'CAD/JPY', 'AUD/CAD', 'EUR/AUD',
  'XAU/USD', 'XAG/USD',
  'USOil', 'UKOil', 'NGAS',
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT',
]

export const DIRECTIONS: Array<{ value: 'long' | 'short'; label: string }> = [
  { value: 'long', label: en.trade.long },
  { value: 'short', label: en.trade.short },
]

export const STRATEGIES: string[] = [
  en.strategy.trend,
  en.strategy.pullback,
  en.strategy.breakout,
  en.strategy.range,
  en.strategy.reversal,
  en.strategy.news,
  en.strategy.scalp,
  en.strategy.other,
]

export const TIMEFRAMES: string[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN']

export const SCORES: string[] = [
  `A - ${en.score.A}`,
  `B - ${en.score.B}`,
  `C - ${en.score.C}`,
  `D - ${en.score.D}`,
]

export const EMOTIONS: string[] = [
  en.emotion.calm,
  en.emotion.confident,
  en.emotion.anxious,
  en.emotion.fearful,
  en.emotion.greedy,
  en.emotion.fomo,
  en.emotion.bored,
  en.emotion.tilted,
  en.emotion.hopeful,
]

export const WEEKDAYS: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const ASSET_CLASSES: Array<{ value: 'forex' | 'metals' | 'energy' | 'crypto_perp'; label: string }> = [
  { value: 'forex', label: en.assetClass.forex },
  { value: 'metals', label: en.assetClass.metals },
  { value: 'energy', label: en.assetClass.energy },
  { value: 'crypto_perp', label: en.assetClass.crypto_perp },
]

export const PHASE_LABELS = {
  entry: en.policy.phases.entry,
  exit: en.policy.phases.exit,
  both: en.policy.phases.both,
} as const

export const SPREAD_COST: Record<string, number> = {
  'EUR/USD': 3.5, 'GBP/USD': 4, 'USD/JPY': 3, 'AUD/USD': 3.5,
  'NZD/USD': 4.5, 'USD/CAD': 4, 'USD/CHF': 4, 'EUR/GBP': 4.5,
  'EUR/JPY': 5, 'GBP/JPY': 6, 'AUD/JPY': 5, 'NZD/JPY': 5,
  'CAD/JPY': 5, 'AUD/CAD': 4, 'EUR/AUD': 5,
  'XAU/USD': 12, 'XAG/USD': 10, 'USOil': 5, 'UKOil': 6,
  'NGAS': 8, 'BTC/USDT': 0, 'ETH/USDT': 0, 'SOL/USDT': 0,
}

export const LIVERMORE_QUOTES: string[] = [
  'The market is never wrong – opinions often are.',
  "There is nothing new in Wall Street. There can't be because speculation is as old as the hills.",
  'The desire for constant action irrespective of underlying conditions is responsible for many losses.',
  'It was never my thinking that made the big money for me. It always was my sitting.',
  'A man must believe in himself and his judgment if he expects to make a living at this game.',
  'Big movements take time to develop. It takes time to make money.',
  "Don't argue with the market, and don't try to beat it.",
  "The speculator's chief enemies are always boring from within – greed, fear, and hope.",
  'First be sure you are right, then go ahead.',
  'A man must know himself thoroughly if he is going to make a good job out of trading.',
  'The most useful thing I learned was knowing when not to play.',
  "When I see a danger signal, I don't argue with it. I get out.",
  'Money is made by sitting, not trading.',
  'Profits always take care of themselves, but losses never do.',
  'Put all your eggs in one basket and then watch that basket.',
  'Experience has taught me that unless the market itself confirms your opinion, you should not trust your judgment.',
]
