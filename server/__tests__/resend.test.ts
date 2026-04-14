import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendMagicLinkEmail, _setResendClientForTest } from '../lib/resend'

describe('sendMagicLinkEmail', () => {
  beforeEach(() => {
    process.env.BASE_URL = 'https://journal.basiscalc.xyz'
  })

  it('calls resend.emails.send with correct from, to, subject, and URL containing token', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null })
    _setResendClientForTest({ emails: { send } })
    await sendMagicLinkEmail('user@example.com', 'abc123_token_value_32chars_long1')
    expect(send).toHaveBeenCalledOnce()
    const call = send.mock.calls[0][0]
    expect(call.to).toEqual(['user@example.com'])
    expect(call.from).toBe('noreply@basiscalc.xyz')
    expect(call.subject).toBe('Sign in to basiscalc journal')
    expect(call.html).toContain('https://journal.basiscalc.xyz/auth/verify?token=abc123_token_value_32chars_long1')
    expect(call.text).toContain('https://journal.basiscalc.xyz/auth/verify?token=abc123_token_value_32chars_long1')
  })

  it('throws if resend returns an error', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limit' } })
    _setResendClientForTest({ emails: { send } })
    await expect(sendMagicLinkEmail('user@example.com', 'x'.repeat(32))).rejects.toThrow('rate limit')
  })
})
