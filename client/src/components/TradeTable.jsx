import { useState, useMemo } from 'react'
import { enrichTrade } from '../lib/enrichTrade'
import { en } from '../i18n/en'
import EmptyState from './EmptyState'
import Pagination from './ui/Pagination'

function formatTime(openTime) {
  if (!openTime) return ''
  const [datePart, timePart] = openTime.split('T')
  if (!datePart) return openTime
  const [, mm, dd] = datePart.split('-')
  return `${mm}/${dd} ${timePart || '00:00'}`
}

function SortHeader({ col, label, sortKey, sortOrder, onSort }) {
  const active = sortKey === col
  return (
    <th
      className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide cursor-pointer select-none hover:text-text transition-colors"
      onClick={() => onSort(col)}
    >
      {label} {active ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>
  )
}

function TradeCard({ trade: t, animIndex, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = t.direction === 'long'
  return (
    <div className="bg-card border border-border rounded-xl p-3 animate-fade-in-up" style={{ animationDelay: `${animIndex * 40}ms` }}>
      <div className="flex items-center justify-between cursor-pointer active:scale-[0.97] active:opacity-80 transition-transform duration-100" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{t.pair}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isLong ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
            {isLong ? en.trade.long : en.trade.short}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono font-bold text-sm ${t.rMultiple != null && t.rMultiple >= 0 ? 'text-green' : 'text-red'}`}>
            {t.rMultiple != null ? `${t.rMultiple > 0 ? "+" : ""}${t.rMultiple.toFixed(2)}R` : '—'}
          </span>
          <span className={`font-mono font-bold text-sm ${t.netPnl >= 0 ? 'text-green' : 'text-red'}`}>
            ${t.netPnl.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px] text-muted">
        <span>{formatTime(t.open_time)} · {t.strategy} · {t.timeframe}</span>
        <span>{t.score || ''}</span>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="grid grid-cols-3 gap-2 text-xs mb-3">
            <div><span className="text-muted">{en.trade.lots}</span> <span className="font-mono">{t.lots}</span></div>
            <div><span className="text-muted">{en.trade.entry}</span> <span className="font-mono">{t.entry}</span></div>
            <div><span className="text-muted">{en.trade.exitPrice}</span> <span className="font-mono">{t.exit_price}</span></div>
          </div>
          {t.notes && <p className="text-xs text-muted mb-3">{t.notes}</p>}
          <div className="flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit(t) }} className="text-accent text-xs cursor-pointer">{en.common.edit}</button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(t.id) }} className="text-red text-xs cursor-pointer">{en.common.delete}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TradeTable({ trades, onEdit, onDelete, pairsByName, pagination, onPageChange }) {
  const [sortKey, setSortKey] = useState('open_time')
  const [sortOrder, setSortOrder] = useState('desc')

  const computed = useMemo(
    () => trades.map(t => enrichTrade(t, pairsByName?.get?.(t.pair))),
    [trades, pairsByName],
  )

  const sorted = useMemo(() => {
    const arr = [...computed]
    arr.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey]
      if (va == null) va = ''
      if (vb == null) vb = ''
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortOrder === 'asc' ? -1 : 1
      if (va > vb) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [computed, sortKey, sortOrder])

  const handleSort = (col) => {
    if (sortKey === col) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(col)
      setSortOrder('desc')
    }
  }

  if (computed.length === 0 && (!pagination || pagination.total === 0)) {
    return <EmptyState type="trades" />
  }

  const c = en.trade.columns

  return (
    <div>
      <div className="sm:hidden space-y-2">
        {sorted.map((t, i) => (
          <TradeCard key={t.id} trade={t} animIndex={i} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.index}</th>
              <SortHeader col="open_time" label={c.date} sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <SortHeader col="pair" label={c.pair} sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.direction}</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.strategy}</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.timeframe}</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.lots}</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.entry}</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.exit}</th>
              <SortHeader col="rMultiple" label={c.rMultiple} sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <SortHeader col="netPnl" label={c.netPnl} sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <SortHeader col="score" label={c.score} sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">{c.emotion}</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const isLong = t.direction === 'long'
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-hover transition-colors duration-150">
                  <td className="px-3 py-3 text-muted">{(pagination ? pagination.offset : 0) + i + 1}</td>
                  <td className="px-3 py-3 whitespace-nowrap" title={t.open_time}>
                    {formatTime(t.open_time)}
                    <span className="block text-[10px] text-muted">{t.weekday}</span>
                  </td>
                  <td className="px-3 py-3 font-semibold">{t.pair}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${isLong ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                      {isLong ? en.trade.long : en.trade.short}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[11px]">{t.strategy}</td>
                  <td className="px-3 py-3 text-[11px] text-muted">{t.timeframe}</td>
                  <td className="px-3 py-3 font-mono">{t.lots}</td>
                  <td className="px-3 py-3 font-mono text-[11px]">{t.entry}</td>
                  <td className="px-3 py-3 font-mono text-[11px]">{t.exit_price}</td>
                  <td className={`px-3 py-3 font-mono font-bold ${t.rMultiple != null && t.rMultiple >= 0 ? 'text-green' : 'text-red'}`}>
                    {t.rMultiple != null ? `${t.rMultiple > 0 ? "+" : ""}${t.rMultiple.toFixed(2)}R` : '—'}
                  </td>
                  <td className={`px-3 py-3 font-mono font-bold ${t.netPnl >= 0 ? 'text-green' : 'text-red'}`}>
                    ${t.netPnl.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-[10px]">{t.score || ''}</td>
                  <td className="px-3 py-3 text-[10px]">{t.emotion}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <button onClick={() => onEdit(t)} className="text-accent hover:text-accent/80 cursor-pointer mr-2 transition-colors">
                      {en.common.edit}
                    </button>
                    <button onClick={() => onDelete(t.id)} className="text-red hover:text-red/80 cursor-pointer transition-colors">
                      {en.common.delete}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        total={pagination ? pagination.total : sorted.length}
        limit={pagination ? pagination.limit : 0}
        offset={pagination ? pagination.offset : 0}
        onChange={onPageChange || (() => {})}
      />
    </div>
  )
}
