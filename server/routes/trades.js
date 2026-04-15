import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/trades - list trades with optional filtering and pagination
router.get('/', (req, res) => {
  try {
    const userId = req.userId
    const { date_from, date_to, pair, direction, sort, order, limit, offset } = req.query

    const sortOrder = order === 'asc' ? 'ASC' : 'DESC'
    const allowed = ['id', 'open_time', 'pair', 'gross_pnl', 'created_at', 'asset_class']
    const sortCol = allowed.includes(sort) ? sort : 'open_time'

    const conditions = ['user_id = ?']
    const params = [userId]

    if (date_from) {
      conditions.push('open_time >= ?')
      params.push(date_from + 'T00:00')
    }
    if (date_to) {
      conditions.push('open_time <= ?')
      params.push(date_to + 'T23:59')
    }
    if (pair) {
      conditions.push('pair = ?')
      params.push(pair)
    }
    if (direction) {
      conditions.push('direction = ?')
      params.push(direction)
    }

    const where = conditions.join(' AND ')
    const total = db.prepare(`SELECT COUNT(*) as total FROM trades WHERE ${where}`).get(...params).total

    let sql = `SELECT * FROM trades WHERE ${where} ORDER BY ${sortCol} ${sortOrder}, id ${sortOrder}`
    const parsedLimit = parseInt(limit)
    const parsedOffset = parseInt(offset) || 0

    let trades
    if (parsedLimit > 0) {
      sql += ' LIMIT ? OFFSET ?'
      trades = db.prepare(sql).all(...params, parsedLimit, parsedOffset)
    } else {
      trades = db.prepare(sql).all(...params)
    }

    res.json({ trades, total, limit: parsedLimit || 0, offset: parsedOffset })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/trades - create trade (open, closed, or missed)
router.post('/', (req, res) => {
  try {
    const userId = req.userId
    const {
      external_id, asset_class, quantity,
      open_time, close_time, pair, direction, strategy, timeframe, lots,
      entry, stop, target, exit_price, gross_pnl, swap, score, emotion,
      notes, status, risk_amount,
    } = req.body
    const tradeStatus = status || 'open'
    const now = new Date()
    const tradeOpenTime = open_time || `${now.toISOString().split('T')[0]}T${now.toTimeString().slice(0, 5)}`
    const tradeCloseTime = close_time || null
    const tradeStrategy = strategy || 'trend'
    const tradeTimeframe = timeframe || 'H4'
    const tradeAssetClass = asset_class || 'forex'

    if (tradeStatus === 'missed') {
      if (!pair || !direction) {
        return res.status(400).json({ error: 'Missing required fields: pair, direction' })
      }
    } else {
      if (!pair || !direction || entry == null || stop == null) {
        return res.status(400).json({ error: 'Missing required fields: pair, direction, entry, stop' })
      }
      if (tradeStatus === 'closed' && (exit_price == null || gross_pnl == null)) {
        return res.status(400).json({ error: 'Closed trades require exit_price and gross_pnl' })
      }
    }
    const stmt = db.prepare(`
      INSERT INTO trades (user_id, external_id, asset_class, open_time, close_time, pair, direction, strategy, timeframe, lots, quantity, entry, stop, target, exit_price, gross_pnl, swap, score, emotion, notes, status, risk_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const defaultEntry = tradeStatus === 'missed' ? 0 : entry
    const defaultStop = tradeStatus === 'missed' ? 0 : stop
    const result = stmt.run(
      userId, external_id ?? null, tradeAssetClass, tradeOpenTime, tradeCloseTime,
      pair, direction, tradeStrategy, tradeTimeframe, lots || null, quantity ?? null,
      defaultEntry ?? null, defaultStop ?? null, target || null, exit_price ?? null,
      gross_pnl ?? null, swap || 0, score || null, emotion || null, notes || null,
      tradeStatus, risk_amount ?? null
    )
    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(trade)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/trades/:id - update trade (close or edit)
router.put('/:id', (req, res) => {
  try {
    const userId = req.userId
    const {
      asset_class, quantity,
      open_time, close_time, pair, direction, strategy, timeframe, lots,
      entry, stop, target, exit_price, gross_pnl, swap, score, emotion,
      notes, status, risk_amount,
    } = req.body
    const existing = db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Trade not found' })

    const tradeStatus = status || existing.status
    if ((existing.status === 'missed' && tradeStatus !== 'missed') ||
        (existing.status !== 'missed' && tradeStatus === 'missed')) {
      return res.status(400).json({ error: 'Cannot convert between missed and open/closed status' })
    }
    if (tradeStatus === 'closed' && (exit_price == null || gross_pnl == null)) {
      return res.status(400).json({ error: 'Closed trades require exit_price and gross_pnl' })
    }

    const stmt = db.prepare(`
      UPDATE trades SET asset_class=?, open_time=?, close_time=?, pair=?, direction=?, strategy=?, timeframe=?, lots=?, quantity=?, entry=?, stop=?, target=?, exit_price=?, gross_pnl=?, swap=?, score=?, emotion=?, notes=?, status=?, risk_amount=?, updated_at=datetime('now')
      WHERE id=? AND user_id=?
    `)
    stmt.run(
      asset_class ?? existing.asset_class,
      open_time ?? existing.open_time,
      close_time !== undefined ? close_time : existing.close_time,
      pair ?? existing.pair, direction ?? existing.direction,
      strategy ?? existing.strategy, timeframe ?? existing.timeframe,
      lots || existing.lots,
      quantity ?? existing.quantity,
      entry ?? existing.entry, stop ?? existing.stop, target || existing.target,
      exit_price ?? null, gross_pnl ?? null, swap || 0,
      score || null, emotion || null, notes || null,
      tradeStatus, risk_amount ?? existing.risk_amount,
      req.params.id, userId
    )
    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id)
    res.json(trade)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/trades/:id - delete trade
router.delete('/:id', (req, res) => {
  try {
    const userId = req.userId
    const existing = db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Trade not found' })
    db.prepare('DELETE FROM trades WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/trades/by-external/:external_id - lookup by client UUID
router.get('/by-external/:external_id', (req, res) => {
  try {
    const trade = db.prepare('SELECT * FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    res.json(trade)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/trades/by-external/:external_id - upsert by client UUID
router.put('/by-external/:external_id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!existing) return res.status(404).json({ error: 'Trade not found' })
    const merged = { ...existing, ...req.body }
    db.prepare(`
      UPDATE trades SET
        asset_class = ?, pair = ?, direction = ?, strategy = ?, timeframe = ?,
        lots = ?, quantity = ?, entry = ?, stop = ?, target = ?, exit_price = ?,
        gross_pnl = ?, swap = ?, score = ?, emotion = ?, notes = ?, status = ?,
        risk_amount = ?, close_time = ?, open_time = ?, updated_at = datetime('now')
      WHERE user_id = ? AND external_id = ?
    `).run(
      merged.asset_class, merged.pair, merged.direction, merged.strategy, merged.timeframe,
      merged.lots, merged.quantity, merged.entry, merged.stop, merged.target, merged.exit_price,
      merged.gross_pnl, merged.swap ?? 0, merged.score, merged.emotion, merged.notes, merged.status,
      merged.risk_amount, merged.close_time, merged.open_time,
      req.userId, req.params.external_id
    )
    const updated = db.prepare('SELECT * FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/trades/by-external/:external_id
router.delete('/by-external/:external_id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM trades WHERE user_id = ? AND external_id = ?')
      .run(req.userId, req.params.external_id)
    if (info.changes === 0) return res.status(404).json({ error: 'Trade not found' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/trades/by-external/:external_id/violations
router.get('/by-external/:external_id/violations', (req, res) => {
  try {
    const trade = db.prepare('SELECT id FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    const rows = db.prepare(`
      SELECT tv.*, p.external_id AS policy_external_id, p.title AS policy_title
      FROM trade_violations tv
      JOIN policies p ON p.id = tv.policy_id
      WHERE tv.trade_id = ?
    `).all(trade.id)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/trades/by-external/:external_id/violations
router.put('/by-external/:external_id/violations', (req, res) => {
  try {
    const trade = db.prepare('SELECT id FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    const policyExternalIds = Array.isArray(req.body?.policy_external_ids)
      ? req.body.policy_external_ids
      : []
    const run = db.transaction(() => {
      db.prepare('DELETE FROM trade_violations WHERE trade_id = ?').run(trade.id)
      const insertVio = db.prepare(`
        INSERT INTO trade_violations (trade_id, policy_id)
        SELECT ?, p.id FROM policies p WHERE p.user_id = ? AND p.external_id = ?
      `)
      for (const pe of policyExternalIds) insertVio.run(trade.id, req.userId, pe)
    })
    run()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
