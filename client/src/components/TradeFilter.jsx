import { useState } from 'react'
import Select from './ui/Select'
import { en } from '../i18n/en'

const QUICK_OPTIONS = [
  { labelKey: 'today', key: 'today', label: 'Today' },
  { labelKey: 'week', key: 'week', label: 'Week' },
  { labelKey: 'month', key: 'month', label: 'Month' },
  { labelKey: 'all', key: 'all', label: 'All' },
]

function getDateRange(key) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`

  if (key === 'today') return { date_from: today, date_to: today }
  if (key === 'week') {
    const d = new Date(now)
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    const mon = d.toISOString().split('T')[0]
    const sun = new Date(d)
    sun.setDate(sun.getDate() + 6)
    return { date_from: mon, date_to: sun.toISOString().split('T')[0] }
  }
  if (key === 'month') {
    const first = `${yyyy}-${mm}-01`
    const last = new Date(yyyy, now.getMonth() + 1, 0).toISOString().split('T')[0]
    return { date_from: first, date_to: last }
  }
  return { date_from: null, date_to: null }
}

export default function TradeFilter({ filter, onChange, pairs }) {
  const [active, setActive] = useState('all')

  const handleQuick = (key) => {
    setActive(key)
    const range = getDateRange(key)
    onChange({ ...filter, ...range })
  }

  const handlePair = (v) => {
    onChange({ ...filter, pair: v || null })
  }

  const handleDirection = (v) => {
    onChange({ ...filter, direction: v || null })
  }

  const pairOptions = [
    { value: '', label: en.filter.all },
    ...(pairs || []).map(p => ({ value: p, label: p })),
  ]
  const dirOptions = [
    { value: '', label: en.filter.all },
    { value: 'long', label: en.trade.long },
    { value: 'short', label: en.trade.short },
  ]

  return (
    <div className="mb-4 flex items-center gap-2 flex-wrap">
      <div className="flex gap-1 overflow-x-auto">
        {QUICK_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleQuick(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all duration-200
              ${active === opt.key
                ? 'bg-accent text-white'
                : 'text-muted border border-border hover:text-text hover:border-accent/50'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="hidden sm:flex items-center gap-2 ml-auto">
        <div className="w-[140px]">
          <Select
            value={filter.pair || ''}
            onChange={v => handlePair(v || null)}
            options={pairOptions}
          />
        </div>
        <div className="w-[110px]">
          <Select
            value={filter.direction || ''}
            onChange={v => handleDirection(v || null)}
            options={dirOptions}
          />
        </div>
      </div>
    </div>
  )
}
