import { SPREAD_COST, WEEKDAYS } from './constants'

const weekday = (d) => WEEKDAYS[new Date(d).getDay()]

// Get ISO week string (YYYY-Www) from a date string
function isoWeek(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function calcTrade(t, spreadCostMap) {
  const costMap = spreadCostMap || SPREAD_COST
  const entry = parseFloat(t.entry) || 0
  const stop = parseFloat(t.stop) || 0
  const exitPrice = parseFloat(t.exit_price) || 0
  const lots = parseFloat(t.lots) || 0
  const gross = parseFloat(t.gross_pnl) || 0
  const swap = parseFloat(t.swap) || 0
  const isBuy = t.direction.startsWith("多")

  const stopPips = stop > 0 ? Math.abs(entry - stop) : 0
  const pnlPips = isBuy ? exitPrice - entry : entry - exitPrice
  const spread = (costMap[t.pair] || 5) * lots
  const netPnl = gross + swap
  const dollarPerPip = pnlPips !== 0 ? gross / pnlPips : 0

  // R-multiple: prefer risk_amount, fallback to stopPips * dollarPerPip
  const riskAmount = parseFloat(t.risk_amount)
  const riskDollars = riskAmount > 0
    ? riskAmount
    : (stopPips > 0 && dollarPerPip > 0 ? stopPips * dollarPerPip : 0)
  const rMultiple = riskDollars > 0 ? Math.round(netPnl / riskDollars * 100) / 100 : null

  return {
    ...t,
    weekday: weekday(t.open_time),
    stopPips,
    pnlPips,
    rMultiple,
    spread: Math.round(spread * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
  }
}

export function calcStats(trades, spreadCostMap) {
  const activeTrades = trades.filter(t => t.status !== 'missed')
  const computed = activeTrades.map(t => calcTrade(t, spreadCostMap))
  if (computed.length === 0) return null

  const wins = computed.filter(t => t.netPnl > 0)
  const losses = computed.filter(t => t.netPnl < 0)
  const totalNet = computed.reduce((s, t) => s + t.netPnl, 0)
  const totalGross = computed.reduce((s, t) => s + (parseFloat(t.gross_pnl) || 0), 0)
  const totalSpread = computed.reduce((s, t) => s + t.spread, 0)
  const totalSwap = computed.reduce((s, t) => s + (parseFloat(t.swap) || 0), 0)
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.netPnl, 0) / losses.length : 0

  // Average R excludes null (uncalculable) entries
  const rTrades = computed.filter(t => t.rMultiple !== null)
  const avgR = rTrades.length > 0
    ? Math.round(rTrades.reduce((s, t) => s + t.rMultiple, 0) / rTrades.length * 100) / 100
    : 0

  // Breakdowns
  const byPair = {}; const byStrat = {}; const byEmo = {}; const byDay = {}; const byTf = {}
  computed.forEach(t => {
    for (const [map, key] of [[byPair, t.pair],[byStrat, t.strategy],[byEmo, t.emotion],[byDay, t.weekday],[byTf, t.timeframe]]) {
      if (!map[key]) map[key] = { count: 0, wins: 0, totalPnl: 0, totalR: 0, rCount: 0 }
      map[key].count++
      if (t.netPnl > 0) map[key].wins++
      map[key].totalPnl += t.netPnl
      if (t.rMultiple !== null) {
        map[key].totalR += t.rMultiple
        map[key].rCount++
      }
    }
  })

  const toArr = (m) => Object.entries(m).map(([k, v]) => ({
    name: k, count: v.count,
    winRate: v.count ? Math.round(v.wins / v.count * 1000) / 10 : 0,
    pnl: Math.round(v.totalPnl * 100) / 100,
    avgR: v.rCount > 0 ? Math.round(v.totalR / v.rCount * 100) / 100 : 0
  }))

  // Cumulative PnL curve (sorted by open_time)
  let cumPnl = 0
  const sorted = [...computed].sort((a, b) => a.open_time.localeCompare(b.open_time) || a.id - b.id)
  const cumData = sorted.map((t, i) => { cumPnl += t.netPnl; return { idx: i + 1, date: t.open_time.slice(0, 10), pnl: Math.round(cumPnl * 100) / 100 } })

  // Streaks (based on time-sorted trades)
  let currentStreak = { type: null, count: 0 }
  let maxWinStreak = 0
  let maxLossStreak = 0
  let winStreak = 0
  let lossStreak = 0
  for (const t of sorted) {
    if (t.netPnl > 0) {
      winStreak++
      lossStreak = 0
      if (winStreak > maxWinStreak) maxWinStreak = winStreak
    } else {
      lossStreak++
      winStreak = 0
      if (lossStreak > maxLossStreak) maxLossStreak = lossStreak
    }
  }
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1]
    currentStreak.type = last.netPnl > 0 ? 'win' : 'loss'
    currentStreak.count = 1
    for (let i = sorted.length - 2; i >= 0; i--) {
      const isWin = sorted[i].netPnl > 0
      if ((currentStreak.type === 'win' && isWin) || (currentStreak.type === 'loss' && !isWin)) {
        currentStreak.count++
      } else {
        break
      }
    }
  }

  // Max drawdown (peak-to-trough on cumulative PnL)
  let peak = 0
  let maxDrawdown = 0
  let cumPnlDD = 0
  for (const t of sorted) {
    cumPnlDD += t.netPnl
    if (cumPnlDD > peak) peak = cumPnlDD
    const dd = cumPnlDD - peak
    if (dd < maxDrawdown) maxDrawdown = dd
  }

  // Weekly trend (last 8 ISO weeks)
  const now = new Date()
  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    weeks.push(isoWeek(d))
  }
  const uniqueWeeks = [...new Set(weeks)].slice(-8)

  const weekMap = {}
  for (const w of uniqueWeeks) {
    weekMap[w] = { count: 0, wins: 0, totalPnl: 0 }
  }
  for (const t of computed) {
    const w = isoWeek(t.open_time)
    if (weekMap[w]) {
      weekMap[w].count++
      if (t.netPnl > 0) weekMap[w].wins++
      weekMap[w].totalPnl += t.netPnl
    }
  }
  const weeklyTrend = uniqueWeeks.map(w => ({
    week: w,
    count: weekMap[w].count,
    winRate: weekMap[w].count > 0 ? Math.round(weekMap[w].wins / weekMap[w].count * 1000) / 10 : 0,
    netPnl: Math.round(weekMap[w].totalPnl * 100) / 100,
  }))

  return {
    total: computed.length, wins: wins.length, losses: losses.length,
    winRate: Math.round(wins.length / computed.length * 1000) / 10,
    totalNet: Math.round(totalNet * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
    totalSpread: Math.round(totalSpread * 100) / 100,
    totalSwap: Math.round(totalSwap * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: losses.length > 0 ? Math.round(Math.abs(wins.reduce((s, t) => s + t.netPnl, 0) / losses.reduce((s, t) => s + t.netPnl, 0)) * 100) / 100 : 0,
    avgR,
    byPair: toArr(byPair).sort((a, b) => b.pnl - a.pnl),
    byStrat: toArr(byStrat).sort((a, b) => b.pnl - a.pnl),
    byEmo: toArr(byEmo).filter(x => x.count > 0),
    byDay: toArr(byDay),
    byTf: toArr(byTf).filter(x => x.count > 0),
    cumData,
    computed,
    currentStreak,
    maxWinStreak,
    maxLossStreak,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    weeklyTrend,
  }
}
