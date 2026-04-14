import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db, { seedUserData } from '../db.js'
import { verifyInitData } from '../lib/telegram.js'

const router = Router()

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱和密码为必填项' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少需要6个字符' })
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username)
    if (existing) {
      return res.status(409).json({ error: '用户名或邮箱已被注册' })
    }

    const hash = await bcrypt.hash(password, 10)
    const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username.trim(), email.trim().toLowerCase(), hash)
    const userId = result.lastInsertRowid

    seedUserData(userId)

    req.session.userId = userId
    res.status(201).json({ id: userId, username: username.trim(), email: email.trim().toLowerCase() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body
    if (!identifier || !password) {
      return res.status(400).json({ error: '请输入账号和密码' })
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(identifier.trim().toLowerCase(), identifier.trim())
    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: '账号或密码错误' })
    }

    req.session.userId = user.id
    res.json({ id: user.id, username: user.username, email: user.email })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: err.message })
    res.clearCookie('connect.sid')
    res.json({ success: true })
  })
})

// GET /api/auth/orphan-count — check if orphan data exists
router.get('/orphan-count', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '请先登录' })
  }
  const tables = ['trades', 'weekly_notes', 'monthly_notes', 'pairs', 'policies']
  let total = 0
  for (const table of tables) {
    total += db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE user_id IS NULL`).get().c
  }
  res.json({ total })
})

// POST /api/auth/claim-data — claim orphan data (user_id IS NULL) for current user
router.post('/claim-data', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '请先登录' })
  }
  const userId = req.session.userId
  const tables = ['trades', 'weekly_notes', 'monthly_notes', 'pairs', 'policies']
  const result = {}
  const claim = db.transaction(() => {
    for (const table of tables) {
      const r = db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId)
      result[table] = r.changes
    }
  })
  claim()
  const total = Object.values(result).reduce((a, b) => a + b, 0)
  res.json({ claimed: result, total })
})

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json(null)
  }
  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(req.session.userId)
  res.json(user || null)
})

// POST /api/auth/telegram — authenticate via Telegram initData
router.post('/telegram', async (req, res) => {
  try {
    const initData = req.headers['x-telegram-init-data']
    if (!initData) {
      return res.status(400).json({ error: '缺少 Telegram 认证数据' })
    }

    const { valid, user: tgUser, error } = verifyInitData(initData, { checkFreshness: true })
    if (!valid) {
      return res.status(401).json({ error: error || '认证失败' })
    }

    const telegramId = String(tgUser.id)
    let user = db.prepare('SELECT id, username, display_name, avatar_url, plan, plan_expires_at FROM users WHERE telegram_id = ?').get(telegramId)

    if (!user) {
      const { randomBytes } = await import('crypto')
      const randomPassword = randomBytes(16).toString('hex')
      const hashedPassword = await bcrypt.hash(randomPassword, 10)
      const username = `tg_${telegramId}`
      const displayName = tgUser.first_name || username
      const avatarUrl = tgUser.photo_url || null

      const result = db.prepare(
        'INSERT INTO users (username, password, telegram_id, display_name, avatar_url, plan) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(username, hashedPassword, telegramId, displayName, avatarUrl, 'free')

      seedUserData(result.lastInsertRowid)

      user = db.prepare('SELECT id, username, display_name, avatar_url, plan, plan_expires_at FROM users WHERE id = ?').get(result.lastInsertRowid)
    }

    res.json(user)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
