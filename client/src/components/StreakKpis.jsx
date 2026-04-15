import KpiCard from './ui/KpiCard'
import { en } from '../i18n/en'

export default function StreakKpis({ stats }) {
  if (!stats) return null

  const { currentStreak, maxWinStreak, maxDrawdown } = stats

  const streakLabel = currentStreak && currentStreak.type === 'win'
    ? `${en.stats.winStreak} ${currentStreak.count}`
    : currentStreak && currentStreak.type === 'loss'
      ? `${en.stats.lossStreak} ${currentStreak.count}`
      : '—'
  const streakColor = currentStreak && currentStreak.type === 'win' ? '#10b981' : '#ef4444'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:flex gap-2 sm:gap-3">
      <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '300ms' }}>
        <KpiCard
          label={en.stats.currentStreak}
          value={currentStreak && currentStreak.count > 0 ? streakLabel : '—'}
          color={currentStreak && currentStreak.count > 0 ? streakColor : undefined}
        />
      </div>
      <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '350ms' }}>
        <KpiCard
          label={en.stats.maxWinStreak}
          value={`${maxWinStreak ?? 0}`}
          color="#10b981"
        />
      </div>
      <div className="flex-1 min-w-[140px] animate-fade-in-up" style={{ animationDelay: '400ms' }}>
        <KpiCard
          label={en.stats.maxDrawdown}
          value={maxDrawdown != null && maxDrawdown < 0 ? `$${maxDrawdown}` : '$0'}
          color={maxDrawdown != null && maxDrawdown < 0 ? '#ef4444' : undefined}
        />
      </div>
    </div>
  )
}
