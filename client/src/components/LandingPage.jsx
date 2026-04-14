function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-full text-muted hover:text-text hover:bg-hover transition-all duration-300 cursor-pointer"
      title={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}

export default function LandingPage({ onNavigateAuth, theme, onToggleTheme }) {
  const features = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 5-9" />
        </svg>
      ),
      title: '数据面板',
      desc: '胜率、盈亏比、R倍数分析，一目了然',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
        </svg>
      ),
      title: '交易记录',
      desc: '精确记录每笔交易，自动计算关键指标',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      title: '纪律管理',
      desc: '交易规则追踪，违规记录可视化',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
      title: '复盘系统',
      desc: '周度月度复盘，持续优化交易策略',
    },
  ]

  return (
    <div className="min-h-screen bg-bg text-text font-sans overflow-hidden">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-header-bg border-b border-border/50 animate-fade-in">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight">交易日志</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              onClick={onNavigateAuth}
              className="text-xs text-muted hover:text-text transition-colors duration-300 cursor-pointer px-3 py-1.5 rounded-full hover:bg-hover"
            >
              登录 / 注册
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-3xl mx-auto px-6 pt-32 pb-12 sm:pt-44 sm:pb-20 text-center">
        {/* Background glow */}
        <div
          className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full animate-glow-pulse pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse, var(--c-accent) 0%, transparent 70%)',
            opacity: 0.08,
            filter: 'blur(60px)',
          }}
        />

        <p className="animate-fade-up text-xs font-medium tracking-[0.2em] uppercase text-accent mb-6">
          Trading Journal
        </p>

        <h1 className="animate-fade-up delay-100 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.1]">
          记录交易
          <br />
          <span className="bg-gradient-to-r from-accent to-purple bg-clip-text text-transparent">
            精进策略
          </span>
        </h1>

        <p className="animate-fade-up delay-200 mt-6 text-muted text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          为认真对待交易的人打造。
          <br />
          记录、分析、复盘，让每一笔交易都有意义。
        </p>

        <div className="animate-fade-up delay-300 mt-10 flex items-center justify-center gap-3">
          <button
            onClick={onNavigateAuth}
            className="group relative bg-accent text-white px-7 py-2.5 rounded-full text-sm font-medium cursor-pointer
              transition-all duration-300 hover:shadow-lg hover:shadow-accent/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            开始使用
            <svg className="inline-block ml-1.5 w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </section>

      {/* Stats bar */}
      <section className="animate-fade-up delay-400 max-w-2xl mx-auto px-6 pb-16 sm:pb-24">
        <div className="flex items-center justify-center gap-8 sm:gap-16 text-center">
          {[
            { value: '外汇', label: 'Forex' },
            { value: '贵金属', label: 'Metals' },
            { value: '能源', label: 'Energy' },
            { value: '全品种', label: 'Coverage' },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-sm sm:text-base font-semibold">{s.value}</div>
              <div className="text-[10px] text-muted mt-0.5 tracking-wide uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-3xl mx-auto px-6 pb-20 sm:pb-32">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`animate-fade-up delay-${(i + 4) * 100} group bg-card/60 backdrop-blur-sm border border-border/60 rounded-2xl p-5
                hover:border-accent/20 hover:bg-card transition-all duration-500 hover:-translate-y-1`}
            >
              <div className="text-muted group-hover:text-accent transition-colors duration-500 mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-xs mb-1.5 tracking-tight">{f.title}</h3>
              <p className="text-muted text-[11px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="animate-fade-up delay-700 max-w-3xl mx-auto px-6 pb-20 sm:pb-28 text-center">
        <div className="bg-card/40 backdrop-blur-sm border border-border/40 rounded-3xl py-12 px-8">
          <p className="text-lg sm:text-xl font-semibold tracking-tight mb-2">准备好了吗？</p>
          <p className="text-muted text-sm mb-6">免费注册，即刻开始你的交易复盘之旅</p>
          <button
            onClick={onNavigateAuth}
            className="bg-accent text-white px-7 py-2.5 rounded-full text-sm font-medium cursor-pointer
              transition-all duration-300 hover:shadow-lg hover:shadow-accent/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            免费注册
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center">
        <p className="text-[10px] text-muted tracking-wider uppercase">Trading Journal</p>
      </footer>
    </div>
  )
}
