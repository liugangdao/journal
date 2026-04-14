import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyTurnstile } from '../middleware/turnstile.js'

describe('verifyTurnstile middleware', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET = 'test-secret'
  })

  it('returns 400 when body has no turnstileToken', async () => {
    const req: any = { body: {}, ip: '1.2.3.4' }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    await verifyTurnstile(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Turnstile token missing' })
    expect(next).not.toHaveBeenCalled()
  })

  it('calls siteverify and next() when Cloudflare reports success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    }) as any
    const req: any = { body: { turnstileToken: 'abc' }, ip: '1.2.3.4' }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    await verifyTurnstile(req, res, next)
    expect(globalThis.fetch).toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 403 when Cloudflare reports failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }) as any
    const req: any = { body: { turnstileToken: 'bad' }, ip: '1.2.3.4' }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    await verifyTurnstile(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Turnstile verification failed' })
    expect(next).not.toHaveBeenCalled()
  })
})
