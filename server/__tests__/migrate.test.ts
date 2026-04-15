import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import express from 'express'
import session from 'express-session'
import request from 'supertest'

import db from '../db.js'
import migrateRouter from '../routes/migrate.js'

function buildApp(userId: number) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    })
  )
  app.use((req, _res, next) => {
    const s = req.session as unknown as { userId: number }
    s.userId = userId
    ;(req as unknown as { userId: number }).userId = userId
    next()
  })
  app.use('/api/migrate', migrateRouter)
  return app
}

describe('POST /api/migrate', () => {
  let userId: number

  beforeAll(() => {
    process.env.NODE_ENV = 'test'
  })

  beforeEach(() => {
    db.prepare('DELETE FROM trade_violations').run()
    db.prepare('DELETE FROM trades').run()
    db.prepare('DELETE FROM pairs').run()
    db.prepare('DELETE FROM policies').run()
    db.prepare('DELETE FROM weekly_notes').run()
    db.prepare('DELETE FROM monthly_notes').run()
    db.prepare('DELETE FROM magic_link_tokens').run()
    db.prepare('DELETE FROM users').run()
    const r = db.prepare('INSERT INTO users (email) VALUES (?)').run('migrate@example.com')
    userId = Number(r.lastInsertRowid)
  })

  it('empty payload succeeds with zero inserts', async () => {
    const app = buildApp(userId)
    const res = await request(app)
      .post('/api/migrate')
      .send({
        trades: [],
        weekly_notes: [],
        monthly_notes: [],
        policies: [],
        pairs: [],
        trade_violations: [],
      })
      .expect(200)
    expect(res.body).toEqual({
      trades: 0,
      weekly_notes: 0,
      monthly_notes: 0,
      policies: 0,
      pairs: 0,
      trade_violations: 0,
    })
  })

  it('inserts trades, notes, policies, pairs and reports counts', async () => {
    const app = buildApp(userId)
    const payload = {
      trades: [
        {
          external_id: 't-1',
          open_time: '2026-04-14T10:00',
          pair: 'EUR/USD',
          asset_class: 'forex',
          direction: 'long',
          strategy: 'trend',
          timeframe: 'H4',
          lots: 1,
          entry: 1.1,
          stop: 1.09,
          exit_price: 1.11,
          gross_pnl: 100,
          status: 'closed',
        },
      ],
      weekly_notes: [{ external_id: 'w-1', week: '2026-W15', lesson: 'a', plan: 'b' }],
      monthly_notes: [{ external_id: 'm-1', month: '2026-04', lesson: 'c', plan: 'd' }],
      policies: [
        {
          external_id: 'p-1',
          category: 'rules',
          title: 'No trading hungover',
          content: 'self-explanatory',
          sort_order: 0,
          is_active: 1,
          phase: 'both',
        },
      ],
      pairs: [
        {
          external_id: 'pair-1',
          name: 'BTC/USDT',
          asset_class: 'crypto_perp',
          contract_size: 1,
          price_precision: 2,
          spread_cost: 0,
          sort_order: 0,
        },
      ],
      trade_violations: [],
    }
    const res = await request(app).post('/api/migrate').send(payload).expect(200)
    expect(res.body).toEqual({
      trades: 1,
      weekly_notes: 1,
      monthly_notes: 1,
      policies: 1,
      pairs: 1,
      trade_violations: 0,
    })

    expect(
      db.prepare('SELECT COUNT(*) FROM trades WHERE user_id = ?').pluck().get(userId)
    ).toBe(1)
    expect(
      db.prepare('SELECT COUNT(*) FROM pairs WHERE user_id = ?').pluck().get(userId)
    ).toBe(1)
    expect(
      db.prepare('SELECT COUNT(*) FROM policies WHERE user_id = ?').pluck().get(userId)
    ).toBe(1)
  })

  it('duplicate external_id on second call is a no-op via INSERT OR IGNORE', async () => {
    const app = buildApp(userId)
    const trade = {
      external_id: 'dup-1',
      open_time: '2026-04-14T10:00',
      pair: 'EUR/USD',
      asset_class: 'forex',
      direction: 'long',
      strategy: 'trend',
      timeframe: 'H4',
      lots: 1,
      entry: 1.1,
      stop: 1.09,
      exit_price: 1.11,
      gross_pnl: 100,
      status: 'closed',
    }
    const emptyRest = {
      weekly_notes: [],
      monthly_notes: [],
      policies: [],
      pairs: [],
      trade_violations: [],
    }

    const first = await request(buildApp(userId))
      .post('/api/migrate')
      .send({ trades: [trade], ...emptyRest })
      .expect(200)
    expect(first.body.trades).toBe(1)

    const second = await request(buildApp(userId))
      .post('/api/migrate')
      .send({ trades: [trade], ...emptyRest })
      .expect(200)
    expect(second.body.trades).toBe(0)

    expect(
      db.prepare('SELECT COUNT(*) FROM trades WHERE user_id = ?').pluck().get(userId)
    ).toBe(1)
  })
})
