import { FileText, BarChart3, PenLine, Settings, Plus } from 'lucide-react'
import MobileSheet from './MobileSheet'
import TradeForm from './TradeForm'
import { en } from '../i18n/en'

const TABS = [
  { key: 'record', label: en.tabs.record, title: en.tabs.record, icon: <FileText size={22} strokeWidth={1.8} /> },
  { key: 'stats', label: en.tabs.stats, title: en.tabs.stats, icon: <BarChart3 size={22} strokeWidth={1.8} /> },
  { key: 'add', label: '', title: '', icon: null },
  { key: 'notes', label: en.tabs.notes, title: en.tabs.notes, icon: <PenLine size={22} strokeWidth={1.8} /> },
  { key: 'more', label: en.tabs.more, title: en.tabs.more, icon: <Settings size={22} strokeWidth={1.8} /> },
]

export default function MobileLayout({
  tab, setTab, children,
  // Sheet props
  showForm, formMode, formInitial, onNewTrade, onFormSubmit, onFormCancel,
  pairs, pairsByName, policies, editViolations, editing, closingId,
}) {
  const sheetTitle = formMode === 'close' ? en.trade.closeTitle : formMode === 'edit' ? en.trade.editTitle : en.trade.recordTitle
  const headerTitle = TABS.find(t => t.key === tab)?.title || en.app.titleShort

  const handleTabPress = (key) => {
    if (key === 'add') {
      onNewTrade()
      return
    }
    try { navigator.vibrate?.(10) } catch {}
    setTab(key)
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border px-4 py-3 text-center"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
        <h1 className="text-[15px] font-semibold">{headerTitle}</h1>
      </header>

      {/* Content area — padded for fixed header and tab bar */}
      <main className="px-3 py-3"
        style={{
          marginTop: 'calc(env(safe-area-inset-top, 0px) + 52px)',
          marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)',
        }}>
        <div key={tab} className="mobile-tab-enter">
          {children}
        </div>
      </main>

      {/* Bottom tab bar — fixed */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-end justify-around px-2 pt-1.5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        {TABS.map(t => (
          t.key === 'add' ? (
            <button
              key="add"
              onClick={() => handleTabPress('add')}
              className="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-accent text-white shadow-lg shadow-accent/30
                active:scale-95 transition-transform duration-100"
            >
              <Plus size={24} strokeWidth={2.5} />
            </button>
          ) : (
            <button
              key={t.key}
              onClick={() => handleTabPress(t.key)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 min-w-[52px]
                active:scale-95 active:opacity-70 transition-all duration-100
                ${tab === t.key ? 'text-accent' : 'text-muted'}`}
            >
              {t.icon}
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          )
        ))}
      </nav>

      {/* Trade form sheet */}
      <MobileSheet open={showForm} onClose={onFormCancel} title={sheetTitle}>
        {showForm && (
          <div className="p-4">
            <TradeForm
              key={editing || closingId || 'new'}
              initial={formInitial}
              editing={!!editing}
              mode={formMode}
              pairs={pairs}
              pairsByName={pairsByName}
              policies={policies}
              initialViolations={editing ? editViolations : []}
              onSubmit={onFormSubmit}
              onCancel={onFormCancel}
              mobile
            />
          </div>
        )}
      </MobileSheet>
    </div>
  )
}
