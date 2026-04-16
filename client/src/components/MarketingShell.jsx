import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import SignInDialog from './SignInDialog'
import { useTheme } from '../hooks/useTheme'
import { en } from '../i18n/en'

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg text-muted hover:text-text hover:bg-hover transition-all duration-200 cursor-pointer"
      aria-label={theme === 'dark' ? en.more.themeLight : en.more.themeDark}
    >
      {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
    </button>
  )
}

export default function MarketingShell({ children }) {
  const { theme, toggleTheme } = useTheme()
  const [signInOpen, setSignInOpen] = useState(false)
  const goToApp = () => { window.location.href = '/app' }

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-header-bg/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <a href="/" className="flex items-baseline gap-2 cursor-pointer group">
            <span className="text-lg font-bold tracking-tight group-hover:text-accent transition-colors">{en.app.titleShort}</span>
            <span className="hidden sm:inline text-[11px] text-muted">{en.app.tagline}</span>
          </a>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button
              onClick={() => setSignInOpen(true)}
              className="text-sm text-muted hover:text-text px-3 py-1.5 rounded-lg hover:bg-hover transition-colors cursor-pointer"
            >
              {en.landing.navSignIn}
            </button>
            <button
              onClick={goToApp}
              className="text-sm font-semibold bg-accent text-white px-4 py-1.5 rounded-lg hover:brightness-110 transition-all cursor-pointer"
            >
              {en.landing.navTryFree}
            </button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div>
            © {new Date().getFullYear()} {en.app.titleShort} · {en.marketing.footerTagline}
            {' · '}
            <a href="https://basiscalc.xyz" className="hover:text-text transition-colors" target="_blank" rel="noopener">basiscalc.xyz</a>
          </div>
          <div className="flex items-center gap-5">
            <a href="/about" className="hover:text-text transition-colors">{en.marketing.nav.about}</a>
            <a href="/privacy" className="hover:text-text transition-colors">{en.marketing.nav.privacy}</a>
            <a href="/terms" className="hover:text-text transition-colors">{en.marketing.nav.terms}</a>
          </div>
        </div>
      </footer>

      {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} />}
    </div>
  )
}
