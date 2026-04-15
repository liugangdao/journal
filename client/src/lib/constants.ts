import { en } from '../i18n/en'

export const DIRECTIONS: Array<{ value: 'long' | 'short'; label: string }> = [
  { value: 'long', label: en.trade.long },
  { value: 'short', label: en.trade.short },
]

export const STRATEGIES: Array<{ value: string; label: string }> = [
  { value: 'trend', label: en.strategy.trend },
  { value: 'pullback', label: en.strategy.pullback },
  { value: 'breakout', label: en.strategy.breakout },
  { value: 'range', label: en.strategy.range },
  { value: 'reversal', label: en.strategy.reversal },
  { value: 'news', label: en.strategy.news },
  { value: 'scalp', label: en.strategy.scalp },
  { value: 'other', label: en.strategy.other },
]

export const TIMEFRAMES: string[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN']

export const SCORES: Array<{ value: string; label: string; desc: string }> = [
  { value: 'A', label: `A — ${en.score.A}`, desc: en.score.ADesc },
  { value: 'B', label: `B — ${en.score.B}`, desc: en.score.BDesc },
  { value: 'C', label: `C — ${en.score.C}`, desc: en.score.CDesc },
  { value: 'D', label: `D — ${en.score.D}`, desc: en.score.DDesc },
]

export const EMOTIONS: Array<{ value: string; label: string }> = [
  { value: 'calm', label: en.emotion.calm },
  { value: 'confident', label: en.emotion.confident },
  { value: 'anxious', label: en.emotion.anxious },
  { value: 'fearful', label: en.emotion.fearful },
  { value: 'greedy', label: en.emotion.greedy },
  { value: 'fomo', label: en.emotion.fomo },
  { value: 'bored', label: en.emotion.bored },
  { value: 'tilted', label: en.emotion.tilted },
  { value: 'hopeful', label: en.emotion.hopeful },
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
