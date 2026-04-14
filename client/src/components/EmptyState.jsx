const illustrations = {
  trades: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="25" y="20" width="70" height="85" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
      <line x1="35" y1="45" x2="85" y2="45" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
      <line x1="35" y1="58" x2="75" y2="58" stroke="currentColor" strokeWidth="1.5" opacity="0.15"/>
      <line x1="35" y1="71" x2="65" y2="71" stroke="currentColor" strokeWidth="1.5" opacity="0.1"/>
      <polyline points="35,88 50,78 60,82 72,72 85,76" stroke="var(--c-accent)" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="85" cy="76" r="3" fill="var(--c-accent)" opacity="0.5"/>
    </svg>
  ),
  positions: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="90" x2="100" y2="90" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
      <line x1="20" y1="90" x2="20" y2="30" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
      <polyline points="25,75 40,68 55,70 70,55 85,58 95,50" stroke="var(--c-accent)" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="25" y1="90" x2="25" y2="75" stroke="currentColor" strokeWidth="1" opacity="0.1"/>
      <line x1="40" y1="90" x2="40" y2="68" stroke="currentColor" strokeWidth="1" opacity="0.1"/>
      <line x1="55" y1="90" x2="55" y2="70" stroke="currentColor" strokeWidth="1" opacity="0.1"/>
      <line x1="70" y1="90" x2="70" y2="55" stroke="currentColor" strokeWidth="1" opacity="0.1"/>
      <line x1="85" y1="90" x2="85" y2="58" stroke="currentColor" strokeWidth="1" opacity="0.1"/>
    </svg>
  ),
  notes: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="20" width="55" height="75" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
      <line x1="40" y1="40" x2="75" y2="40" stroke="currentColor" strokeWidth="1.5" opacity="0.15"/>
      <line x1="40" y1="52" x2="70" y2="52" stroke="currentColor" strokeWidth="1.5" opacity="0.1"/>
      <line x1="40" y1="64" x2="60" y2="64" stroke="currentColor" strokeWidth="1.5" opacity="0.08"/>
      <line x1="78" y1="85" x2="92" y2="35" stroke="var(--c-accent)" strokeWidth="2" opacity="0.5" strokeLinecap="round"/>
      <polygon points="78,85 75,92 82,89" fill="var(--c-accent)" opacity="0.5"/>
    </svg>
  ),
  dashboard: (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="20" width="90" height="70" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
      <rect x="30" y="55" width="12" height="25" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.15" fill="none"/>
      <rect x="50" y="45" width="12" height="35" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.15" fill="none"/>
      <rect x="70" y="35" width="12" height="45" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.15" fill="none"/>
      <polyline points="28,70 55,50 80,40" stroke="var(--c-accent)" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4"/>
    </svg>
  ),
}

const MESSAGES = {
  trades: { title: '暂无交易记录', sub: '点击 + 记录你的第一笔交易' },
  positions: { title: '当前无持仓', sub: '开仓后会在这里显示' },
  notes: { title: '还没有复盘笔记', sub: '每周花15分钟复盘 — 坚持才能进步' },
  dashboard: { title: '暂无数据', sub: '开始交易后这里会显示统计' },
}

export default function EmptyState({ type = 'trades', className = '' }) {
  const msg = MESSAGES[type]
  const illus = illustrations[type]

  return (
    <div className={`flex flex-col items-center justify-center py-16 text-muted ${className}`}>
      <div className="mb-4 opacity-60">{illus}</div>
      <div className="text-sm font-medium mb-1">{msg.title}</div>
      <p className="text-xs opacity-60">{msg.sub}</p>
    </div>
  )
}
