import { Sun, Moon } from 'lucide-react'
import Tab from './ui/Tab'
import MobileLayout from './MobileLayout'
import { en } from '../i18n/en'

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg text-muted hover:text-text hover:bg-hover transition-all duration-200 cursor-pointer"
      title={theme === 'dark' ? en.more.themeLight : en.more.themeDark}
    >
      {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
    </button>
  )
}

export default function Layout({
  tab, setTab, tradeCount, openCount, theme, onToggleTheme, user, signInSlot, onLogout, children,
  // Mobile-specific props
  showForm, formMode, formInitial, onNewTrade, onFormSubmit, onFormCancel,
  pairs, pairsByName, policies, editViolations, editing, closingId,
  // Mobile tab content
  mobileTabContent,
  // Global overlays rendered outside responsive containers
  overlays,
}) {
  return (
    <>
      {/* Mobile layout — hidden on sm+ */}
      <div className="block sm:hidden">
        <MobileLayout
          tab={tab} setTab={setTab}
          showForm={showForm} formMode={formMode} formInitial={formInitial}
          onNewTrade={onNewTrade} onFormSubmit={onFormSubmit} onFormCancel={onFormCancel}
          pairs={pairs} pairsByName={pairsByName} policies={policies} editViolations={editViolations}
          editing={editing} closingId={closingId}
        >
          {mobileTabContent}
        </MobileLayout>
      </div>

      {/* Desktop layout — hidden on mobile */}
      <div className="hidden sm:block">
        <div className="min-h-screen bg-bg text-text font-sans">
          {/* Fixed Header */}
          <header className="sticky top-0 z-50 backdrop-blur-xl bg-header-bg border-b border-border">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">{en.app.titleShort}</h1>
                <p className="text-[10px] sm:text-xs text-muted mt-0.5">
                  {en.app.tagline} &nbsp;|&nbsp; {tradeCount} {en.app.closedCount}{openCount > 0 && <> &middot; {openCount} {en.app.openCount}</>}
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex gap-1 bg-card/80 rounded-xl p-1 overflow-x-auto">
                  <Tab active={tab === "stats"} onClick={() => setTab("stats")}>{en.tabs.stats}</Tab>
                  <Tab active={tab === "record"} onClick={() => setTab("record")}>{en.tabs.record}</Tab>
                  <Tab active={tab === "weekly"} onClick={() => setTab("weekly")}>{en.tabs.weekly}</Tab>
                  <Tab active={tab === "monthly"} onClick={() => setTab("monthly")}>{en.tabs.monthly}</Tab>
                  <Tab active={tab === "policy"} onClick={() => setTab("policy")}>{en.tabs.policy}</Tab>
                  <Tab active={tab === "settings"} onClick={() => setTab("settings")}>{en.tabs.settings}</Tab>
                </div>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                {signInSlot}
                {user && (
                  <div className="flex items-center gap-2 ml-1">
                    <span className="text-xs text-muted hidden sm:inline">{user.email || user.display_name || user.username}</span>
                    <button
                      onClick={onLogout}
                      className="text-xs text-muted hover:text-red transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-hover"
                    >
                      {en.app.signOut}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
            {children}
          </main>
        </div>
      </div>

      {/* Global overlays — must be outside responsive containers so they're visible on all screen sizes */}
      {overlays}
    </>
  )
}
