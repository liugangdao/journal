import { useState, useRef } from 'react'
import { api } from '../hooks/useApi'
import { en } from '../i18n/en'

export default function ExportBar({ onImported }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importErr, setImportErr] = useState(false)
  const fileRef = useRef(null)

  const handleExport = () => {
    api.exportData(from || undefined, to || undefined)
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportMsg('')
    setImportErr(false)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await api.importData(data)
      const r = result.imported
      setImportMsg(`${en.export.imported}: ${r.trades} trades, ${r.weeklyNotes} weekly, ${r.monthlyNotes} monthly`)
      if (onImported) onImported()
    } catch (err) {
      setImportErr(true)
      setImportMsg(`${en.export.importFailed}: ${err.message}`)
    } finally {
      setImporting(false)
      fileRef.current.value = ''
    }
  }

  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-end gap-2 sm:gap-3 flex-wrap">
        <div>
          <div className="text-[11px] text-muted mb-1">{en.filter.from}</div>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-input text-text border border-border rounded-lg px-3 py-1.5 text-xs outline-none
              focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200"
          />
        </div>
        <div>
          <div className="text-[11px] text-muted mb-1">{en.filter.to}</div>
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
          {en.export.export}
        </button>
        <label
          className={`px-4 py-1.5 rounded-lg text-xs font-medium text-muted border border-border
            hover:text-text hover:border-accent/50 transition-all duration-200 cursor-pointer
            ${importing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {importing ? en.export.importing : en.export.import}
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </label>
        {(from || to) && (
          <button
            onClick={() => { setFrom(''); setTo('') }}
            className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-text transition-colors cursor-pointer"
          >
            {en.filter.clear}
          </button>
        )}
      </div>
      {importMsg && (
        <p className={`text-xs ${importErr ? 'text-red' : 'text-green'}`}>
          {importMsg}
        </p>
      )}
    </div>
  )
}
