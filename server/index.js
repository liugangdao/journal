import express from 'express'
import session from 'express-session'
import helmet from 'helmet'
import SqliteStoreFactory from 'better-sqlite3-session-store'
import path from 'path'
import { fileURLToPath } from 'url'

import db from './db.js'  // triggers migrations
import authRouter from './routes/auth.js'
import tradesRouter from './routes/trades.js'
import notesRouter from './routes/notes.js'
import monthlyNotesRouter from './routes/monthly-notes.js'
import pairsRouter from './routes/pairs.js'
import policiesRouter from './routes/policies.js'
import violationsRouter from './routes/violations.js'
import migrateRouter from './routes/migrate.js'
import healthRouter from './routes/health.js'
import requireAuth from './middleware/requireAuth.js'
import { globalApiLimiter } from './middleware/rateLimit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT ?? 3001

app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: false, // CSP finalized in Plan 3 once marketing + CDN are decided
}))
app.use(express.json({ limit: '10mb' }))

const SqliteStore = SqliteStoreFactory({ Store: session.Store })
app.use(
  session({
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900_000 } }),
    secret: process.env.SESSION_SECRET ?? 'dev-secret-please-override',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
)

// Global API rate limit
app.use('/api', globalApiLimiter)

// Public (no auth)
app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/auth', authRouter)  // for GET /auth/verify redirect from email

// Authenticated routes
app.use('/api/trades', requireAuth, tradesRouter)
app.use('/api/notes', requireAuth, notesRouter)
app.use('/api/monthly-notes', requireAuth, monthlyNotesRouter)
app.use('/api/pairs', requireAuth, pairsRouter)
app.use('/api/policies', requireAuth, policiesRouter)
app.use('/api/migrate', requireAuth, migrateRouter)
app.use('/api', requireAuth, violationsRouter)

// Static SPA assets (js/css/images). index:false so `/` doesn't auto-serve
// index.html — the explicit routes below decide which bundle entry renders.
app.use(express.static(path.join(__dirname, 'public'), { index: false }))

// `/` → marketing landing page; `/app` → trading journal app shell.
// Both served from the same SPA bundle (main.jsx decides at mount time by
// reading window.location.pathname).
function sendIndex(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
}
app.get('/', sendIndex)
app.get('/app', sendIndex)
app.get('/app/*path', sendIndex)

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`)
})
