import { useState, useRef } from 'react'
import { api } from '../hooks/useApi'

export default function ExportBar({ onImported }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef(null)

  const handleExport = () => {
    api.exportData(from || undefined, to || undefined)
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportMsg('')
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await api.importData(data)
      const r = result.imported
      setImportMsg(`导入成功：${r.trades} 条交易、${r.weeklyNotes} 条周记、${r.monthlyNotes} 条月记`)
      if (onImported) onImported()
    } catch (err) {
      setImportMsg(`导入失败：${err.message}`)
    } finally {
      setImporting(false)
      fileRef.current.value = ''
    }
  }

  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-end gap-2 sm:gap-3 flex-wrap">
        <div>
          <div className="text-[11px] text-muted mb-1">起始日期</div>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-input text-text border border-border rounded-lg px-3 py-1.5 text-xs outline-none
              focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200"
          />
        </div>
        <div>
          <div className="text-[11px] text-muted mb-1">结束日期</div>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="bg-input text-text border border-border rounded-lg px-3 py-1.5 text-xs outline-none
              focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200"
          />
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-muted border border-border
            hover:text-text hover:border-accent/50 transition-all duration-200 cursor-pointer"
        >
          导出数据
        </button>
        <label
          className={`px-4 py-1.5 rounded-lg text-xs font-medium text-muted border border-border
            hover:text-text hover:border-accent/50 transition-all duration-200 cursor-pointer
            ${importing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {importing ? '导入中...' : '导入数据'}
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </label>
        {(from || to) && (
          <button
            onClick={() => { setFrom(''); setTo('') }}
            className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-text transition-colors cursor-pointer"
          >
            清除筛选
          </button>
        )}
      </div>
      {importMsg && (
        <p className={`text-xs ${importMsg.includes('失败') ? 'text-red' : 'text-green'}`}>
          {importMsg}
        </p>
      )}
    </div>
  )
}
