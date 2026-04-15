import { Router } from 'express'
import db from '../db.js'

const router = Router()

const TRADE_COLS = [
  'user_id', 'external_id', 'open_time', 'close_time', 'pair', 'asset_class',
  'direction', 'strategy', 'timeframe', 'lots', 'quantity', 'entry', 'stop',
  'target', 'exit_price', 'gross_pnl', 'swap', 'risk_amount', 'score',
  'emotion', 'notes', 'status',
]

const PAIR_COLS = [
  'user_id', 'external_id', 'name', 'asset_class', 'contract_size',
  'price_precision', 'spread_cost', 'sort_order',
]

const POLICY_COLS = [
  'user_id', 'external_id', 'category', 'title', 'content', 'sort_order',
  'is_active', 'phase',
]

const WEEKLY_COLS = ['user_id', 'external_id', 'week', 'lesson', 'plan']
const MONTHLY_COLS = ['user_id', 'external_id', 'month', 'lesson', 'plan']

function buildInsert(table, cols) {
  const placeholders = cols.map(() => '?').join(', ')
  return db.prepare(
    `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
  )
}

function pickValues(cols, row, userId) {
  return cols.map((c) => {
    if (c === 'user_id') return userId
    const v = row[c]
    return v === undefined ? null : v
  })
}

router.post('/', (req, res) => {
  const userId = req.userId
  if (!userId) return res.status(401).json({ error: 'Not signed in' })

  const payload = req.body ?? {}
  const arrays = {
    trades: Array.isArray(payload.trades) ? payload.trades : [],
    weekly_notes: Array.isArray(payload.weekly_notes) ? payload.weekly_notes : [],
    monthly_notes: Array.isArray(payload.monthly_notes) ? payload.monthly_notes : [],
    policies: Array.isArray(payload.policies) ? payload.policies : [],
    pairs: Array.isArray(payload.pairs) ? payload.pairs : [],
    trade_violations: Array.isArray(payload.trade_violations) ? payload.trade_violations : [],
  }

  const totalRecords =
    arrays.trades.length +
    arrays.weekly_notes.length +
    arrays.monthly_notes.length +
    arrays.policies.length +
    arrays.pairs.length +
    arrays.trade_violations.length
  if (totalRecords > 10000) {
    return res.status(413).json({ error: 'Migration batch too large (max 10,000 records)' })
  }

  const insertTrade = buildInsert('trades', TRADE_COLS)
  const insertPair = buildInsert('pairs', PAIR_COLS)
  const insertPolicy = buildInsert('policies', POLICY_COLS)
  const insertWeekly = buildInsert('weekly_notes', WEEKLY_COLS)
  const insertMonthly = buildInsert('monthly_notes', MONTHLY_COLS)
  const insertViolation = db.prepare(`
    INSERT INTO trade_violations (trade_id, policy_id, notes)
    SELECT t.id, p.id, ?
    FROM trades t, policies p
    WHERE t.user_id = ? AND t.external_id = ?
      AND p.user_id = ? AND p.external_id = ?
  `)

  const counts = {
    trades: 0,
    weekly_notes: 0,
    monthly_notes: 0,
    policies: 0,
    pairs: 0,
    trade_violations: 0,
  }

  const run = db.transaction(() => {
    for (const row of arrays.trades) {
      const info = insertTrade.run(...pickValues(TRADE_COLS, row, userId))
      counts.trades += info.changes
    }
    for (const row of arrays.pairs) {
      const info = insertPair.run(...pickValues(PAIR_COLS, row, userId))
      counts.pairs += info.changes
    }
    for (const row of arrays.policies) {
      const info = insertPolicy.run(...pickValues(POLICY_COLS, row, userId))
      counts.policies += info.changes
    }
    for (const row of arrays.weekly_notes) {
      const info = insertWeekly.run(...pickValues(WEEKLY_COLS, row, userId))
      counts.weekly_notes += info.changes
    }
    for (const row of arrays.monthly_notes) {
      const info = insertMonthly.run(...pickValues(MONTHLY_COLS, row, userId))
      counts.monthly_notes += info.changes
    }
    for (const v of arrays.trade_violations) {
      const info = insertViolation.run(
        v.notes ?? null,
        userId,
        v.trade_external_id,
        userId,
        v.policy_external_id
      )
      counts.trade_violations += info.changes
    }
  })
  run()

  res.json(counts)
})

export default router
