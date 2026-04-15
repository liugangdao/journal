import { useState } from 'react'
import Input from './ui/Input'
import Select from './ui/Select'
import { DIRECTIONS, STRATEGIES, TIMEFRAMES, SCORES, EMOTIONS, PHASE_LABELS } from '../lib/constants'
import { enrichTrade } from '../lib/enrichTrade'
import { en } from '../i18n/en'
import LivermoreQuote from './LivermoreQuote'

const now = () => {
  const d = new Date()
  return `${d.toISOString().split('T')[0]}T${d.toTimeString().slice(0, 5)}`
}

export function emptyTrade(pairs) {
  const pairList = pairs && pairs.length > 0 ? pairs : []
  return {
    open_time: now(), close_time: "", pair: pairList[0] || "", direction: "long",
    strategy: "trend", timeframe: "H4", lots: "", entry: "", stop: "", target: "",
    exit_price: "", gross_pnl: "", swap: "0", score: "B", emotion: "calm", notes: "",
    status: "closed", risk_amount: "", asset_class: "forex"
  }
}

export default function TradeForm({ initial, editing, mode = "edit", pairs, pairsByName, policies, initialViolations = [], onSubmit, onCancel }) {
  const pairOptions = pairs && pairs.length > 0 ? pairs : []
  const [form, setForm] = useState(initial || emptyTrade(pairOptions))
  const [error, setError] = useState("")
  const [openOnly, setOpenOnly] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Track confirmed (checked) policies — unchecked = violation.
  // Uses external_id (stable across LocalStore and ApiStore) as the identifier.
  // Edit mode: pre-check policies that were NOT violated.
  // New/close mode: pre-check everything (user unchecks rules they violated).
  const [confirmedPolicies, setConfirmedPolicies] = useState(() => {
    const active = (policies || []).filter(p =>
      mode === "edit"
        ? p.is_active || initialViolations.includes(p.external_id)
        : p.is_active
    )
    if (mode === "edit") {
      return active.filter(p => !initialViolations.includes(p.external_id)).map(p => p.external_id)
    }
    return active.map(p => p.external_id)
  })
  const uf = (k) => (v) => { setForm(f => ({ ...f, [k]: v })); setError("") }

  const isClose = mode === "close"
  const isNew = mode === "new"
  const isEdit = mode === "edit"

  // Filter policies by phase for violation checker
  const filteredPolicies = (policies || []).filter(p => {
    if (isEdit) return p.is_active || initialViolations.includes(p.id)
    if (!p.is_active) return false
    if (isClose) return p.phase === 'exit' || p.phase === 'both'
    return p.phase === 'entry' || p.phase === 'both' // new/open mode
  })

  const hideExit = isNew && openOnly

  const REQUIRED_CLOSE = ["exit_price", "gross_pnl"]
  const REQUIRED_FULL = ["entry", "stop", "exit_price", "gross_pnl"]
  const REQUIRED_OPEN_ONLY = ["entry", "stop"]

  const requiredFields = isClose ? REQUIRED_CLOSE : hideExit ? REQUIRED_OPEN_ONLY : REQUIRED_FULL

  // Fields that need to be coerced from string → number before persisting.
  // Blank strings become null so enrichTrade/calcTrade see real numbers.
  const NUMERIC_FIELDS = ["lots", "entry", "stop", "target", "exit_price", "gross_pnl", "swap", "risk_amount", "quantity"]
  function coerceNumeric(obj) {
    const out = { ...obj }
    for (const k of NUMERIC_FIELDS) {
      const v = out[k]
      if (v === '' || v === undefined) {
        out[k] = null
      } else if (typeof v === 'string') {
        const n = parseFloat(v)
        out[k] = Number.isFinite(n) ? n : null
      }
    }
    return out
  }

  const handleSubmit = async () => {
    const missing = requiredFields.filter(k => !form[k] && form[k] !== 0)
    if (missing.length) {
      setError(en.trade.requiredFieldsError)
      return
    }
    const payload = coerceNumeric(form)
    if (hideExit) payload.status = "open"
    if (isClose) payload.status = "closed"
    if (isClose && !payload.close_time) payload.close_time = now()
    // Unchecked policies = violations
    payload.violations = filteredPolicies
      .filter(p => !confirmedPolicies.includes(p.external_id))
      .map(p => p.external_id)
    setSubmitting(true)
    try {
      await onSubmit(payload)
    } finally {
      setSubmitting(false)
    }
  }

  const pair = pairsByName?.get?.(form.pair)
  const showPreview = !hideExit && form.entry && form.stop && form.exit_price && form.gross_pnl && pair
  const preview = showPreview
    ? enrichTrade(
        {
          ...form,
          entry: parseFloat(form.entry) || 0,
          stop: parseFloat(form.stop) || 0,
          exit_price: parseFloat(form.exit_price) || 0,
          lots: parseFloat(form.lots) || 0,
          gross_pnl: parseFloat(form.gross_pnl) || 0,
          swap: parseFloat(form.swap) || 0,
          asset_class: pair.asset_class,
        },
        pair,
      )
    : null

  const title = isClose ? en.trade.closeTitle : editing ? en.trade.editTitle : en.trade.recordTitle
  const submitText = isClose
    ? en.trade.submitText.close
    : editing
      ? en.trade.submitText.edit
      : hideExit
        ? en.trade.submitText.open
        : en.trade.submitText.new

  const isRequired = (field) => error && requiredFields.includes(field) && !form[field]

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-6">
      <h3 className="text-base font-bold mb-5">{title}</h3>
      {!isEdit && <LivermoreQuote />}

      {/* Close mode: read-only summary of open position */}
      {isClose && (
        <div className="mb-5 p-4 bg-bg rounded-xl border border-border">
          <div className="text-[11px] text-muted mb-2 font-medium">{en.trade.openInfo}</div>
          <div className="flex gap-2 sm:gap-5 flex-wrap text-sm">
            <span><span className="text-muted">{en.trade.pair}:</span> <b>{form.pair}</b></span>
            <span><span className="text-muted">{en.trade.direction}:</span> <b>{form.direction === 'long' ? en.trade.long : en.trade.short}</b></span>
            <span><span className="text-muted">{en.trade.entryPrice}:</span> <b>{form.entry}</b></span>
            <span><span className="text-muted">{en.trade.stopPrice}:</span> <b>{form.stop}</b></span>
            {form.target && <span><span className="text-muted">{en.trade.targetPrice}:</span> <b>{form.target}</b></span>}
            {form.lots && <span><span className="text-muted">{en.trade.lots}:</span> <b>{form.lots}</b></span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {/* Open and Edit mode fields */}
        {!isClose && (
          <>
            <Field label={en.trade.openTime}><Input type="datetime-local" value={form.open_time} onChange={uf("open_time")} /></Field>
            <Field label={en.trade.pair}><Select value={form.pair} onChange={uf("pair")} options={pairOptions} /></Field>
            <Field label={en.trade.direction}><Select value={form.direction} onChange={uf("direction")} options={DIRECTIONS} /></Field>
            <Field label={en.trade.strategy}><Select value={form.strategy} onChange={uf("strategy")} options={STRATEGIES} /></Field>
            <Field label={en.trade.timeframe}><Select value={form.timeframe} onChange={uf("timeframe")} options={TIMEFRAMES} /></Field>
            <Field label={en.trade.lots}><Input value={form.lots} onChange={uf("lots")} placeholder={en.trade.placeholderLots} /></Field>
            <Field label={`${en.trade.entryPrice} *`} required={isRequired("entry")}><Input value={form.entry} onChange={uf("entry")} placeholder={en.trade.placeholderEntry} /></Field>
            <Field label={`${en.trade.stopPrice} *`} required={isRequired("stop")}><Input value={form.stop} onChange={uf("stop")} placeholder={en.trade.placeholderStop} /></Field>
            <Field label={en.trade.targetPrice}><Input value={form.target} onChange={uf("target")} placeholder={en.trade.placeholderOptional} /></Field>
            {hideExit && (
              <Field label={en.trade.riskAmountLabel}><Input value={form.risk_amount} onChange={uf("risk_amount")} placeholder={en.trade.placeholderRisk} /></Field>
            )}
          </>
        )}

        {/* Exit fields: hidden in open-only mode */}
        {!hideExit && (
          <>
            <Field label={`${en.trade.exitPrice} *`} required={isRequired("exit_price")}><Input value={form.exit_price} onChange={uf("exit_price")} placeholder={en.trade.placeholderExit} /></Field>
            <Field label={en.trade.closeTime}><Input type="datetime-local" value={form.close_time || now()} onChange={uf("close_time")} /></Field>
            <Field label={`${en.trade.pnlUsd} *`} required={isRequired("gross_pnl")}><Input value={form.gross_pnl} onChange={uf("gross_pnl")} placeholder={en.trade.placeholderPnl} /></Field>
            <Field label={en.trade.swapFee}><Input value={form.swap} onChange={uf("swap")} placeholder="0" /></Field>
            <Field label={en.trade.score}><Select value={form.score} onChange={uf("score")} options={SCORES} /></Field>
          </>
        )}

        {/* Emotion: shown in all modes */}
        <Field label={en.trade.tradeEmotion}><Select value={form.emotion} onChange={uf("emotion")} options={EMOTIONS} /></Field>
      </div>

      <div className="mt-4">
        <div className="text-[11px] text-muted mb-1">{en.trade.tradingNotes}</div>
        <textarea
          value={form.notes}
          onChange={e => uf("notes")(e.target.value)}
          placeholder={hideExit ? en.trade.notesPlaceholderOpen : isClose ? en.trade.notesPlaceholderClose : en.trade.notesPlaceholderFull}
          className="w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y outline-none
            focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 font-sans"
        />
      </div>

      {/* Rule confirmation — all modes, unchecked = violation */}
      {filteredPolicies.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] text-muted font-medium mb-2">
            {isClose ? en.trade.exitDiscipline : isEdit ? en.trade.editDiscipline : en.trade.entryDiscipline}
          </div>
          <div className="p-3 bg-bg rounded-lg border border-border space-y-3">
            {['rules', 'strategy', 'risk'].map(cat => {
              const catPolicies = filteredPolicies.filter(p => p.category === cat)
              if (catPolicies.length === 0) return null
              const catLabel = en.policy.categories[cat] || cat
              return (
                <div key={cat}>
                  <div className="text-[11px] text-muted font-medium mb-1">{catLabel}</div>
                  {catPolicies.map(p => (
                    <label key={p.external_id} className={`flex items-center gap-2 py-0.5 cursor-pointer ${
                      !confirmedPolicies.includes(p.external_id) ? 'text-red/80' : ''
                    }`}>
                      <input
                        type="checkbox"
                        checked={confirmedPolicies.includes(p.external_id)}
                        onChange={e => {
                          setConfirmedPolicies(prev =>
                            e.target.checked ? [...prev, p.external_id] : prev.filter(id => id !== p.external_id)
                          )
                        }}
                        className="accent-green"
                      />
                      <span className="text-sm">{p.title}</span>
                      {isEdit && p.phase !== 'both' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          p.phase === 'entry' ? 'bg-accent/15 text-accent' : 'bg-amber-500/15 text-amber-500'
                        }`}>{PHASE_LABELS[p.phase]}</span>
                      )}
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Auto-calc preview */}
      {preview && (
        <div className="mt-4 p-3 bg-bg rounded-lg flex gap-2 sm:gap-5 flex-wrap text-xs font-mono">
          <span className="text-muted">{en.trade.autoCalc}:</span>
          {preview.pips != null && (
            <span>{en.trade.pnlPips}: <b className={preview.pips >= 0 ? 'text-green' : 'text-red'}>{preview.pips.toFixed(2)}</b></span>
          )}
          {preview.rMultiple != null && (
            <span>{en.trade.rMultiple}: <b className={preview.rMultiple >= 0 ? 'text-green' : 'text-red'}>{preview.rMultiple.toFixed(2)}R</b></span>
          )}
          <span>{en.trade.spread}: <b>${preview.spread.toFixed(2)}</b></span>
          <span>{en.trade.netPnl}: <b className={preview.netPnl >= 0 ? 'text-green' : 'text-red'}>${preview.netPnl.toFixed(2)}</b></span>
        </div>
      )}

      {/* Open-only toggle: only in new trade mode */}
      {isNew && (
        <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
          <button
            type="button"
            role="switch"
            aria-checked={openOnly}
            onClick={() => setOpenOnly(v => !v)}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${openOnly ? 'bg-accent' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${openOnly ? 'translate-x-4' : ''}`} />
          </button>
          <span className="text-sm text-muted">{en.trade.openOnly}</span>
        </label>
      )}

      {error && (
        <div className="mt-3 text-red text-sm font-medium">{error}</div>
      )}

      <div className="flex gap-3 mt-5">
        <button onClick={handleSubmit} disabled={submitting}
          className={`text-white px-7 py-2.5 rounded-lg text-sm font-semibold
            transition-all duration-200
            ${submitting ? 'bg-muted cursor-not-allowed' : 'bg-green cursor-pointer hover:brightness-110'}`}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {en.trade.submitting}
            </span>
          ) : submitText}
        </button>
        <button onClick={onCancel}
          className="text-muted border border-border px-5 py-2.5 rounded-lg text-sm cursor-pointer
            hover:text-text hover:border-muted transition-all duration-200">
          {en.common.cancel}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children, required }) {
  return (
    <div>
      <div className={`text-[11px] mb-1 ${required ? 'text-red font-semibold' : 'text-muted'}`}>{label}</div>
      {children}
    </div>
  )
}
