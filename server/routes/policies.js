import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/policies — optional ?category= and ?phase= filters
router.get('/', (req, res) => {
  try {
    const userId = req.userId
    const { category, phase } = req.query
    let query = 'SELECT * FROM policies WHERE user_id = ?'
    const params = [userId]
    if (category) {
      query += ' AND category = ?'
      params.push(category)
    }
    if (phase) {
      query += ' AND (phase = ? OR phase = ?)'
      params.push(phase, 'both')
    }
    query += ' ORDER BY category, sort_order, id'
    const policies = db.prepare(query).all(...params)
    res.json(policies)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/policies
router.post('/', (req, res) => {
  try {
    const userId = req.userId
    const { external_id, category, title, content, sort_order, phase } = req.body
    if (!category || !title || !content) {
      return res.status(400).json({ error: 'Category, title, and content are required' })
    }
    const result = db.prepare(
      'INSERT INTO policies (user_id, external_id, category, title, content, sort_order, phase) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      userId, external_id ?? null, category, title.trim(), content.trim(),
      sort_order ?? 0, phase ?? 'both'
    )
    const policy = db.prepare('SELECT * FROM policies WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(policy)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/policies/by-external/:external_id
router.get('/by-external/:external_id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM policies WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!row) return res.status(404).json({ error: 'Policy not found' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/policies/by-external/:external_id — upsert
router.put('/by-external/:external_id', (req, res) => {
  try {
    const { category, title, content, sort_order, is_active, phase } = req.body ?? {}
    if (!category || !title || !content) {
      return res.status(400).json({ error: 'Category, title, and content are required' })
    }
    const existing = db.prepare('SELECT id FROM policies WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (existing) {
      db.prepare(`
        UPDATE policies SET category = ?, title = ?, content = ?,
          sort_order = ?, is_active = ?, phase = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(category, title, content, sort_order ?? 0, is_active ?? 1, phase ?? 'both', existing.id)
    } else {
      db.prepare(`
        INSERT INTO policies (user_id, external_id, category, title, content, sort_order, is_active, phase)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.userId, req.params.external_id, category, title, content,
        sort_order ?? 0, is_active ?? 1, phase ?? 'both'
      )
    }
    const row = db.prepare('SELECT * FROM policies WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/policies/by-external/:external_id
router.delete('/by-external/:external_id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM policies WHERE user_id = ? AND external_id = ?')
      .run(req.userId, req.params.external_id)
    if (info.changes === 0) return res.status(404).json({ error: 'Policy not found' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/policies/:id
router.put('/:id', (req, res) => {
  try {
    const userId = req.userId
    const existing = db.prepare('SELECT * FROM policies WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Policy not found' })
    const { category, title, content, sort_order, phase } = req.body
    db.prepare(
      "UPDATE policies SET category = ?, title = ?, content = ?, sort_order = ?, phase = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(
      category ?? existing.category,
      title?.trim() ?? existing.title,
      content?.trim() ?? existing.content,
      sort_order ?? existing.sort_order,
      phase ?? existing.phase,
      req.params.id, userId
    )
    const policy = db.prepare('SELECT * FROM policies WHERE id = ?').get(req.params.id)
    res.json(policy)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/policies/:id
router.delete('/:id', (req, res) => {
  try {
    const userId = req.userId
    const existing = db.prepare('SELECT * FROM policies WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Policy not found' })
    db.prepare('DELETE FROM policies WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/policies/:id/toggle — toggle is_active
router.put('/:id/toggle', (req, res) => {
  try {
    const userId = req.userId
    const existing = db.prepare('SELECT * FROM policies WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Policy not found' })
    const newActive = existing.is_active ? 0 : 1
    db.prepare("UPDATE policies SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(newActive, req.params.id, userId)
    const policy = db.prepare('SELECT * FROM policies WHERE id = ?').get(req.params.id)
    res.json(policy)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
