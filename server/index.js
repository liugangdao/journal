import express from 'express'
import cors from 'cors'
import session from 'express-session'
import SqliteStore from 'better-sqlite3-session-store'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import db from './db.js'
import requireAuth from './middleware/requireAuth.js'
import authRouter from './routes/auth.js'
import tradesRouter from './routes/trades.js'
import notesRouter from './routes/notes.js'
import monthlyNotesRouter from './routes/monthly-notes.js'
import pairsRouter from './routes/pairs.js'
import policiesRouter from './routes/policies.js'
import violationsRouter from './routes/violations.js'
import telegramRouter from './routes/telegram.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())

// Session middleware
const BetterSqlite3Store = SqliteStore(session)
app.use(session({
  store: new BetterSqlite3Store({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: process.env.SESSION_SECRET || 'trading-journal-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  },
}))

// Auth routes (public)
app.use('/api/auth', authRouter)

// Telegram routes (webhook is public, billing needs auth)
app.use('/api/telegram', telegramRouter)
app.use('/api/billing', telegramRouter)

// Protected API routes
app.use('/api/trades', requireAuth, tradesRouter)
app.use('/api/notes', requireAuth, notesRouter)
app.use('/api/monthly-notes', requireAuth, monthlyNotesRouter)
app.use('/api/pairs', requireAuth, pairsRouter)
app.use('/api/policies', requireAuth, policiesRouter)
app.use('/api', requireAuth, violationsRouter)

// Export data as JSON with optional date range
app.get('/api/export', requireAuth, (req, res) => {
  try {
    const userId = req.userId
    const { from, to } = req.query
    let tradeQuery = 'SELECT * FROM trades WHERE user_id = ?'
    const params = [userId]
    if (from) { tradeQuery += ' AND open_time >= ?'; params.push(from + 'T00:00') }
    if (to) { tradeQuery += ' AND open_time <= ?'; params.push(to + 'T23:59') }
    tradeQuery += ' ORDER BY open_time DESC'
    const trades = db.prepare(tradeQuery).all(...params)
    const weeklyNotes = db.prepare('SELECT * FROM weekly_notes WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    const monthlyNotes = db.prepare('SELECT * FROM monthly_notes WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    const data = {
      exportDate: new Date().toISOString(),
      dateRange: { from: from || null, to: to || null },
      trades,
      weeklyNotes,
      monthlyNotes
    }
    res.setHeader('Content-Disposition', `attachment; filename="trading-journal-${new Date().toISOString().split('T')[0]}.json"`)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Import data from exported JSON
app.post('/api/import', requireAuth, (req, res) => {
  try {
    const userId = req.userId
    const { trades, weeklyNotes, monthlyNotes } = req.body
    if (!trades && !weeklyNotes && !monthlyNotes) {
      return res.status(400).json({ error: '无效的导入数据' })
    }

    const result = { trades: 0, weeklyNotes: 0, monthlyNotes: 0 }

    const importAll = db.transaction(() => {
      if (trades && trades.length) {
        const stmt = db.prepare(`
          INSERT INTO trades (user_id, open_time, close_time, pair, direction, strategy, timeframe, lots, entry, stop, target, exit_price, gross_pnl, swap, score, emotion, notes, status, risk_amount, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const t of trades) {
          const isMissed = t.status === 'missed'
          const openTime = t.open_time || (t.date ? t.date + 'T00:00' : new Date().toISOString().slice(0, 16))
          const closeTime = t.close_time || null
          stmt.run(userId, openTime, closeTime, t.pair, t.direction, t.strategy, t.timeframe, t.lots ?? null, isMissed ? (t.entry ?? 0) : (t.entry ?? null), isMissed ? (t.stop ?? 0) : (t.stop ?? null), t.target ?? null, t.exit_price ?? null, t.gross_pnl ?? null, t.swap ?? 0, t.score ?? null, t.emotion ?? null, t.notes ?? null, t.status || 'closed', t.risk_amount ?? null, t.created_at || new Date().toISOString(), t.updated_at || new Date().toISOString())
          result.trades++
        }
      }
      if (weeklyNotes && weeklyNotes.length) {
        const stmt = db.prepare('INSERT INTO weekly_notes (user_id, week, lesson, plan, created_at) VALUES (?, ?, ?, ?, ?)')
        for (const n of weeklyNotes) {
          stmt.run(userId, n.week, n.lesson ?? null, n.plan ?? null, n.created_at || new Date().toISOString())
          result.weeklyNotes++
        }
      }
      if (monthlyNotes && monthlyNotes.length) {
        const stmt = db.prepare('INSERT INTO monthly_notes (user_id, month, lesson, plan, created_at) VALUES (?, ?, ?, ?, ?)')
        for (const n of monthlyNotes) {
          stmt.run(userId, n.month, n.lesson ?? null, n.plan ?? null, n.created_at || new Date().toISOString())
          result.monthlyNotes++
        }
      }
    })
    importAll()

    res.json({ success: true, imported: result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve frontend in production
const publicDir = join(__dirname, 'public')
if (existsSync(publicDir)) {
  app.use(express.static(publicDir))
  app.get('{*path}', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
