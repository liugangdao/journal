import { useState, useMemo } from 'react'
import { calcTrade } from '../lib/calc'
import EmptyState from './EmptyState'
import Pagination from './ui/Pagination'

const SORTABLE = {
  open_time: '日期',
  pair: '品种',
  rMultiple: 'R',
  netPnl: '净盈亏',
  score: '评分',
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

function formatTime(openTime) {
  if (!openTime) return ''
  const [datePart, timePart] = openTime.split('T')
  if (!datePart) return openTime
  const [, mm, dd] = datePart.split('-')
  return `${mm}/${dd} ${timePart || '00:00'}`
}

function TradeCard({ trade: t, index, animIndex, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-card border border-border rounded-xl p-3 animate-fade-in-up" style={{ animationDelay: `${animIndex * 40}ms` }}>
      <div className="flex items-center justify-between cursor-pointer active:scale-[0.97] active:opacity-80 transition-transform duration-100" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{t.pair}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${t.direction.startsWith("多") ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
            {t.direction.startsWith("多") ? "多" : "空"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono font-bold text-sm ${t.rMultiple != null && t.rMultiple >= 0 ? 'text-green' : 'text-red'}`}>
            {t.rMultiple != null ? `${t.rMultiple > 0 ? "+" : ""}${t.rMultiple}R` : '—'}
          </span>
          <span className={`font-mono font-bold text-sm ${t.netPnl >= 0 ? 'text-green' : 'text-red'}`}>
            ${t.netPnl.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px] text-muted">
        <span>{formatTime(t.open_time)} · {t.strategy} · {t.timeframe}</span>
        <span>{t.score?.split("-")[0]}</span>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="grid grid-cols-3 gap-2 text-xs mb-3">
            <div><span className="text-muted">手数</span> <span className="font-mono">{t.lots}</span></div>
            <div><span className="text-muted">入场</span> <span className="font-mono">{t.entry}</span></div>
            <div><span className="text-muted">出场</span> <span className="font-mono">{t.exit_price}</span></div>
          </div>
          {t.notes && <p className="text-xs text-muted mb-3">{t.notes}</p>}
          <div className="flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit(t) }} className="text-accent text-xs cursor-pointer">编辑</button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(t.id) }} className="text-red text-xs cursor-pointer">删除</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TradeTable({ trades, onEdit, onDelete, spreadCostMap, pagination, onPageChange }) {
  const [sortKey, setSortKey] = useState('open_time')
  const [sortOrder, setSortOrder] = useState('desc')

  const computed = useMemo(() => trades.map(t => calcTrade(t, spreadCostMap)), [trades, spreadCostMap])

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

  return (
    <div>
      <div className="sm:hidden space-y-2">
        {sorted.map((t, i) => (
          <TradeCard key={t.id} trade={t} index={(pagination ? pagination.offset : 0) + i + 1} animIndex={i} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">#</th>
              <SortHeader col="open_time" label="日期" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <SortHeader col="pair" label="品种" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">方向</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">策略</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">周期</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">手数</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">入场</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">出场</th>
              <SortHeader col="rMultiple" label="R" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <SortHeader col="netPnl" label="净盈亏" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <SortHeader col="score" label="评分" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide">情绪</th>
              <th className="px-3 py-3 text-left text-muted text-[11px] font-semibold whitespace-nowrap tracking-wide"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-hover transition-colors duration-150">
                <td className="px-3 py-3 text-muted">{(pagination ? pagination.offset : 0) + i + 1}</td>
                <td className="px-3 py-3 whitespace-nowrap" title={t.open_time}>
                  {formatTime(t.open_time)}
                  <span className="block text-[10px] text-muted">{t.weekday}</span>
                </td>
                <td className="px-3 py-3 font-semibold">{t.pair}</td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold
                    ${t.direction.startsWith("多")
                      ? 'bg-green/10 text-green'
                      : 'bg-red/10 text-red'}`}>
                    {t.direction.startsWith("多") ? "做多" : "做空"}
                  </span>
                </td>
                <td className="px-3 py-3 text-[11px]">{t.strategy}</td>
                <td className="px-3 py-3 text-[11px] text-muted">{t.timeframe}</td>
                <td className="px-3 py-3 font-mono">{t.lots}</td>
                <td className="px-3 py-3 font-mono text-[11px]">{t.entry}</td>
                <td className="px-3 py-3 font-mono text-[11px]">{t.exit_price}</td>
                <td className={`px-3 py-3 font-mono font-bold ${t.rMultiple != null && t.rMultiple >= 0 ? 'text-green' : 'text-red'}`}>
                  {t.rMultiple != null ? `${t.rMultiple > 0 ? "+" : ""}${t.rMultiple}R` : '—'}
                </td>
                <td className={`px-3 py-3 font-mono font-bold ${t.netPnl >= 0 ? 'text-green' : 'text-red'}`}>
                  ${t.netPnl.toFixed(2)}
                </td>
                <td className="px-3 py-3 text-[10px]">{t.score?.split("-")[0]}</td>
                <td className="px-3 py-3 text-[10px]">{t.emotion}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <button onClick={() => onEdit(t)} className="text-accent hover:text-accent/80 cursor-pointer mr-2 transition-colors">
                    编辑
                  </button>
                  <button onClick={() => onDelete(t.id)} className="text-red hover:text-red/80 cursor-pointer transition-colors">
                    删除
                  </button>
                </td>
              </tr>
            ))}
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
