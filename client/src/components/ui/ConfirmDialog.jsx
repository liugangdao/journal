import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function ConfirmDialog({ open, title, message, confirmText = '确认删除', onConfirm, onCancel }) {
  const [closing, setClosing] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setVisible(true)
      setClosing(false)
    } else if (visible) {
      setClosing(true)
      const timer = setTimeout(() => {
        setClosing(false)
        setVisible(false)
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!open && !visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className={`absolute inset-0 bg-black/50 ${closing ? 'animate-fade-out-overlay' : 'animate-fade-in-overlay'}`}
        onClick={onCancel} />
      <div className={`relative bg-card border border-border rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl
        ${closing ? 'animate-dialog-out' : 'animate-dialog-in'}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-red/15 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red" />
          </div>
          <h3 className="text-base font-bold text-text">{title}</h3>
        </div>
        <p className="text-sm text-muted mb-5 ml-[52px]">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="text-muted border border-border px-4 py-2 rounded-lg text-sm cursor-pointer
              hover:text-text hover:border-muted transition-all duration-200">
            取消
          </button>
          <button onClick={onConfirm}
            className="bg-red text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer
              hover:brightness-110 transition-all duration-200">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
