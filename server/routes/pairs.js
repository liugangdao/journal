import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/pairs
router.get('/', (req, res) => {
  try {
    const pairs = db.prepare('SELECT * FROM pairs WHERE user_id = ? ORDER BY sort_order, name').all(req.userId)
    res.json(pairs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/pairs
router.post('/', (req, res) => {
  try {
    const userId = req.userId
    const { name, spread_cost } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const dup = db.prepare('SELECT id FROM pairs WHERE user_id = ? AND name = ?').get(userId, name.trim())
    if (dup) return res.status(409).json({ error: '该品种已存在' })
    const result = db.prepare('INSERT INTO pairs (user_id, name, spread_cost) VALUES (?, ?, ?)').run(userId, name.trim(), spread_cost ?? 5)
    const pair = db.prepare('SELECT * FROM pairs WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(pair)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/pairs/:id
router.put('/:id', (req, res) => {
  try {
    const userId = req.userId
    const existing = db.prepare('SELECT * FROM pairs WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Pair not found' })
    const { name, spread_cost } = req.body
    db.prepare('UPDATE pairs SET name = ?, spread_cost = ? WHERE id = ? AND user_id = ?')
      .run(name ?? existing.name, spread_cost ?? existing.spread_cost, req.params.id, userId)
    const pair = db.prepare('SELECT * FROM pairs WHERE id = ?').get(req.params.id)
    res.json(pair)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/pairs/:id
router.delete('/:id', (req, res) => {
  try {
    const userId = req.userId
    const existing = db.prepare('SELECT * FROM pairs WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Pair not found' })
    db.prepare('DELETE FROM pairs WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
