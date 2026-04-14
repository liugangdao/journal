import { useState, useEffect } from 'react'
import { tg } from '../hooks/useTelegram'

export default function MobileSheet({ open, onClose, title, children }) {
  const [closing, setClosing] = useState(false)
  const [visible, setVisible] = useState(false)

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 640

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      setVisible(false)
      document.body.style.overflow = ''
      onClose()
    }, 250)
  }

  useEffect(() => {
    if (open) {
      setVisible(true)
      setClosing(false)
      if (isMobile()) document.body.style.overflow = 'hidden'
      if (tg) {
        tg.BackButton.show()
        tg.BackButton.onClick(handleClose)
      }
    } else if (visible) {
      // open changed to false externally (e.g. form submitted) — trigger close animation
      setClosing(true)
      const timer = setTimeout(() => {
        setClosing(false)
        setVisible(false)
        document.body.style.overflow = ''
      }, 250)
      if (tg) {
        tg.BackButton.hide()
        tg.BackButton.offClick(handleClose)
      }
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ''
      if (tg) {
        tg.BackButton.hide()
        tg.BackButton.offClick(handleClose)
      }
    }
  }, [open])

  if (!open && !visible) return null

  return (
    <div className="fixed inset-0 z-[90] sm:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 ${closing ? 'animate-fade-out-overlay' : 'animate-fade-in-overlay'}`}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div className={`absolute inset-0 bg-bg flex flex-col ${closing ? 'animate-sheet-down' : 'animate-sheet-up'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
          <button
            onClick={handleClose}
            className="text-accent text-sm font-medium min-w-[60px] text-left active:opacity-70"
          >
            取消
          </button>
          <span className="text-text text-[15px] font-semibold">{title}</span>
          <div className="min-w-[60px]" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
