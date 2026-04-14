import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import express from 'express'
import session from 'express-session'
import request from 'supertest'

import db from '../db.js'
import authRouter from '../routes/auth.js'
import { _setResendClientForTest } from '../lib/resend.js'

function buildApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
    })
  )
  app.use('/api/auth', authRouter)
  app.use('/auth', authRouter)
  return app
}

describe('magic-link auth', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test'
    process.env.BASE_URL = 'http://localhost'
    process.env.RESEND_API_KEY = 'dummy'
    process.env.TURNSTILE_SECRET = 'dummy'
  })

  beforeEach(() => {
    db.prepare('DELETE FROM trade_violations').run()
    db.prepare('DELETE FROM trades').run()
    db.prepare('DELETE FROM pairs').run()
    db.prepare('DELETE FROM policies').run()
    db.prepare('DELETE FROM weekly_notes').run()
    db.prepare('DELETE FROM monthly_notes').run()
    db.prepare('DELETE FROM users').run()
    db.prepare('DELETE FROM magic_link_tokens').run()
  })

  it('POST /api/auth/magic-link creates a token and calls Resend', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null })
    _setResendClientForTest({ emails: { send } })

    const app = buildApp()
    const res = await request(app)
      .post('/api/auth/magic-link')
      .send({ email: 'alice@example.com', turnstileToken: 'skip-in-test' })
      .expect(200)

    expect(res.body).toEqual({ ok: true })
    expect(send).toHaveBeenCalledOnce()

    const tokens = db.prepare('SELECT * FROM magic_link_tokens').all() as any[]
    expect(tokens).toHaveLength(1)
    expect(tokens[0].email).toBe('alice@example.com')
    expect(tokens[0].token).toHaveLength(32)
  })

  it('GET /auth/verify with valid token creates a user, sets session, and redirects', async () => {
    _setResendClientForTest({ emails: { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } })
    const app = buildApp()
    const agent = request.agent(app)

    await agent
      .post('/api/auth/magic-link')
      .send({ email: 'bob@example.com', turnstileToken: 'skip-in-test' })
      .expect(200)

    const token = (db.prepare('SELECT token FROM magic_link_tokens').get() as any).token
    const res = await agent.get(`/auth/verify?token=${token}`).expect(302)
    expect(res.headers.location).toBe('/app?just_signed_in=1')

    const users = db.prepare('SELECT * FROM users WHERE email = ?').all('bob@example.com') as any[]
    expect(users).toHaveLength(1)

    const used = db.prepare('SELECT used_at FROM magic_link_tokens WHERE token = ?').get(token) as any
    expect(used.used_at).toBeTruthy()

    const pairs = db.prepare('SELECT COUNT(*) as c FROM pairs WHERE user_id = ?').get(users[0].id) as any
    expect(pairs.c).toBe(33)
    const policies = db.prepare('SELECT COUNT(*) as c FROM policies WHERE user_id = ?').get(users[0].id) as any
    expect(policies.c).toBe(18)
  })

  it('GET /auth/verify with expired token returns 400', async () => {
    const app = buildApp()
    db.prepare(
      'INSERT INTO magic_link_tokens (token, email, expires_at) VALUES (?, ?, ?)'
    ).run('x'.repeat(32), 'c@example.com', '2020-01-01 00:00:00')
    const res = await request(app).get(`/auth/verify?token=${'x'.repeat(32)}`).expect(400)
    expect(res.text).toContain('expired')
  })

  it('GET /auth/verify with already-used token returns 400', async () => {
    const app = buildApp()
    db.prepare(
      'INSERT INTO magic_link_tokens (token, email, expires_at, used_at) VALUES (?, ?, ?, ?)'
    ).run('y'.repeat(32), 'd@example.com', '2099-01-01 00:00:00', '2025-01-01 00:00:00')
    const res = await request(app).get(`/auth/verify?token=${'y'.repeat(32)}`).expect(400)
    expect(res.text).toContain('already used')
  })
})
