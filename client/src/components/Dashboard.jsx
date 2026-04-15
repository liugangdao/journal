import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import KpiCard from './ui/KpiCard'
import Disclosure from './ui/Disclosure'
import EmptyState from './EmptyState'
import { calcStats } from '../lib/tradeCalc'
import { en } from '../i18n/en'

const THEME_COLORS = {
  light: { card: '#ffffff', border: '#e2e8f0', muted: '#94a3b8', accent: '#3b82f6', green: '#16a34a', red: '#dc2626', gold: '#d97706' },
  dark:  { card: '#111827', border: '#1e293b', muted: '#64748b', accent: '#3b82f6', green: '#10b981', red: '#ef4444', gold: '#f59e0b' },
}

function getComparison(current, previous) {
  if (previous == null || current == null) return null
  const diff = current - previous
  const pct = previous !== 0 ? Math.abs(diff / previous) : 0
  let direction = 'same'
  if (pct >= 0.05 || Math.abs(diff) > 0.5) {
    direction = diff > 0 ? 'up' : 'down'
  }
  return { value: typeof previous === 'number' && previous % 1 !== 0 ? previous.toFixed(2) : previous, direction }
}

function isoWeek(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export default function Dashboard({ trades, pairs = [], theme = 'dark', isSampleMode = false, onRecordCta }) {
  const pairsByName = useMemo(() => new Map(pairs.map((p) => [p.name, p])), [pairs])
  const stats = useMemo(() => calcStats(trades, pairsByName), [trades, pairsByName])
  const C = THEME_COLORS[theme] || THEME_COLORS.dark
  const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }

  const currentWeek = isoWeek(new Date().toISOString())
  const lastWeekDate = new Date()
  lastWeekDate.setDate(lastWeekDate.getDate() - 7)
  const lastWeek = isoWeek(lastWeekDate.toISOString())

  const thisWeekTrades = useMemo(() =>
    trades.filter(t => t.status === 'closed' && t.open_time && isoWeek(t.open_time) === currentWeek),
    [trades, currentWeek]
  )
  const lastWeekTrades = useMemo(() =>
    trades.filter(t => t.status === 'closed' && t.open_time && isoWeek(t.open_time) === lastWeek),
    [trades, lastWeek]
  )
  const thisWeekStats = useMemo(() => calcStats(thisWeekTrades, pairsByName), [thisWeekTrades, pairsByName])
  const lastWeekStats = useMemo(() => calcStats(lastWeekTrades, pairsByName), [lastWeekTrades, pairsByName])

  const showComparison = thisWeekStats && lastWeekStats

  if (!stats) {
    return <EmptyState type="dashboard" />
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const analysisData = [
    { title: en.stats.byEmotion, data: stats.byEmotion, defaultOpen: !isMobile },
    { title: en.stats.byStrategy, data: stats.byStrategy, defaultOpen: !isMobile },
    { title: en.stats.byPair, data: stats.byPair, defaultOpen: false },
    { title: en.stats.byDay, data: stats.byDay, defaultOpen: false },
    { title: en.stats.byTimeframe, data: stats.byTimeframe, defaultOpen: false },
  ]

  return (
    <div className="space-y-6">
      {isSampleMode && (
        <div className="flex items-center justify-between gap-4 bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-400 rounded-xl px-4 py-3 text-sm">
          <span>{en.demo.banner}</span>
          {onRecordCta && (
            <button
              type="button"
              onClick={onRecordCta}
              className="shrink-0 bg-amber-500 text-neutral-950 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer hover:bg-amber-400 transition-colors"
            >
              {en.demo.recordCta}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex gap-2 sm:gap-3">
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '0ms' }}>
          <KpiCard label={en.stats.tradeCount} value={stats.tradeCount}
            comparison={showComparison ? getComparison(thisWeekStats.tradeCount, lastWeekStats.tradeCount) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <KpiCard label={en.stats.winRate} value={stats.winRate.toFixed(1) + "%"} color={stats.winRate >= 50 ? C.green : C.red}
            comparison={showComparison ? getComparison(thisWeekStats.winRate, lastWeekStats.winRate) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <KpiCard label={en.stats.totalPnl} value={"$" + stats.totalNet.toFixed(0)} color={stats.totalNet >= 0 ? C.green : C.red}
            comparison={showComparison ? getComparison(thisWeekStats.totalNet, lastWeekStats.totalNet) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <KpiCard label={en.stats.profitFactor} value={stats.profitFactor} color={stats.profitFactor >= 1.5 ? C.green : C.gold}
            comparison={showComparison ? getComparison(thisWeekStats.profitFactor, lastWeekStats.profitFactor) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <KpiCard label={en.stats.avgR} value={stats.avgR + "R"} color={stats.avgR >= 0 ? C.green : C.red}
            comparison={showComparison ? getComparison(thisWeekStats.avgR, lastWeekStats.avgR) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <KpiCard label={en.stats.maxWinStreak} value={stats.maxWinStreak} color={C.green} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={en.stats.tradeCount}>
          {[
            [en.trade.status.closed, stats.tradeCount],
            [en.stats.winRate, stats.winCount],
            [en.stats.avgWin, "$" + stats.avgWin.toFixed(2)],
            [en.stats.avgLoss, "$" + stats.avgLoss.toFixed(2)],
          ].map(([k, v]) => (
            <StatRow key={k} label={k} value={v} />
          ))}
        </Card>
        <Card title={en.trade.netPnl}>
          {[
            [en.trade.grossPnl, "$" + stats.totalGross.toFixed(2)],
            [en.trade.spread, "$" + Math.abs(stats.totalSpread).toFixed(2)],
            [en.trade.swap, (stats.totalSwap >= 0 ? "+$" : "-$") + Math.abs(stats.totalSwap).toFixed(2)],
            [en.trade.netPnl, "$" + stats.totalNet.toFixed(2)],
          ].map(([k, v]) => (
            <StatRow key={k} label={k} value={v} />
          ))}
        </Card>
      </div>

      {stats.cumPnl.length > 1 && (
        <Card title={en.stats.cumPnl}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.cumPnl}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" stroke={C.muted} fontSize={10} />
              <YAxis stroke={C.muted} fontSize={10} tickFormatter={v => "$" + v} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => ["$" + v, en.stats.cumPnl]} />
              <Line type="monotone" dataKey="pnl" stroke={C.accent} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="space-y-3">
        {analysisData.map(({ title, data, defaultOpen }) => (
          <Disclosure key={title} title={title} defaultOpen={defaultOpen}>
            <AnalysisTable data={data} />
          </Disclosure>
        ))}
      </div>

    </div>
  )
}

function AnalysisTable({ data }) {
  if (!data || data.length === 0) return <div className="text-xs text-muted">{en.stats.noData}</div>
  const sorted = [...data].sort((a, b) => b.pnl - a.pnl)
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr>{[en.common.date, en.stats.count, en.stats.winRate, en.stats.pnl, en.stats.avgR].map(h => (
          <th key={h} className="px-2 py-1.5 text-left text-muted font-semibold border-b border-border text-[10px]">{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {sorted.map(d => (
          <tr key={d.name} className={`border-b border-border/30 ${d.count < 2 ? 'opacity-50' : ''}`}>
            <td className="px-2 py-1.5 font-semibold">{d.name}</td>
            <td className="px-2 py-1.5">{d.count}</td>
            <td className={`px-2 py-1.5 ${d.winRate >= 50 ? 'text-green' : 'text-red'}`}>{d.winRate.toFixed(1)}%</td>
            <td className={`px-2 py-1.5 font-mono ${d.pnl >= 0 ? 'text-green' : 'text-red'}`}>${d.pnl}</td>
            <td className="px-2 py-1.5 font-mono">{d.avgR}R</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-5 shadow-sm">
      <h4 className="text-sm font-bold mb-3">{title}</h4>
      {children}
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  )
}
