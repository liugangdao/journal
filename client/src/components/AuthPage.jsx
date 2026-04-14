import { useState } from 'react'
import { api } from '../hooks/useApi'

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

export default function AuthPage({ onAuth, onBack, theme, onToggleTheme }) {
  const [mode, setMode] = useState('login')
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let user
      if (mode === 'register') {
        user = await api.register({ username: username.trim(), email: email.trim(), password })
      } else {
        user = await api.login({ identifier: identifier.trim(), password })
      }
      onAuth(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setError('')
  }

  const inputClass = `w-full bg-input border border-border rounded-xl px-4 py-3 text-sm text-text
    focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all duration-300
    placeholder:text-muted/50`

  return (
    <div className="min-h-screen bg-bg text-text font-sans flex flex-col overflow-hidden">

      {/* Background glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full animate-glow-pulse pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, var(--c-accent) 0%, transparent 70%)',
          opacity: 0.06,
          filter: 'blur(80px)',
        }}
      />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-header-bg border-b border-border/50 animate-fade-in">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="group flex items-center gap-1.5 text-xs text-muted hover:text-text transition-all duration-300 cursor-pointer px-2 py-1 -ml-2 rounded-full hover:bg-hover"
          >
            <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight">交易日志</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 pt-20 pb-12">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="text-center mb-10 animate-fade-up">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {mode === 'login' ? (
                  <>
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </>
                ) : (
                  <>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </>
                )}
              </svg>
            </div>
            <h2 className="text-xl font-bold tracking-tight">
              {mode === 'login' ? '欢迎回来' : '创建账号'}
            </h2>
            <p className="text-xs text-muted mt-2">
              {mode === 'login' ? '登录以继续使用交易日志' : '注册后即可开始记录交易'}
            </p>
          </div>

          {/* Form card */}
          <div className="animate-scale-in delay-100">
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'register' ? (
                <>
                  <div className="animate-fade-up delay-200">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className={inputClass}
                      placeholder="用户名"
                    />
                  </div>
                  <div className="animate-fade-up delay-300">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={inputClass}
                      placeholder="邮箱地址"
                    />
                  </div>
                </>
              ) : (
                <div className="animate-fade-up delay-200">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    className={inputClass}
                    placeholder="邮箱或用户名"
                  />
                </div>
              )}

              <div className={`animate-fade-up ${mode === 'register' ? 'delay-400' : 'delay-300'}`}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputClass}
                  placeholder={mode === 'register' ? '设置密码 (至少6位)' : '密码'}
                />
              </div>

              {error && (
                <div className="animate-fade-up flex items-center gap-2 text-red text-xs py-2 px-3 bg-red/5 border border-red/10 rounded-xl">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {error}
                </div>
              )}

              <div className={`animate-fade-up ${mode === 'register' ? 'delay-500' : 'delay-400'} pt-1`}>
                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full bg-accent text-white py-3 rounded-xl text-sm font-medium cursor-pointer
                    transition-all duration-300 hover:shadow-lg hover:shadow-accent/20 hover:scale-[1.01] active:scale-[0.99]
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:scale-100"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      处理中
                    </span>
                  ) : (
                    <>
                      {mode === 'login' ? '登录' : '注册'}
                      <svg className="inline-block ml-1 w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Switch mode */}
          <p className={`animate-fade-up ${mode === 'register' ? 'delay-600' : 'delay-500'} text-center text-xs text-muted mt-8`}>
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button
              onClick={switchMode}
              className="text-accent hover:text-accent/80 ml-1 cursor-pointer font-medium transition-colors duration-300"
            >
              {mode === 'login' ? '免费注册' : '去登录'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
