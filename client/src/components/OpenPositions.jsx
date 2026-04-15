import { en } from '../i18n/en'

function formatDuration(openTime) {
  if (!openTime) return ''
  const start = new Date(openTime)
  const now = new Date()
  const diffMs = now - start
  if (diffMs < 0) return ''
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  if (days > 0) return `${days}d ${remainHours}h`
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function OpenPositions({ openTrades, onClose, onDelete }) {
  if (!openTrades || openTrades.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-muted mb-3">{en.trade.status.open} ({openTrades.length})</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {openTrades.map((trade, i) => {
          const isLong = trade.direction === 'long'
          return (
            <div key={trade.external_id} className="bg-card border border-border rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{trade.pair}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    isLong ? 'bg-green/15 text-green' : 'bg-red/15 text-red'
                  }`}>
                    {isLong ? en.trade.long : en.trade.short}
                  </span>
                </div>
                <span className="text-[11px] text-muted">{formatDuration(trade.open_time)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div>
                  <div className="text-muted mb-0.5">{en.trade.entryPrice}</div>
                  <div className="font-mono font-medium">{trade.entry}</div>
                </div>
                <div>
                  <div className="text-muted mb-0.5">{en.trade.stopPrice}</div>
                  <div className="font-mono font-medium text-red">{trade.stop}</div>
                </div>
                <div>
                  <div className="text-muted mb-0.5">{en.trade.targetPrice}</div>
                  <div className="font-mono font-medium text-green">{trade.target || '—'}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onClose(trade)}
                  className="flex-1 bg-accent text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer
                    hover:brightness-110 active:scale-95 transition-all duration-200"
                >
                  {en.trade.close}
                </button>
                <button
                  onClick={() => onDelete(trade.external_id)}
                  className="text-muted border border-border px-3 py-1.5 rounded-lg text-xs cursor-pointer
                    hover:text-red hover:border-red/30 active:scale-95 transition-all duration-200"
                >
                  {en.common.delete}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
