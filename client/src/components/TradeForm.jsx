import { useState } from 'react'
import Input from './ui/Input'
import Select from './ui/Select'
import { PAIRS as DEFAULT_PAIRS, DIRECTIONS, STRATEGIES, TIMEFRAMES, SCORES, EMOTIONS, PHASE_LABELS } from '../lib/constants'
import { calcTrade } from '../lib/calc'
import LivermoreQuote from './LivermoreQuote'

const now = () => {
  const d = new Date()
  return `${d.toISOString().split('T')[0]}T${d.toTimeString().slice(0, 5)}`
}

export function emptyTrade(pairs) {
  const pairList = pairs && pairs.length > 0 ? pairs : DEFAULT_PAIRS
  return {
    open_time: now(), close_time: "", pair: pairList[0], direction: "多(Buy)",
    strategy: "趋势跟踪", timeframe: "H4", lots: "", entry: "", stop: "", target: "",
    exit_price: "", gross_pnl: "", swap: "0", score: "B-基本执行", emotion: "冷静理性", notes: "",
    status: "closed", risk_amount: ""
  }
}

export default function TradeForm({ initial, editing, mode = "edit", pairs, policies, initialViolations = [], onSubmit, onCancel }) {
  const pairOptions = pairs && pairs.length > 0 ? pairs : DEFAULT_PAIRS
  const [form, setForm] = useState(initial || emptyTrade())
  const [error, setError] = useState("")
  const [openOnly, setOpenOnly] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Track confirmed (checked) policies — unchecked = violation
  // In edit mode, pre-check policies that were NOT violated
  const [confirmedPolicies, setConfirmedPolicies] = useState(() => {
    if (mode === "edit") {
      const filtered = (policies || []).filter(p => p.is_active || initialViolations.includes(p.id))
      return filtered.filter(p => !initialViolations.includes(p.id)).map(p => p.id)
    }
    return []
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

  const handleSubmit = async () => {
    const missing = requiredFields.filter(k => !form[k] && form[k] !== 0)
    if (missing.length) {
      setError("请填写所有必填字段（带 * 的项）")
      return
    }
    const payload = { ...form }
    if (hideExit) payload.status = "open"
    if (isClose) payload.status = "closed"
    if (isClose && !payload.close_time) payload.close_time = now()
    // Unchecked policies = violations
    payload.violations = filteredPolicies
      .filter(p => !confirmedPolicies.includes(p.id))
      .map(p => p.id)
    setSubmitting(true)
    try {
      await onSubmit(payload)
    } finally {
      setSubmitting(false)
    }
  }

  const showPreview = !hideExit && form.entry && form.stop && form.exit_price && form.gross_pnl
  const preview = showPreview ? calcTrade(form) : null

  const title = isClose ? "平仓记录" : editing ? "编辑交易" : "记录交易"
  const submitText = isClose ? "确认平仓" : editing ? "保存修改" : hideExit ? "记录开仓" : "记录交易"

  const isRequired = (field) => error && requiredFields.includes(field) && !form[field]

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-6">
      <h3 className="text-base font-bold mb-5">{title}</h3>
      {!isEdit && <LivermoreQuote />}

      {/* Close mode: read-only summary of open position */}
      {isClose && (
        <div className="mb-5 p-4 bg-bg rounded-xl border border-border">
          <div className="text-[11px] text-muted mb-2 font-medium">开仓信息</div>
          <div className="flex gap-2 sm:gap-5 flex-wrap text-sm">
            <span><span className="text-muted">品种:</span> <b>{form.pair}</b></span>
            <span><span className="text-muted">方向:</span> <b>{form.direction}</b></span>
            <span><span className="text-muted">入场价:</span> <b>{form.entry}</b></span>
            <span><span className="text-muted">止损价:</span> <b>{form.stop}</b></span>
            {form.target && <span><span className="text-muted">目标价:</span> <b>{form.target}</b></span>}
            {form.lots && <span><span className="text-muted">手数:</span> <b>{form.lots}</b></span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {/* Open and Edit mode fields */}
        {!isClose && (
          <>
            <Field label="开仓时间"><Input type="datetime-local" value={form.open_time} onChange={uf("open_time")} /></Field>
            <Field label="品种"><Select value={form.pair} onChange={uf("pair")} options={pairOptions} /></Field>
            <Field label="方向"><Select value={form.direction} onChange={uf("direction")} options={DIRECTIONS} /></Field>
            <Field label="策略"><Select value={form.strategy} onChange={uf("strategy")} options={STRATEGIES} /></Field>
            <Field label="周期"><Select value={form.timeframe} onChange={uf("timeframe")} options={TIMEFRAMES} /></Field>
            <Field label="手数"><Input value={form.lots} onChange={uf("lots")} placeholder="0.1" /></Field>
            <Field label="入场价 *" required={isRequired("entry")}><Input value={form.entry} onChange={uf("entry")} placeholder="1.03250" /></Field>
            <Field label="止损价 *" required={isRequired("stop")}><Input value={form.stop} onChange={uf("stop")} placeholder="1.02950" /></Field>
            <Field label="目标价"><Input value={form.target} onChange={uf("target")} placeholder="选填" /></Field>
            {hideExit && (
              <Field label="本单风险($)"><Input value={form.risk_amount} onChange={uf("risk_amount")} placeholder="如: 150" /></Field>
            )}
          </>
        )}

        {/* Exit fields: hidden in open-only mode */}
        {!hideExit && (
          <>
            <Field label="出场价 *" required={isRequired("exit_price")}><Input value={form.exit_price} onChange={uf("exit_price")} placeholder="1.03720" /></Field>
            <Field label="平仓时间"><Input type="datetime-local" value={form.close_time || now()} onChange={uf("close_time")} /></Field>
            <Field label="盈亏 (USD) *" required={isRequired("gross_pnl")}><Input value={form.gross_pnl} onChange={uf("gross_pnl")} placeholder="235" /></Field>
            <Field label="库存费"><Input value={form.swap} onChange={uf("swap")} placeholder="0" /></Field>
            <Field label="执行评分"><Select value={form.score} onChange={uf("score")} options={SCORES} /></Field>
          </>
        )}

        {/* Emotion: shown in all modes */}
        <Field label="交易情绪"><Select value={form.emotion} onChange={uf("emotion")} options={EMOTIONS} /></Field>
      </div>

      <div className="mt-4">
        <div className="text-[11px] text-muted mb-1">交易笔记</div>
        <textarea
          value={form.notes}
          onChange={e => uf("notes")(e.target.value)}
          placeholder={hideExit ? "入场逻辑、交易计划..." : isClose ? "出场原因、复盘总结..." : "入场逻辑、仓位管理、出场原因..."}
          className="w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y outline-none
            focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 font-sans"
        />
      </div>

      {/* Rule confirmation — all modes, unchecked = violation */}
      {filteredPolicies.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] text-muted font-medium mb-2">
            {isClose ? '出场纪律确认' : isEdit ? '纪律确认' : '入场纪律确认'}
          </div>
          <div className="p-3 bg-bg rounded-lg border border-border space-y-3">
            {['rules', 'strategy', 'risk'].map(cat => {
              const catPolicies = filteredPolicies.filter(p => p.category === cat)
              if (catPolicies.length === 0) return null
              const catLabel = cat === 'rules' ? '交易规则' : cat === 'strategy' ? '策略指南' : '风控管理'
              return (
                <div key={cat}>
                  <div className="text-[11px] text-muted font-medium mb-1">{catLabel}</div>
                  {catPolicies.map(p => (
                    <label key={p.id} className={`flex items-center gap-2 py-0.5 cursor-pointer ${
                      !confirmedPolicies.includes(p.id) ? 'text-red/80' : ''
                    }`}>
                      <input
                        type="checkbox"
                        checked={confirmedPolicies.includes(p.id)}
                        onChange={e => {
                          setConfirmedPolicies(prev =>
                            e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
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
          <span className="text-muted">自动计算:</span>
          <span>止损点数: <b>{preview.stopPips.toFixed(5)}</b></span>
          <span>盈亏点数: <b className={preview.pnlPips >= 0 ? 'text-green' : 'text-red'}>{preview.pnlPips.toFixed(5)}</b></span>
          <span>R倍数: <b className={preview.rMultiple >= 0 ? 'text-green' : 'text-red'}>{preview.rMultiple}R</b></span>
          <span>点差: <b>${preview.spread}</b></span>
          <span>净盈亏: <b className={preview.netPnl >= 0 ? 'text-green' : 'text-red'}>${preview.netPnl}</b></span>
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
          <span className="text-sm text-muted">仅开仓（稍后平仓）</span>
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
              提交中...
            </span>
          ) : submitText}
        </button>
        <button onClick={onCancel}
          className="text-muted border border-border px-5 py-2.5 rounded-lg text-sm cursor-pointer
            hover:text-text hover:border-muted transition-all duration-200">
          取消
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
