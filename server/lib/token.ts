import { randomBytes } from 'node:crypto'

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

export function generateMagicLinkToken(): string {
  // 24 bytes => 32 base64url characters
  return randomBytes(24).toString('base64url')
}

export function isValidTokenShape(s: string): boolean {
  return typeof s === 'string' && TOKEN_RE.test(s)
}
