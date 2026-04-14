import { useState } from 'react'
import { tg } from '../hooks/useTelegram'
import { api } from '../hooks/useApi'

export default function UpgradeModal({ open, onClose, quota, onPaid }) {
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handlePurchase = async () => {
    if (!tg) return
    setLoading(true)
    try {
      const { link } = await api.createInvoice()
      tg.openInvoice(link, (status) => {
        setLoading(false)
        if (status === 'paid') {
          onPaid()
        }
      })
    } catch (err) {
      setLoading(false)
      console.error('Invoice creation failed:', err)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl mx-4 p-6 max-w-sm w-full shadow-2xl">
        <h2 className="text-lg font-bold mb-2">升级 Premium</h2>

        <div className="text-sm text-muted mb-4 space-y-1.5">
          <p>免费额度已用 <strong className="text-text font-mono">{quota?.used || 0}/{quota?.limit || 15}</strong> 笔</p>
          <p>Premium 会员享受：</p>
          <ul className="list-disc list-inside text-text space-y-0.5">
            <li>无限交易记录</li>
            <li>完整统计分析</li>
            <li>所有功能无限制</li>
          </ul>
        </div>

        <div className="text-center mb-4">
          <span className="text-2xl font-bold">250</span>
          <span className="text-sm text-muted ml-1">Stars / 月</span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium
              active:scale-[0.97] transition-transform"
          >
            以后再说
          </button>
          <button
            onClick={handlePurchase}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold
              active:scale-[0.97] transition-transform disabled:opacity-50"
          >
            {loading ? '处理中...' : '立即订阅'}
          </button>
        </div>
      </div>
    </div>
  )
}
