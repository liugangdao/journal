# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm run install:all    # Install root + client + server deps
npm run dev            # Run client (:3000) + server (:3001) concurrently
npm run dev:client     # Client only
npm run dev:server     # Server only (node --watch)
npm run build          # Vite build → server/public
npm run start          # Production server only
node server/seed.js    # Populate sample data
docker compose up -d   # Docker deployment (port 3001)
```

## Architecture

Full-stack multi-user trading journal for forex/commodities. React 19 SPA served by Express 5 with SQLite (better-sqlite3).

- **Client**: React 19 + Vite 7 + Tailwind CSS v4 + Recharts
- **Server**: Express 5 + better-sqlite3 (WAL mode, foreign keys)
- **Auth**: Session-based (express-session + bcryptjs) with SQLite session store. Cookie: `connect.sid`, 30-day expiry
- **DB**: SQLite at `./data/journal.db` — 8 tables: `users`, `trades`, `weekly_notes`, `monthly_notes`, `pairs`, `policies`, `trade_violations`, plus session table
- **Build**: Vite outputs to `server/public`; Express serves static files with SPA fallback
- **Dev proxy**: Vite proxies `/api/*` → `http://localhost:3001`
- **Deploy**: Docker multi-stage build; Fly.io (region: nrt, volume mounted at `/app/data`)

### Environment Variables

- `PORT` — server port (default: `3001`)
- `NODE_ENV` — controls CORS origin behavior
- `SESSION_SECRET` — session signing key (default in code, override in production)

## API Routes

All under `/api` prefix (defined in `server/routes/`). Auth routes are public; all others require session via `server/middleware/requireAuth.js`.

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/auth` | register, login, logout, me, claim-data, orphan-count | Public — no auth required |
| `/api/trades` | GET, POST, PUT/:id, DELETE/:id | Sorting via `?sort=&order=` |
| `/api/notes` | GET, POST, DELETE/:id | Weekly notes (week field: `YYYY-Www`) |
| `/api/monthly-notes` | GET, POST, DELETE/:id | Monthly notes (month field: `YYYY-MM`) |
| `/api/pairs` | GET, POST, PUT/:id, DELETE/:id | Per-user currency pair config with spread costs |
| `/api/policies` | GET, POST, PUT/:id, DELETE/:id, PUT/:id/toggle | Policy CRUD + toggle active |
| `/api/trades/:id/violations` | GET, PUT | Trade violation records (policy_ids array) |
| `/api/violations/stats` | GET | Violation statistics |
| `/api/export` | GET | JSON download of all data |
| `/api/import` | POST | Batch import trades/notes |

Trades have `status`: `open` or `closed`. Closed trades require `exit_price` and `gross_pnl`. All data queries are scoped to `req.session.userId`.

## Frontend Patterns

- **State**: All in `App.jsx` — auth state, trades, notes, monthlyNotes, pairs, policies, tab navigation, form state. No Redux/Zustand.
- **Auth flow**: `App.jsx` checks session on mount via `api.getMe()`. Global 401 handler triggers logout. `AuthPage.jsx` handles login/register toggle. `LandingPage.jsx` shown to unauthenticated visitors.
- **API client**: `client/src/hooks/useApi.js` — fetch wrapper with `credentials: 'include'` for session cookies, global 401 interception
- **Calculations**: `client/src/lib/calc.js` — `calcTrade()` (R-multiple, pips, spread, net P&L) and `calcStats()` (aggregated stats, breakdowns by pair/strategy/emotion/day/timeframe)
- **Constants**: `client/src/lib/constants.js` — strategies, emotions, scores, timeframes (pairs now come from DB per-user)
- **Tabs**: record (trade form + table + open positions), stats (dashboard), weekly, monthly, policy, settings
- **Trade form modes**: open (new position), close (fill exit fields), edit (modify closed trade)
- **Theme**: Dark by default with light mode toggle (`client/src/hooks/useTheme.js`)
- **UI components**: `client/src/components/ui/` — Input, Select, Tab, KpiCard

## Key Conventions

- **Language**: All UI text is Chinese (zh-CN)
- **Styling**: Tailwind v4 CSS-based dark theme — custom tokens: `bg-card`, `bg-input`, `bg-header-bg`, `text-text`, `text-muted`, `border-border`, `accent` (blue). Fonts: Inter, JetBrains Mono
- **No TypeScript** — plain JS with ES modules throughout
- **No test framework** configured
- **Direction values**: 多 (Buy), 空 (Sell)
- **Score values**: A–D (完美执行 through 严重违规)
- **Per-user data isolation**: All DB queries filter by `user_id`; new users get seeded with default pairs (23) and policies (14) via `seedUserData()` in `server/db.js`

## Database Schema

Schema auto-created in `server/db.js` with migrations applied inline. Key tables:

**users**: `id`, `username` (unique), `email` (unique), `password` (bcrypt hash)

**trades**: `user_id`, `date`, `pair`, `direction`, `strategy`, `timeframe`, `lots`, `entry`, `stop`, `target`, `exit_price`, `gross_pnl`, `swap`, `score`, `emotion`, `notes`, `status` (open/closed)

**pairs**: `user_id`, `name`, `spread_cost` (default 5), `sort_order` — per-user pair configuration

**policies**: `user_id`, `category`, `title`, `content`, `sort_order`, `is_active`

**trade_violations**: `trade_id` (FK), `policy_id` (FK), `notes` — M:N link between trades and policies
