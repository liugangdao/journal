import Policies from './Policies'
import Settings from './Settings'
import ExportBar from './ExportBar'
import { useTelegram } from '../hooks/useTelegram'
import { en } from '../i18n/en'

export default function MoreTab({ pairs, onPairsChange, policies, setPolicies, storeAdapter, onImported, theme, onToggleTheme, user, onLogout }) {
  const isTelegram = useTelegram()
  return (
    <div className="space-y-6">
      {/* User info + theme */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">{user?.email || en.more.account}</div>
            {!isTelegram && user?.email && (
              <div className="text-xs text-muted">{user.email}</div>
            )}
          </div>
          {!isTelegram && user && (
            <button
              onClick={onLogout}
              className="text-xs text-red px-3 py-1.5 rounded-lg border border-border
                active:scale-[0.97] active:opacity-80 transition-all duration-100"
            >
              {en.more.logout}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-sm">{theme === 'dark' ? en.more.themeDark : en.more.themeLight}</span>
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            onClick={onToggleTheme}
            className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${theme === 'dark' ? 'bg-accent' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-200 ${theme === 'dark' ? 'translate-x-[18px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Export/Import */}
      <div>
        <h3 className="text-sm font-bold mb-3">{en.export.title}</h3>
        <ExportBar onImported={onImported} />
      </div>

      {/* Policies */}
      <div>
        <Policies policies={policies} setPolicies={setPolicies} storeAdapter={storeAdapter} />
      </div>

      {/* Pair settings */}
      <div>
        <Settings pairs={pairs} onPairsChange={onPairsChange} storeAdapter={storeAdapter} />
      </div>
    </div>
  )
}
