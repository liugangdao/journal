import KpiCard from './ui/KpiCard'

export default function StreakKpis({ stats }) {
  if (!stats) return null

  const { currentStreak, maxWinStreak, maxDrawdown } = stats

  const streakLabel = currentStreak.type === 'win' ? `连胜 ${currentStreak.count} 笔` : `连亏 ${currentStreak.count} 笔`
  const streakColor = currentStreak.type === 'win' ? '#10b981' : '#ef4444'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:flex gap-2 sm:gap-3">
      <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '300ms' }}>
        <KpiCard
          label="当前连续"
          value={currentStreak.count > 0 ? streakLabel : '—'}
          color={currentStreak.count > 0 ? streakColor : undefined}
        />
      </div>
      <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '350ms' }}>
        <KpiCard
          label="最大连胜"
          value={`${maxWinStreak} 笔`}
          color="#10b981"
        />
      </div>
      <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '400ms' }}>
        <KpiCard
          label="最大回撤"
          value={maxDrawdown < 0 ? `$${maxDrawdown}` : '$0'}
          color={maxDrawdown < 0 ? '#ef4444' : undefined}
        />
      </div>
    </div>
  )
}
