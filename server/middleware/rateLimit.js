import rateLimit from 'express-rate-limit'

/**
 * Global API limiter: 100 requests per IP per minute.
 * Guards against broad scraping and accidental loops.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
})

/**
 * Per-email magic-link limiter: 3 per email per hour.
 * Key function reads email from body (POST /api/auth/magic-link).
 */
export const magicLinkByEmail = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `email:${String(req.body?.email ?? '').toLowerCase().trim()}`,
  message: { error: 'Too many sign-in requests for this email, try again in an hour' },
})

/**
 * Per-IP magic-link limiter: 10 per IP per hour.
 */
export const magicLinkByIp = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in requests from this network, try again in an hour' },
})

/**
 * Migrate endpoint limiter: 1 per IP per 10 seconds.
 * Body size cap is enforced separately by express.json({ limit }).
 */
export const migrateLimiter = rateLimit({
  windowMs: 10_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Migration already in flight; retry in 10 seconds' },
})
