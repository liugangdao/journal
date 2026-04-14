import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/notes - list all notes
router.get('/', (req, res) => {
  try {
    const notes = db.prepare('SELECT * FROM weekly_notes WHERE user_id = ? ORDER BY created_at DESC').all(req.userId)
    res.json(notes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/notes - create note
router.post('/', (req, res) => {
  try {
    const { week, lesson, plan } = req.body
    if (!week) return res.status(400).json({ error: 'Week is required' })
    const stmt = db.prepare('INSERT INTO weekly_notes (user_id, week, lesson, plan) VALUES (?, ?, ?, ?)')
    const result = stmt.run(req.userId, week, lesson || null, plan || null)
    const note = db.prepare('SELECT * FROM weekly_notes WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(note)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/notes/:id - delete note
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM weekly_notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!existing) return res.status(404).json({ error: 'Note not found' })
    db.prepare('DELETE FROM weekly_notes WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
