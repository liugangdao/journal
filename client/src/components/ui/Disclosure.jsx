import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function Disclosure({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 sm:px-5 py-3 cursor-pointer hover:bg-hover transition-colors"
      >
        <h4 className="text-sm font-bold">{title}</h4>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 sm:px-5 pb-3 sm:pb-5">
          {children}
        </div>
      )}
    </div>
  )
}
