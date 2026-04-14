import { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import KpiCard from './ui/KpiCard'
import Disclosure from './ui/Disclosure'
import EmptyState from './EmptyState'
import StreakKpis from './StreakKpis'
import WeeklyTrend from './WeeklyTrend'
import { calcStats } from '../lib/calc'
import { api } from '../hooks/useApi'

const THEME_COLORS = {
  light: { card: '#ffffff', border: '#e2e8f0', muted: '#94a3b8', accent: '#3b82f6', green: '#16a34a', red: '#dc2626', gold: '#d97706' },
  dark:  { card: '#111827', border: '#1e293b', muted: '#64748b', accent: '#3b82f6', green: '#10b981', red: '#ef4444', gold: '#f59e0b' },
}

function isoWeek(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
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

export default function Dashboard({ trades, spreadCostMap, theme = 'dark' }) {
  const stats = useMemo(() => calcStats(trades, spreadCostMap), [trades, spreadCostMap])
  const C = THEME_COLORS[theme] || THEME_COLORS.dark
  const [violationStats, setViolationStats] = useState(null)
  useEffect(() => {
    api.getViolationStats().then(setViolationStats).catch(console.error)
  }, [])
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
  const thisWeekStats = useMemo(() => calcStats(thisWeekTrades, spreadCostMap), [thisWeekTrades, spreadCostMap])
  const lastWeekStats = useMemo(() => calcStats(lastWeekTrades, spreadCostMap), [lastWeekTrades, spreadCostMap])

  const showComparison = thisWeekStats && lastWeekStats

  if (!stats) {
    return <EmptyState type="dashboard" />
  }

  const goodScoreRate = Math.round(
    stats.computed.filter(t => t.score?.startsWith("A") || t.score?.startsWith("B")).length / stats.computed.length * 100
  )

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const analysisData = [
    { title: '情绪分析', data: stats.byEmo, defaultOpen: !isMobile },
    { title: '策略分析', data: stats.byStrat, defaultOpen: !isMobile },
    { title: '品种分析', data: stats.byPair, defaultOpen: false },
    { title: '星期分析', data: stats.byDay, defaultOpen: false },
    { title: '周期分析', data: stats.byTf, defaultOpen: false },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex gap-2 sm:gap-3">
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '0ms' }}>
          <KpiCard label="总交易数" value={stats.total}
            comparison={showComparison ? getComparison(thisWeekStats.total, lastWeekStats.total) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <KpiCard label="胜率" value={stats.winRate + "%"} color={stats.winRate >= 50 ? C.green : C.red}
            comparison={showComparison ? getComparison(thisWeekStats.winRate, lastWeekStats.winRate) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <KpiCard label="净盈亏" value={"$" + stats.totalNet.toFixed(0)} color={stats.totalNet >= 0 ? C.green : C.red}
            comparison={showComparison ? getComparison(thisWeekStats.totalNet, lastWeekStats.totalNet) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <KpiCard label="盈亏比" value={stats.profitFactor} color={stats.profitFactor >= 1.5 ? C.green : C.gold}
            comparison={showComparison ? getComparison(thisWeekStats.profitFactor, lastWeekStats.profitFactor) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <KpiCard label="平均R" value={stats.avgR + "R"} color={stats.avgR >= 0 ? C.green : C.red}
            comparison={showComparison ? getComparison(thisWeekStats.avgR, lastWeekStats.avgR) : null} />
        </div>
        <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <KpiCard label="执行合格率" value={goodScoreRate + "%"} />
        </div>
      </div>

      <StreakKpis stats={stats} />

      <WeeklyTrend weeklyTrend={stats.weeklyTrend} theme={theme} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="核心指标">
          {[["盈利笔数", stats.wins], ["亏损笔数", stats.losses], ["平均盈利", "$" + stats.avgWin.toFixed(2)], ["平均亏损", "$" + stats.avgLoss.toFixed(2)]].map(([k, v]) => (
            <StatRow key={k} label={k} value={v} />
          ))}
        </Card>
        <Card title="成本分析">
          {[["账户盈亏", "$" + stats.totalGross.toFixed(2)], ["点差成本(参考)", "$" + Math.abs(stats.totalSpread).toFixed(2)], ["库存费", (stats.totalSwap >= 0 ? "+$" : "-$") + Math.abs(stats.totalSwap).toFixed(2)], ["净盈亏", "$" + stats.totalNet.toFixed(2)]].map(([k, v]) => (
            <StatRow key={k} label={k} value={v} />
          ))}
        </Card>
      </div>

      {stats.cumData.length > 1 && (
        <Card title="累计净盈亏曲线">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.cumData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" stroke={C.muted} fontSize={10} />
              <YAxis stroke={C.muted} fontSize={10} tickFormatter={v => "$" + v} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => ["$" + v, "累计盈亏"]} />
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

      {violationStats && violationStats.totalViolations > 0 && (
        <div className="mt-8">
          <h3 className="text-base font-bold mb-4">违规分析</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] text-muted mb-1">总违规次数</div>
              <div className="text-2xl font-bold text-red">{violationStats.totalViolations}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] text-muted mb-1">涉及交易笔数</div>
              <div className="text-2xl font-bold">{violationStats.tradesWithViolations}</div>
            </div>
          </div>
          {violationStats.topViolated.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] text-muted mb-3 font-medium">最常违反的政策</div>
              <div className="space-y-2">
                {violationStats.topViolated.slice(0, 5).map(v => {
                  const catLabel = v.category === 'rules' ? '规则' : v.category === 'strategy' ? '策略' : '风控'
                  return (
                    <div key={v.id} className="flex items-center gap-3">
                      <span className="text-[10px] bg-red/10 text-red px-1.5 py-0.5 rounded font-medium shrink-0">{catLabel}</span>
                      <span className="text-sm flex-1 truncate">{v.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="h-2 bg-red/20 rounded-full overflow-hidden" style={{ width: '80px' }}>
                          <div
                            className="h-full bg-red rounded-full"
                            style={{ width: `${(v.count / violationStats.topViolated[0].count) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted w-6 text-right">{v.count}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AnalysisTable({ data }) {
  if (!data || data.length === 0) return <div className="text-xs text-muted">暂无数据</div>
  const sorted = [...data].sort((a, b) => b.pnl - a.pnl)
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr>{["名称","交易数","胜率","净盈亏","平均R"].map(h => (
          <th key={h} className="px-2 py-1.5 text-left text-muted font-semibold border-b border-border text-[10px]">{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {sorted.map(d => (
          <tr key={d.name} className={`border-b border-border/30 ${d.count < 2 ? 'opacity-50' : ''}`}>
            <td className="px-2 py-1.5 font-semibold">{d.name}</td>
            <td className="px-2 py-1.5">{d.count}</td>
            <td className={`px-2 py-1.5 ${d.winRate >= 50 ? 'text-green' : 'text-red'}`}>{d.winRate}%</td>
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
