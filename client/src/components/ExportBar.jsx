import { useState, useRef } from 'react'
import { en } from '../i18n/en'

function triggerDownload(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const ts = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `journal-export-${ts}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportBar({ storeAdapter, onImported }) {
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState(false)
  const fileRef = useRef(null)

  const handleExport = async () => {
    setExporting(true)
    setMsg('')
    setErr(false)
    try {
      const payload = await storeAdapter.exportAll()
      triggerDownload(payload)
    } catch (e) {
      setErr(true)
      setMsg(e.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setMsg('')
    setErr(false)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await storeAdapter.importAll(data)
      setMsg(
        `${en.export.imported}: ${result.trades} trades, ${result.weekly_notes} weekly, ${result.monthly_notes} monthly, ${result.policies} policies, ${result.pairs} pairs`
      )
      if (onImported) onImported()
    } catch (e2) {
      setErr(true)
      setMsg(`${en.export.importFailed}: ${e2.message}`)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-muted border border-border
            hover:text-text hover:border-accent/50 transition-all duration-200 cursor-pointer
            disabled:opacity-50 disabled:pointer-events-none"
        >
          {exporting ? '…' : en.export.export}
        </button>
        <label
          className={`px-4 py-1.5 rounded-lg text-xs font-medium text-muted border border-border
            hover:text-text hover:border-accent/50 transition-all duration-200 cursor-pointer
            ${importing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {importing ? en.export.importing : en.export.import}
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleImport} className="hidden" />
        </label>
      </div>
      {msg && (
        <p className={`text-xs ${err ? 'text-red' : 'text-green'}`}>{msg}</p>
      )}
    </div>
  )
}
