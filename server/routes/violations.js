import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/trades/:id/violations
router.get('/trades/:id/violations', (req, res) => {
  try {
    const userId = req.userId
    const trade = db.prepare('SELECT id FROM trades WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    const violations = db.prepare(
      'SELECT tv.*, p.title, p.category FROM trade_violations tv JOIN policies p ON tv.policy_id = p.id WHERE tv.trade_id = ?'
    ).all(req.params.id)
    res.json(violations)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/trades/:id/violations — batch update (replace all violations for a trade)
router.put('/trades/:id/violations', (req, res) => {
  try {
    const userId = req.userId
    const { policy_ids } = req.body // array of policy IDs
    const tradeId = req.params.id

    const trade = db.prepare('SELECT id FROM trades WHERE id = ? AND user_id = ?').get(tradeId, userId)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })

    const update = db.transaction(() => {
      db.prepare('DELETE FROM trade_violations WHERE trade_id = ?').run(tradeId)
      if (policy_ids && policy_ids.length > 0) {
        const insert = db.prepare('INSERT INTO trade_violations (trade_id, policy_id) VALUES (?, ?)')
        for (const policyId of policy_ids) {
          insert.run(tradeId, policyId)
        }
      }
    })
    update()

    const violations = db.prepare(
      'SELECT tv.*, p.title, p.category FROM trade_violations tv JOIN policies p ON tv.policy_id = p.id WHERE tv.trade_id = ?'
    ).all(tradeId)
    res.json(violations)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/violations/stats — violation statistics
router.get('/violations/stats', (req, res) => {
  try {
    const userId = req.userId
    const topViolated = db.prepare(`
      SELECT p.id, p.title, p.category, COUNT(*) as count
      FROM trade_violations tv
      JOIN policies p ON tv.policy_id = p.id
      JOIN trades t ON tv.trade_id = t.id
      WHERE t.user_id = ?
      GROUP BY p.id
      ORDER BY count DESC
      LIMIT 10
    `).all(userId)

    const totalViolations = db.prepare(
      'SELECT COUNT(*) as count FROM trade_violations tv JOIN trades t ON tv.trade_id = t.id WHERE t.user_id = ?'
    ).get(userId).count
    const tradesWithViolations = db.prepare(
      'SELECT COUNT(DISTINCT tv.trade_id) as count FROM trade_violations tv JOIN trades t ON tv.trade_id = t.id WHERE t.user_id = ?'
    ).get(userId).count

    res.json({ topViolated, totalViolations, tradesWithViolations })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
