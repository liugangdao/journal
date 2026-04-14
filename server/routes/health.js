import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ ok: true, time: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db unavailable' })
  }
})

export default router
