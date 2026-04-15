import { Router } from 'express'
import db, { seedUserDefaults } from '../db.js'
import { generateMagicLinkToken, isValidTokenShape } from '../lib/token.js'
import { sendMagicLinkEmail } from '../lib/resend.js'
import { verifyTurnstile } from '../middleware/turnstile.js'
import { magicLinkByEmail, magicLinkByIp } from '../middleware/rateLimit.js'

const router = Router()

function isEmailValid(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

// Skip Turnstile and rate limiters in tests to keep them deterministic.
const noopMiddleware = (req, res, next) => next()
const isTest = process.env.NODE_ENV === 'test'
const maybeTurnstile = isTest ? noopMiddleware : verifyTurnstile
const maybeRateLimitIp = isTest ? noopMiddleware : magicLinkByIp
const maybeRateLimitEmail = isTest ? noopMiddleware : magicLinkByEmail

const FIFTEEN_MIN_MS = 15 * 60 * 1000

// POST /api/auth/magic-link
router.post('/magic-link', maybeRateLimitIp, maybeRateLimitEmail, maybeTurnstile, async (req, res) => {
  const emailRaw = req.body?.email
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : ''
  if (!isEmailValid(email)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  const token = generateMagicLinkToken()
  const expiresAt = new Date(Date.now() + FIFTEEN_MIN_MS).toISOString().slice(0, 19).replace('T', ' ')

  db.prepare(
    'INSERT INTO magic_link_tokens (token, email, expires_at) VALUES (?, ?, ?)'
  ).run(token, email, expiresAt)

  try {
    await sendMagicLinkEmail(email, token)
  } catch (err) {
    console.error('[auth] resend error:', err)
    return res.status(502).json({ error: 'Email service unavailable' })
  }

  res.json({ ok: true })
})

// GET /auth/verify?token=XXX  (mounted at app root, not /api)
router.get('/verify', (req, res) => {
  const token = String(req.query?.token ?? '')
  if (!isValidTokenShape(token)) {
    return res.status(400).send('Invalid token format')
  }

  const row = db.prepare('SELECT email, expires_at, used_at FROM magic_link_tokens WHERE token = ?').get(token)
  if (!row) return res.status(400).send('Token not recognized')
  if (row.used_at) return res.status(400).send('Token already used. Request a new sign-in email.')
  const expiresAtMs = Date.parse(row.expires_at.replace(' ', 'T') + 'Z')
  if (Date.now() > expiresAtMs) {
    return res.status(400).send('Token expired. Request a new sign-in email.')
  }

  const email = row.email
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  let userId
  if (existing) {
    userId = existing.id
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId)
  } else {
    const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email)
    userId = result.lastInsertRowid
    seedUserDefaults(userId)
  }

  db.prepare("UPDATE magic_link_tokens SET used_at = datetime('now') WHERE token = ?").run(token)

  req.session.userId = userId
  res.redirect('/app?just_signed_in=1')
})

// GET /api/auth/me — return current session user, or { authenticated: false }
// for anonymous visitors. Returns 200 in both cases so the browser devtools
// don't flood the console with expected-anonymous 401s; real auth protection
// still lives on the data routes (requireAuth middleware).
router.get('/me', (req, res) => {
  const userId = req.session?.userId
  if (!userId) return res.json({ authenticated: false })
  const user = db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(userId)
  if (!user) return res.json({ authenticated: false })
  res.json({ authenticated: true, ...user })
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }))
})

export default router
