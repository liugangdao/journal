import { useState } from 'react'
import { ArrowRight, BookOpen, BarChart3, ShieldCheck, Lock, Sun, Moon } from 'lucide-react'
import Dashboard from './Dashboard'
import SignInDialog from './SignInDialog'
import { SAMPLE_TRADES } from '../lib/sampleTrades'
import { DEFAULT_PAIRS } from '../lib/defaults'
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

function FeatureCard({ icon: Icon, title, body }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 hover:border-accent/40 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  )
}

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  const [signInOpen, setSignInOpen] = useState(false)
  const goToApp = () => { window.location.href = '/app' }

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      {/* Header */}
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

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <div className="inline-block text-xs font-semibold tracking-wider text-accent uppercase mb-4">
          {en.landing.heroEyebrow}
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl mx-auto leading-tight">
          {en.landing.heroTitle}
        </h1>
        <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto mb-8 leading-relaxed">
          {en.landing.heroSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={goToApp}
            className="group bg-accent text-white px-7 py-3.5 rounded-xl text-base font-semibold cursor-pointer hover:brightness-110 transition-all duration-200 flex items-center gap-2"
          >
            {en.landing.heroCta}
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
        <p className="text-xs text-muted mt-4">{en.landing.heroCtaSub}</p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">{en.landing.featuresTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard icon={BookOpen} title={en.landing.feature1Title} body={en.landing.feature1Body} />
          <FeatureCard icon={BarChart3} title={en.landing.feature2Title} body={en.landing.feature2Body} />
          <FeatureCard icon={ShieldCheck} title={en.landing.feature3Title} body={en.landing.feature3Body} />
          <FeatureCard icon={Lock} title={en.landing.feature4Title} body={en.landing.feature4Body} />
        </div>
      </section>

      {/* Live demo dashboard */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">{en.landing.demoTitle}</h2>
          <p className="text-sm text-muted max-w-xl mx-auto">{en.landing.demoSubtitle}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-lg">
          <Dashboard
            trades={SAMPLE_TRADES}
            pairs={DEFAULT_PAIRS}
            theme={theme}
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">{en.landing.ctaTitle}</h2>
        <p className="text-sm text-muted mb-6">{en.landing.ctaSubtitle}</p>
        <button
          onClick={goToApp}
          className="group bg-accent text-white px-7 py-3.5 rounded-xl text-base font-semibold cursor-pointer hover:brightness-110 transition-all duration-200 inline-flex items-center gap-2"
        >
          {en.landing.ctaButton}
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div>© {new Date().getFullYear()} {en.app.titleShort} · {en.landing.footerTagline}</div>
          <div className="flex items-center gap-5">
            <a href="/about" className="hover:text-text transition-colors">{en.landing.footerAbout}</a>
            <a href="/privacy" className="hover:text-text transition-colors">{en.landing.footerPrivacy}</a>
            <a href="/terms" className="hover:text-text transition-colors">{en.landing.footerTerms}</a>
          </div>
        </div>
      </footer>

      {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} />}
    </div>
  )
}
