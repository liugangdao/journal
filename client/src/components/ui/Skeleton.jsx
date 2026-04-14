export default function Skeleton({ className = '' }) {
  return (
    <div className={`bg-border/60 rounded-lg ${className}`}
      style={{
        backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  )
}

export function SkeletonKpi() {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4 flex-1 min-w-[140px]">
      <Skeleton className="h-3 w-16 mb-3" />
      <Skeleton className="h-7 w-24 mb-1" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex justify-between mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-5">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </div>
  )
}
