import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/pairs
router.get('/', (req, res) => {
  try {
    const pairs = db.prepare(
      'SELECT * FROM pairs WHERE user_id = ? ORDER BY sort_order, name'
    ).all(req.userId)
    res.json(pairs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/pairs
router.post('/', (req, res) => {
  try {
    const userId = req.userId
    const {
      external_id, name, asset_class, contract_size,
      price_precision, spread_cost, sort_order,
    } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const dup = db.prepare('SELECT id FROM pairs WHERE user_id = ? AND name = ?').get(userId, name.trim())
    if (dup) return res.status(409).json({ error: 'Pair already exists' })
    const result = db.prepare(`
      INSERT INTO pairs (user_id, external_id, name, asset_class, contract_size, price_precision, spread_cost, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      external_id ?? null,
      name.trim(),
      asset_class ?? 'forex',
      contract_size ?? 100000,
      price_precision ?? 5,
      spread_cost ?? 0,
      sort_order ?? 0
    )
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
    const existing = db.prepare('SELECT * FROM pairs WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Pair not found' })
    const merged = { ...existing, ...req.body }
    db.prepare(`
      UPDATE pairs SET name = ?, asset_class = ?, contract_size = ?,
        price_precision = ?, spread_cost = ?, sort_order = ?
      WHERE id = ? AND user_id = ?
    `).run(
      merged.name, merged.asset_class, merged.contract_size,
      merged.price_precision, merged.spread_cost, merged.sort_order,
      req.params.id, userId
    )
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
    const existing = db.prepare('SELECT * FROM pairs WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Pair not found' })
    db.prepare('DELETE FROM pairs WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/pairs/by-external/:external_id
router.get('/by-external/:external_id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM pairs WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!row) return res.status(404).json({ error: 'Pair not found' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/pairs/by-external/:external_id
router.put('/by-external/:external_id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM pairs WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!existing) {
      // Upsert on first PUT
      const { name, asset_class, contract_size, price_precision, spread_cost, sort_order } = req.body ?? {}
      if (!name) return res.status(400).json({ error: 'Name is required' })
      db.prepare(`
        INSERT INTO pairs (user_id, external_id, name, asset_class, contract_size, price_precision, spread_cost, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.userId, req.params.external_id, name, asset_class ?? 'forex',
        contract_size ?? 100000, price_precision ?? 5, spread_cost ?? 0, sort_order ?? 0
      )
    } else {
      const merged = { ...existing, ...req.body }
      db.prepare(`
        UPDATE pairs SET name = ?, asset_class = ?, contract_size = ?,
          price_precision = ?, spread_cost = ?, sort_order = ?
        WHERE user_id = ? AND external_id = ?
      `).run(
        merged.name, merged.asset_class, merged.contract_size,
        merged.price_precision, merged.spread_cost, merged.sort_order,
        req.userId, req.params.external_id
      )
    }
    const row = db.prepare('SELECT * FROM pairs WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/pairs/by-external/:external_id
router.delete('/by-external/:external_id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM pairs WHERE user_id = ? AND external_id = ?')
      .run(req.userId, req.params.external_id)
    if (info.changes === 0) return res.status(404).json({ error: 'Pair not found' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
