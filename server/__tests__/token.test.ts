import { describe, it, expect } from 'vitest'
import { generateMagicLinkToken, isValidTokenShape } from '../lib/token'

describe('token', () => {
  it('generateMagicLinkToken returns 32 URL-safe characters', () => {
    const t = generateMagicLinkToken()
    expect(t).toHaveLength(32)
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('generateMagicLinkToken returns unique values across 100 calls', () => {
    const set = new Set<string>()
    for (let i = 0; i < 100; i++) set.add(generateMagicLinkToken())
    expect(set.size).toBe(100)
  })

  it('isValidTokenShape accepts output of generateMagicLinkToken', () => {
    expect(isValidTokenShape(generateMagicLinkToken())).toBe(true)
  })

  it('isValidTokenShape rejects empty, wrong length, and invalid chars', () => {
    expect(isValidTokenShape('')).toBe(false)
    expect(isValidTokenShape('short')).toBe(false)
    expect(isValidTokenShape('a'.repeat(32) + 'extra')).toBe(false)
    expect(isValidTokenShape('x'.repeat(31) + '!')).toBe(false)
  })
})
