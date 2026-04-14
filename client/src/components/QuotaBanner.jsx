export default function QuotaBanner({ quota, onUpgrade }) {
  if (!quota || quota.plan === 'premium') return null

  const { used, limit } = quota
  const isWarning = used >= 12
  const isExceeded = used >= limit

  return (
    <div className={`rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between text-sm border
      ${isExceeded
        ? 'bg-red/10 border-red/30 text-red'
        : isWarning
          ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
          : 'bg-card border-border text-muted'
      }`}>
      <span>
        本月已用 <strong className="font-mono">{used}/{limit}</strong> 笔
        {isExceeded && ' — 额度已满'}
      </span>
      {(isWarning || isExceeded) && (
        <button
          onClick={onUpgrade}
          className="text-xs font-semibold px-3 py-1 rounded-lg bg-accent text-white
            active:scale-[0.97] transition-transform"
        >
          升级 Premium
        </button>
      )}
    </div>
  )
}
