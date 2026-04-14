import Policies from './Policies'
import Settings from './Settings'
import ExportBar from './ExportBar'
import { useTelegram } from '../hooks/useTelegram'

export default function MoreTab({ pairs, onPairsChange, onImported, theme, onToggleTheme, user, onLogout }) {
  const isTelegram = useTelegram()
  return (
    <div className="space-y-6">
      {/* User info + theme */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">{user?.display_name || user?.username}</div>
            {!isTelegram && user?.email && (
              <div className="text-xs text-muted">{user.email}</div>
            )}
          </div>
          {!isTelegram && (
            <button
              onClick={onLogout}
              className="text-xs text-red px-3 py-1.5 rounded-lg border border-border
                active:scale-[0.97] active:opacity-80 transition-all duration-100"
            >
              退出登录
            </button>
          )}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-sm">深色模式</span>
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
        <h3 className="text-sm font-bold mb-3">数据管理</h3>
        <ExportBar onImported={onImported} />
      </div>

      {/* Policies */}
      <div>
        <Policies />
      </div>

      {/* Pair settings */}
      <div>
        <Settings pairs={pairs} onPairsChange={onPairsChange} />
      </div>
    </div>
  )
}
