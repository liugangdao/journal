import { useState, useMemo } from 'react'
import KpiCard from './ui/KpiCard'
import Select from './ui/Select'
import Input from './ui/Input'
import { DIRECTIONS } from '../lib/constants'
import { calcStats } from '../lib/calc'

const today = () => new Date().toISOString().split("T")[0]

export default function PsychologyPanel({ trades, pairs, spreadCostMap, onAddMissed, onDeleteTrade }) {
  const [showMissedForm, setShowMissedForm] = useState(false)
  const [showMissedList, setShowMissedList] = useState(false)
  const [missedForm, setMissedForm] = useState({ open_time: today() + 'T00:00', pair: pairs[0] || '', direction: '多(Buy)', notes: '' })

  const todayStr = today()

  // Today's open trades with risk_amount
  const todayOpenTrades = useMemo(() =>
    trades.filter(t => t.status === 'open' && t.open_time && t.open_time.startsWith(todayStr)),
    [trades, todayStr]
  )
  const todayRiskTotal = useMemo(() =>
    todayOpenTrades.reduce((sum, t) => sum + (parseFloat(t.risk_amount) || 0), 0),
    [todayOpenTrades]
  )
  const todayTickets = useMemo(() =>
    todayOpenTrades.filter(t => parseFloat(t.risk_amount) > 0).length,
    [todayOpenTrades]
  )

  // Win rate from closed trades
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades])
  const stats = useMemo(() => calcStats(closedTrades, spreadCostMap), [closedTrades, spreadCostMap])
  const winRate = stats ? stats.winRate : 0
  const totalClosed = stats ? stats.total : 0

  // Today's missed trades
  const todayMissed = useMemo(() =>
    trades.filter(t => t.status === 'missed' && t.open_time && t.open_time.startsWith(todayStr)),
    [trades, todayStr]
  )

  const handleSubmitMissed = () => {
    if (!missedForm.pair || !missedForm.direction) return
    onAddMissed({
      open_time: missedForm.open_time || todayStr + 'T00:00',
      pair: missedForm.pair,
      direction: missedForm.direction,
      notes: missedForm.notes,
      status: 'missed'
    })
    setMissedForm({ open_time: today() + 'T00:00', pair: pairs[0] || '', direction: '多(Buy)', notes: '' })
    setShowMissedForm(false)
  }

  return (
    <div className="mb-5">
      {/* KPI Cards */}
      <div className="flex gap-3 flex-wrap mb-3">
        <KpiCard
          label="今日成本"
          value={`$${Math.round(todayRiskTotal)}`}
          color="#3b82f6"
          sub={todayTickets > 0 ? `${todayTickets} 张彩票` : '暂无开仓'}
        />
        <KpiCard
          label="历史胜率"
          value={totalClosed > 0 ? `${winRate}%` : '--'}
          color="#22c55e"
          sub={totalClosed > 0 ? `基于 ${totalClosed} 笔交易` : '暂无数据'}
        />
        <div className="bg-card border border-border rounded-xl px-5 py-4 flex-1 min-w-[140px] shadow-sm
          hover:border-accent/30 transition-all duration-300 relative">
          <button
            onClick={() => { setShowMissedForm(v => !v); setShowMissedList(false) }}
            className="absolute top-2.5 right-3 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center
              cursor-pointer text-amber-500 font-bold text-sm hover:bg-amber-500/30 transition-colors"
            title="记录踏空"
          >+</button>
          <div className="text-[11px] text-muted tracking-wide uppercase mb-1">今日踏空</div>
          <div
            className="text-2xl font-bold font-mono cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: '#eab308' }}
            onClick={() => { if (todayMissed.length > 0) setShowMissedList(v => !v) }}
            title={todayMissed.length > 0 ? '点击查看踏空记录' : ''}
          >
            {todayMissed.length}
          </div>
          <div className="text-[10px] text-muted mt-1">与你无关的利润</div>
        </div>
      </div>

      {/* Missed trade form */}
      {showMissedForm && (
        <div className="p-3 bg-card border border-dashed border-amber-500/30 rounded-xl mb-3">
          <div className="text-xs font-semibold mb-2 text-amber-500">记录踏空</div>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="min-w-[110px]">
              <div className="text-[11px] text-muted mb-1">日期</div>
              <Input type="date" value={missedForm.open_time.split('T')[0]} onChange={v => setMissedForm(f => ({ ...f, open_time: v + 'T00:00' }))} />
            </div>
            <div className="min-w-[100px]">
              <div className="text-[11px] text-muted mb-1">品种</div>
              <Select value={missedForm.pair} onChange={v => setMissedForm(f => ({ ...f, pair: v }))} options={pairs} />
            </div>
            <div className="min-w-[90px]">
              <div className="text-[11px] text-muted mb-1">方向</div>
              <Select value={missedForm.direction} onChange={v => setMissedForm(f => ({ ...f, direction: v }))} options={DIRECTIONS} />
            </div>
            <div className="flex-1 min-w-[150px]">
              <div className="text-[11px] text-muted mb-1">备注</div>
              <Input value={missedForm.notes} onChange={v => setMissedForm(f => ({ ...f, notes: v }))} placeholder="为什么没入场..." />
            </div>
            <button
              onClick={handleSubmitMissed}
              className="bg-amber-500/20 text-amber-500 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer
                hover:bg-amber-500/30 transition-colors whitespace-nowrap"
            >记录</button>
            <button
              onClick={() => setShowMissedForm(false)}
              className="text-muted px-3 py-2 rounded-lg text-sm cursor-pointer hover:text-text transition-colors"
            >取消</button>
          </div>
        </div>
      )}

      {/* Missed trade list */}
      {showMissedList && todayMissed.length > 0 && (
        <div className="p-3 bg-card border border-border rounded-xl mb-3">
          <div className="text-xs font-semibold mb-2 text-amber-500">今日踏空记录</div>
          <div className="space-y-1.5">
            {todayMissed.map(t => (
              <div key={t.id} className="flex items-center gap-3 text-sm py-1">
                <span className="font-medium">{t.pair}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  t.direction.startsWith('多') ? 'bg-green/15 text-green' : 'bg-red/15 text-red'
                }`}>{t.direction.startsWith('多') ? '多' : '空'}</span>
                {t.notes && <span className="text-muted text-xs flex-1 truncate">{t.notes}</span>}
                <button
                  onClick={() => onDeleteTrade(t.id)}
                  className="text-muted hover:text-red text-xs cursor-pointer transition-colors ml-auto"
                >删除</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
