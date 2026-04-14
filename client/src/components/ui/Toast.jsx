import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)
let toastId = 0

const config = {
  success: { icon: CheckCircle, bg: 'bg-green/15 text-green border-green/30' },
  error: { icon: XCircle, bg: 'bg-red/15 text-red border-red/30' },
  info: { icon: Info, bg: 'bg-accent/15 text-accent border-accent/30' },
}

function ToastItem({ toast, onDismiss }) {
  const { icon: Icon, bg } = config[toast.type] || config.info

  return (
    <div className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg
      ${bg} ${toast.exiting ? 'animate-toast-out' : 'animate-toast-in'}`}>
      <Icon size={18} className="shrink-0" />
      <span className="text-sm font-medium">{toast.message}</span>
      <button onClick={onDismiss} className="ml-2 shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef({})

  const remove = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200)
  }, [])

  const add = useCallback((type, message) => {
    const id = ++toastId
    setToasts(prev => [{ id, type, message, exiting: false }, ...prev])
    timersRef.current[id] = setTimeout(() => {
      remove(id)
      delete timersRef.current[id]
    }, 3000)
    return id
  }, [remove])

  const toastRef = useRef(null)
  if (!toastRef.current) {
    toastRef.current = { success: () => {}, error: () => {}, info: () => {} }
  }
  toastRef.current.success = (msg) => add('success', msg)
  toastRef.current.error = (msg) => add('error', msg)
  toastRef.current.info = (msg) => add('info', msg)

  return (
    <ToastContext.Provider value={toastRef.current}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
