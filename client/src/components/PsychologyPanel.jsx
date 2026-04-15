import { useState, useMemo } from 'react'
import KpiCard from './ui/KpiCard'
import Select from './ui/Select'
import Input from './ui/Input'
import { DIRECTIONS } from '../lib/constants'
import { calcStats } from '../lib/tradeCalc'
import { en } from '../i18n/en'

const today = () => new Date().toISOString().split("T")[0]

export default function PsychologyPanel({ trades, pairs, pairsByName: providedPairsByName, onAddMissed, onDeleteTrade }) {
  const pairsByName = useMemo(() => {
    if (providedPairsByName) return providedPairsByName
    return new Map((pairs ?? []).map((p) => typeof p === 'object' ? [p.name, p] : [p, { name: p, asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 0 }]))
  }, [pairs, providedPairsByName])
  const [showMissedForm, setShowMissedForm] = useState(false)
  const [showMissedList, setShowMissedList] = useState(false)
  const [missedForm, setMissedForm] = useState({ open_time: today() + 'T00:00', pair: pairs[0] || '', direction: 'long', notes: '' })

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
  const stats = useMemo(() => calcStats(closedTrades, pairsByName), [closedTrades, pairsByName])
  const winRate = stats ? Math.round(stats.winRate) : 0
  const totalClosed = stats ? stats.tradeCount : 0

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
    setMissedForm({ open_time: today() + 'T00:00', pair: pairs[0] || '', direction: 'long', notes: '' })
    setShowMissedForm(false)
  }

  return (
    <div className="mb-5">
      {/* KPI Cards */}
      <div className="flex gap-3 flex-wrap mb-3">
        <KpiCard
          label={en.trade.todayCost}
          value={`$${Math.round(todayRiskTotal)}`}
          color="#3b82f6"
          sub={todayTickets > 0 ? `${todayTickets} ${en.trade.tickets}` : en.trade.noneOpen}
        />
        <KpiCard
          label={en.trade.histWinRate}
          value={totalClosed > 0 ? `${winRate}%` : '--'}
          color="#22c55e"
          sub={totalClosed > 0 ? `${totalClosed} ${en.stats.tradeCount}` : en.stats.noData}
        />
        <div className="bg-card border border-border rounded-xl px-5 py-4 flex-1 min-w-[140px] shadow-sm
          hover:border-accent/30 transition-all duration-300 relative">
          <button
            onClick={() => { setShowMissedForm(v => !v); setShowMissedList(false) }}
            className="absolute top-2.5 right-3 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center
              cursor-pointer text-amber-500 font-bold text-sm hover:bg-amber-500/30 transition-colors"
            title={en.trade.recordMissed}
          >+</button>
          <div className="text-[11px] text-muted tracking-wide uppercase mb-1">{en.trade.todayMissed}</div>
          <div
            className="text-2xl font-bold font-mono cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: '#eab308' }}
            onClick={() => { if (todayMissed.length > 0) setShowMissedList(v => !v) }}
            title={todayMissed.length > 0 ? en.trade.recordMissed : ''}
          >
            {todayMissed.length}
          </div>
          <div className="text-[10px] text-muted mt-1">{en.trade.missed}</div>
        </div>
      </div>

      {/* Missed trade form */}
      {showMissedForm && (
        <div className="p-3 bg-card border border-dashed border-amber-500/30 rounded-xl mb-3">
          <div className="text-xs font-semibold mb-2 text-amber-500">{en.trade.recordMissed}</div>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="min-w-[110px]">
              <div className="text-[11px] text-muted mb-1">{en.common.date}</div>
              <Input type="date" value={missedForm.open_time.split('T')[0]} onChange={v => setMissedForm(f => ({ ...f, open_time: v + 'T00:00' }))} />
            </div>
            <div className="min-w-[100px]">
              <div className="text-[11px] text-muted mb-1">{en.trade.pair}</div>
              <Select value={missedForm.pair} onChange={v => setMissedForm(f => ({ ...f, pair: v }))} options={pairs} />
            </div>
            <div className="min-w-[90px]">
              <div className="text-[11px] text-muted mb-1">{en.trade.direction}</div>
              <Select value={missedForm.direction} onChange={v => setMissedForm(f => ({ ...f, direction: v }))} options={DIRECTIONS} />
            </div>
            <div className="flex-1 min-w-[150px]">
              <div className="text-[11px] text-muted mb-1">{en.trade.notes}</div>
              <Input value={missedForm.notes} onChange={v => setMissedForm(f => ({ ...f, notes: v }))} placeholder={en.trade.missedReason} />
            </div>
            <button
              onClick={handleSubmitMissed}
              className="bg-amber-500/20 text-amber-500 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer
                hover:bg-amber-500/30 transition-colors whitespace-nowrap"
            >{en.common.add}</button>
            <button
              onClick={() => setShowMissedForm(false)}
              className="text-muted px-3 py-2 rounded-lg text-sm cursor-pointer hover:text-text transition-colors"
            >{en.common.cancel}</button>
          </div>
        </div>
      )}

      {/* Missed trade list */}
      {showMissedList && todayMissed.length > 0 && (
        <div className="p-3 bg-card border border-border rounded-xl mb-3">
          <div className="text-xs font-semibold mb-2 text-amber-500">{en.trade.todayMissed}</div>
          <div className="space-y-1.5">
            {todayMissed.map(t => {
              const isLong = t.direction === 'long'
              return (
                <div key={t.id} className="flex items-center gap-3 text-sm py-1">
                  <span className="font-medium">{t.pair}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    isLong ? 'bg-green/15 text-green' : 'bg-red/15 text-red'
                  }`}>{isLong ? en.trade.long : en.trade.short}</span>
                  {t.notes && <span className="text-muted text-xs flex-1 truncate">{t.notes}</span>}
                  <button
                    onClick={() => onDeleteTrade(t.id)}
                    className="text-muted hover:text-red text-xs cursor-pointer transition-colors ml-auto"
                  >{en.common.delete}</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
