# journal.basiscalc.xyz — Design Spec

**Date:** 2026-04-14
**Owner:** lz (pseudonymous author, shared with basiscalc.xyz)
**Status:** Draft v1, ready for user review
**Next step after approval:** `superpowers:writing-plans` to produce Plan 1.

---

## 1. Product Positioning

**One-liner:** The free trading journal with built-in discipline tracking. Works anonymously in-browser, syncs to the cloud with a single email.

**Target user:** English-speaking retail traders in forex, commodities, and crypto perpetuals. Typically logging 3-20 trades per week, sensitive to privacy and unwilling to pay for SaaS tools like TraderVue/Edgewonk.

**Business shape:** Free web application supported by display advertising on marketing pages (AdSense, not in-app). No paid tier, no membership. Subdomain of the `basiscalc.xyz` umbrella brand with shared author identity.

**Origin:** A fork of the existing `/home/lz/workspace/trading-journal` Chinese personal tool. Retains the core architecture and unique **policy + violation** feature that differentiates it from every major competitor.

---

## 2. Differentiation

Three claims, in descending order of defensibility.

1. **Discipline tracker, not just a logbook** — each trade can be tagged with policy violations. Weekly view surfaces "your most-violated rule", which no free (or paid) competitor does. This is the moat.
2. **Local-first privacy** — anonymous users' data never leaves the browser. Sign-in is opt-in for cross-device sync. Zero PII collected until email is provided.
3. **Unified forex + commodities + crypto** — single tool covering the most common retail asset classes with class-aware calculations.

Value proposition (landing page):
> The free trading journal with built-in discipline tracking.
>
> • Log forex, commodities, and crypto perps — one tool for all.
> • Tag rule violations on each trade; see what's costing you money.
> • Weekly and monthly self-reviews with auto-computed stats.
> • Works anonymously in your browser — sign in with email when you want cross-device sync.
> • Free forever. No paid tier.

---

## 3. Scope (V1)

**Included:**
- Anonymous usage via IndexedDB (Dexie) — no account required.
- Opt-in magic-link email sign-in with Resend.
- Cross-device sync via `/api/migrate` (one-shot batch upload on sign-in).
- Forex + metals + energy + crypto perp trade logging.
- Per-trade policy violation tagging, weekly and monthly review notes.
- Stats dashboard (win rate, profit factor, equity curve, per-pair/strategy/emotion breakdowns).
- Marketing site: landing, about, privacy, terms, 2 SEO blog articles.
- English-only UI.
- Deployed to US VPS (198.23.244.159) at `journal.basiscalc.xyz`.

**Explicitly deferred to V1.1+:**
- Email/password auth (V1 is magic-link only).
- Cloudflare Turnstile on routes other than magic-link.
- Automated venue-rule data sync (manual for crypto funding/fees).
- E2E Playwright tests.
- React Context refactor of App.jsx state (Fix 1+2 of perf work).
- Bulk CSV import from MT4/MT5/broker statements.
- Additional blog articles beyond the initial 2.
- Chinese locale (code is frozen on a branch, not deleted).
- Telegram integration (columns retained in schema for future use).

**Explicitly out of scope (never for this product):**
- Paid tier, subscriptions, membership tiers.
- Real-time broker integration.
- Social/sharing features.
- Algo/bot execution.

---

## 4. Architecture

**Repository:** `github.com/liugangdao/journal`, cloned locally at `/home/lz/workspace/journal`. New git history (the source repo `trading-journal` is retained separately as personal reference).

**Stack (unchanged from source):**
- Frontend: React 19 + Vite 7 + Tailwind CSS 4 + Recharts
- Backend: Express 5
- Database: SQLite (better-sqlite3, WAL mode)
- Tests: vitest (new — source had none)

**Stack additions:**
- Frontend: **Dexie.js** (IndexedDB wrapper) for anonymous local storage.
- Backend: **Resend** for email delivery (magic link).
- Backend: **marked** (markdown → HTML) for blog article rendering.
- Deployment: **Caddy** for reverse proxy, **Docker Compose** for app container.
- CI: GitHub Actions for build + test + deploy.
- Monitoring: **UptimeRobot** free tier (hits `/api/health`).

**TypeScript policy:** New files added in V1 (stores, hooks, lib/calc, migrate logic) are TypeScript. Existing `.jsx` components are not rewritten; they stay as JSX. TypeScript adoption is file-by-file as code is touched. A future V1.1 may complete the migration.

**Stack removals:**
- bcryptjs (no passwords).
- Any JWT library (sessions are sufficient).

**Hosting split:**
- Static marketing pages (landing, blog, about, legal) — served by Express from `public/marketing/` using EJS templates.
- SPA (the app itself) — React served by Express with catch-all fallback on `/app/*` routes.
- All behind Cloudflare proxy + Caddy TLS.

---

## 5. Repository Structure

```
journal/
├── .github/workflows/
│   ├── ci.yml              # tests + build on PR/push
│   └── deploy.yml          # SSH to VPS + docker compose up
├── docker-compose.yml
├── Dockerfile              # multi-stage: build client → slim server runtime
├── package.json            # root orchestration (concurrently dev:server/client)
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── hooks/
│   │   │   └── useStore.ts       # picks LocalStore or ApiStore
│   │   ├── stores/
│   │   │   ├── JournalStore.ts   # interface
│   │   │   ├── LocalStore.ts     # Dexie implementation
│   │   │   └── ApiStore.ts       # fetch implementation
│   │   ├── lib/
│   │   │   ├── calc.ts           # P&L, R-multiple, class-polymorphic
│   │   │   └── constants.ts      # English enums
│   │   └── styles/
│   ├── __tests__/
│   └── vite.config.ts
├── server/
│   ├── index.js
│   ├── db.js                     # SQLite init + schema_migrations runner
│   ├── schema.sql                # replaced inline migrations
│   ├── migrations/               # future numbered migrations
│   │   └── 0001_init.sql         # same content as schema.sql for bootstrap
│   ├── routes/
│   │   ├── auth.js               # magic-link only
│   │   ├── trades.js
│   │   ├── notes.js
│   │   ├── monthly-notes.js
│   │   ├── pairs.js
│   │   ├── policies.js
│   │   ├── violations.js
│   │   ├── migrate.js            # bulk anon-to-server upload
│   │   └── health.js
│   ├── middleware/
│   │   ├── requireAuth.js
│   │   ├── rateLimit.js          # express-rate-limit config
│   │   └── turnstile.js          # verify CF Turnstile on magic-link
│   ├── lib/
│   │   ├── resend.js             # send magic link email
│   │   ├── markdown.js           # marked wrapper: .md → HTML
│   │   └── token.js              # random 32-char tokens
│   ├── views/                    # EJS templates (NOT public; render-only)
│   │   ├── layouts/main.ejs
│   │   ├── partials/
│   │   │   ├── header.ejs
│   │   │   ├── footer.ejs
│   │   │   └── schema-org.ejs
│   │   ├── landing.ejs
│   │   ├── about.ejs
│   │   ├── privacy.ejs
│   │   ├── terms.ejs
│   │   ├── blog-index.ejs
│   │   └── blog-article.ejs      # single template renders any md
│   ├── content/
│   │   └── blog/
│   │       ├── trading-journal-template-2026.md
│   │       └── how-to-keep-crypto-perp-journal.md
│   ├── public/                   # static web root (served as-is)
│   │   ├── index.html            # Vite-built SPA entrypoint for /app/*
│   │   ├── assets/               # Vite-built JS/CSS bundles
│   │   ├── screenshots/          # blog + landing images
│   │   ├── robots.txt
│   │   └── favicon.svg
│   └── __tests__/
└── docs/superpowers/
    ├── specs/2026-04-14-journal-basiscalc-xyz-design.md   # this file
    └── plans/                     # Plan 1 written after user approval
```

---

## 6. Data Model

All existing 9 trades and 2 users are wiped on V1 deploy (user confirmed). DB rebuilds from `schema.sql`.

**`users`** (simplified from source):
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,                    -- reserved, V2 Telegram
  telegram_id TEXT UNIQUE,            -- reserved, V2 Telegram
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);
```
Removed columns from source: `username`, `password`, `plan`, `plan_expires_at`.

**`magic_link_tokens`** (new):
```sql
CREATE TABLE magic_link_tokens (
  token TEXT PRIMARY KEY,             -- 32-char URL-safe random
  email TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,           -- +15 minutes
  used_at TEXT                        -- null until clicked
);
CREATE INDEX idx_mlt_email ON magic_link_tokens(email);
CREATE INDEX idx_mlt_expires ON magic_link_tokens(expires_at);
```

**`trades`** (migrated columns + additions):
```sql
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),  -- never null; anonymous stays local
  external_id TEXT,                   -- client-generated UUID for dedup on migrate
  open_time TEXT NOT NULL,
  close_time TEXT,
  pair TEXT NOT NULL,
  asset_class TEXT NOT NULL,          -- 'forex' | 'metals' | 'energy' | 'crypto_perp'
  direction TEXT NOT NULL,            -- 'long' | 'short'
  strategy TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  lots REAL,                          -- forex/metals/energy
  quantity REAL,                      -- crypto_perp; nullable for forex
  entry REAL NOT NULL,
  stop REAL NOT NULL,
  target REAL,
  exit_price REAL,
  gross_pnl REAL,                     -- user-entered; not computed in V1
  swap REAL DEFAULT 0,
  risk_amount REAL,
  score TEXT,                         -- 'A'-'D'
  emotion TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'closed',  -- 'open' | 'closed' | 'missed'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_trades_user_external ON trades(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_trades_user_opentime ON trades(user_id, open_time DESC);
CREATE INDEX idx_trades_pair ON trades(pair);
```

**`pairs`** (extended):
```sql
CREATE TABLE pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),    -- null means default seed
  external_id TEXT,                         -- client UUID for dedup
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  contract_size REAL NOT NULL,
  price_precision INTEGER NOT NULL,
  spread_cost REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX idx_pairs_user_external ON pairs(user_id, external_id) WHERE external_id IS NOT NULL;
```

**`policies`** / **`weekly_notes`** / **`monthly_notes`** retain their source schema and gain an `external_id TEXT` column (plus `UNIQUE(user_id, external_id) WHERE external_id IS NOT NULL`) to support the migrate dedup contract in §7.

Default pair seed (33 pairs) applied at `seedUserDefaults(userId)`:
- Forex (22): EUR/USD, GBP/USD, USD/JPY, AUD/USD, NZD/USD, USD/CAD, USD/CHF, EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY, NZD/JPY, CAD/JPY, AUD/CAD, EUR/AUD, EUR/CHF, GBP/CHF, CHF/JPY, EUR/CAD, GBP/CAD, GBP/AUD, AUD/NZD.
- Metals (2): XAU/USD (contract_size 100), XAG/USD (contract_size 5000).
- Energy (3): USOil (1000), UKOil (1000), NGAS (10000).
- Crypto perp (6): BTC/USDT (1, prec 2), ETH/USDT (1, prec 2), SOL/USDT (1, prec 3), AVAX/USDT (1, prec 3), ARB/USDT (1, prec 4), DOGE/USDT (1, prec 5).

**`trade_violations`** and **`sessions`** — retained from source, schema copied into `schema.sql`, English defaults. `trade_violations` does not need `external_id`; it is re-created during migration by looking up the trade and policy by their respective external_ids.

14 English default policies seeded in `db.js::seedUserDefaults()`, including 3 new crypto-specific ones:
- Check funding rate before holding overnight.
- No trading during first 5 minutes of exchange listing.
- Close DEX positions before chain-congestion events (airdrop claims, upgrades).

**`schema_migrations`** (new, for future runtime upgrades):
```sql
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);
```
Startup routine reads `server/migrations/*.sql`, applies any not yet in `schema_migrations`, and records the version.

---

## 7. Anonymous Local-First + Sync

**Anonymous mode (default):**
1. On first visit to `/app`, frontend initializes a Dexie database named `journalLocal` with tables mirroring the server schema (trades, notes, pairs, policies, violations).
2. `useStore()` returns `LocalStore` implementation: all reads and writes hit IndexedDB only. No network calls.
3. Server is entirely unaware of the anonymous user.

**Sign-in flow (opt-in):**
1. User clicks "Save to email" in app header.
2. Enters email into form with Turnstile widget.
3. Frontend posts `{ email, turnstileToken }` to `POST /api/auth/magic-link`.
4. Server verifies Turnstile, rate-limits (3 per email per hour, 10 per IP per hour), generates 32-char token, stores row in `magic_link_tokens` with 15-minute expiry, sends email via Resend.
5. User receives email with link: `https://journal.basiscalc.xyz/auth/verify?token=XXX`.
6. Clicking the link hits `GET /auth/verify?token=XXX` on the server.
7. Server validates token (exists, not expired, not used), marks it `used_at = now`.
8. Server does find-or-create on `users` by email. If new user, `seedUserDefaults(userId)` runs.
9. Server sets `req.session.userId = user.id` and redirects to `/app?just_signed_in=1`.
10. Frontend detects `just_signed_in=1`, reads full local Dexie snapshot, posts to `POST /api/migrate`.
11. Server validates payload size and count limits, inserts all records with `INSERT OR IGNORE` on `(user_id, external_id)` unique constraint.
12. On HTTP 200, frontend clears `journalLocal` IndexedDB and swaps `useStore()` to `ApiStore`.
13. On HTTP 5xx or network failure, frontend keeps local data, displays "Sync failed, retry on next login."

**Cross-device login:**
- New device, same email, magic-link flow completes.
- `/api/migrate` is called with whatever that device's local state is (probably empty or unrelated).
- Server-side `INSERT OR IGNORE` means only genuinely new records are added.
- After migrate, device sees unified server state via `ApiStore`.

**Conflict policy (V1):** INSERT OR IGNORE on `(user_id, external_id)`. Same external_id with different contents → the server copy wins, local overwrite is silently dropped. Explicit conflict UI deferred to V1.1.

**Post-migration cleanup:** After receiving HTTP 200 from `/api/migrate`, the client:
1. Clears local Dexie DB.
2. Calls `history.replaceState(null, '', '/app')` to drop the `?just_signed_in=1` query flag so a page refresh does not re-trigger migration.
3. Swaps `useStore()` return value to `ApiStore`.

**Per-table dedup keys:**
- `trades` — `external_id` (client UUID v4).
- `pairs` — `external_id` (client UUID v4; prevents default-seed pairs being duplicated on server if user modifies them locally first).
- `policies` — `external_id`.
- `weekly_notes` — composite `(user_id, week)` unique constraint; client sends `week: "2026-W15"`.
- `monthly_notes` — composite `(user_id, month)` unique constraint; client sends `month: "2026-04"`.
- `trade_violations` — replay via `(trade_external_id, policy_external_id)` after trades and policies are migrated.

---

## 8. Asset-Class-Polymorphic Calculation

`lib/calc.ts` exports `calcTrade(trade, pair)` that dispatches on `asset_class`:

- **forex / metals / energy:** existing logic — pips, pip-value from `contract_size × lots × (quote-to-USD)`, spread cost, swap, gross P&L.
- **crypto_perp:** user-entered `gross_pnl` is used as-is. R-multiple is `gross_pnl / risk_amount` if both provided. Fees/funding are not auto-computed in V1 (users paste what they see on the exchange screen).

Stats functions (`calcStats`) sum across all asset classes, reporting R-multiple, win rate, equity curve, and profit factor in USD.

---

## 9. Performance Work (V1 minimum)

**Fix 3 — memoize chart/stat computations:**
- Wrap `calcStats(trades)` in `useMemo`.
- Wrap every Recharts `data=` prop in `useMemo`.
- ~6 call sites in client, estimated 30 minutes.

**Fix 4 — SQLite indexes:**
```sql
CREATE INDEX idx_trades_user_opentime ON trades(user_id, open_time DESC);
CREATE INDEX idx_trades_pair ON trades(pair);
CREATE INDEX idx_trade_violations_trade ON trade_violations(trade_id);
CREATE INDEX idx_mlt_email ON magic_link_tokens(email);
CREATE INDEX idx_mlt_expires ON magic_link_tokens(expires_at);
```
In `schema.sql`, applied at startup. 10 minutes.

**Deferred to V1.1:**
- Fix 1 (App.jsx state extraction into Context providers).
- Fix 2 (React Query or SWR for API caching).

Rationale: at current data scale (<10k trades per user) these fixes are over-engineering. Revisit if users report lag post-launch.

---

## 10. Testing

**Minimum V1 coverage — 23 test cases total:**

Server (vitest):
- `calc.test.js` — 8 cases: forex long/short, metals gold/silver, energy USOil, crypto BTC/ETH, edge case (zero stop distance throws).
- `migrate.test.js` — 3 cases: empty batch, 100 records happy path, duplicate external_id returns INSERT OR IGNORE count.
- `magic-link.test.js` — 4 cases: token generation + verify, expired token rejects, already-used token rejects, email rate limit triggers at 4th request within an hour.

Client (vitest + @testing-library/react):
- `LocalStore.test.ts` — 4 cases: add+list, delete, exportAll, clearAll.
- `calc.test.ts` — 4 cases matching server calc.test.js for consistency.

**CI:** GitHub Actions runs `pnpm test` across client and server on every push. Failing tests block the deploy workflow.

**Not in V1:** Playwright E2E, visual regression, performance benchmarks.

---

## 11. Marketing Site (Static HTML via EJS)

All pages in `server/public/marketing/views/`, served by Express using EJS.

- **Landing (`/`):** hero, 3 feature blocks with screenshots, how-it-works, "why free" author note, CTA to `/app`.
- **About (`/about`):** pseudonym lz, Twitter handle (same as basiscalc.xyz), GitHub, read-only wallet address for on-chain trading proof, link to basiscalc.xyz.
- **Privacy (`/privacy`):** explains local-first storage, email-only PII after opt-in, Resend processor, Umami no-cookies analytics.
- **Terms (`/terms`):** free-forever promise, no financial advice disclaimer, liability limitation, affiliate link disclosure.
- **Blog index (`/blog/`):** list of articles.

**V1 blog articles (2):**
- `/blog/trading-journal-template-2026/` — target keyword "trading journal template". ~2,000 words. Practical template you can copy. Drives to `/app`.
- `/blog/how-to-keep-crypto-perp-journal/` — target keyword "crypto trading journal". ~2,500 words. Crypto-specific tracking gotchas (funding, liquidation, chain events). Drives to `/app`.

**Authoring format:** articles are written as Markdown files under `server/content/blog/*.md`, rendered through `lib/markdown.js` (which wraps `marked`) into HTML, then injected into a shared `blog-article.ejs` layout. The layout provides header/footer/schema.org; the markdown body provides content. This keeps long-form prose editable without EJS escaping pain.

**Magic-link email template** is designed during Plan 1 implementation, not in this spec. It includes: HTML body (brand header + CTA button), plaintext fallback, 15-minute expiry notice, "if you didn't request this, ignore" security note.

**Content pipeline (same as basiscalc):** Claude drafts, owner (lz) adds ≥1 real trading screenshot + 1 personal anecdote per article, Claude polishes for SEO. Per-article owner time: 2-3 hours.

**Schema.org markup:**
- Homepage: `WebSite` + `Organization` (shared with basiscalc).
- Blog articles: `Article` + `Person` (author = lz pseudonym).

---

## 12. Deployment

**VPS resource plan (198.23.244.159, 2.4GB RAM):**
- xray (existing, 8443): ~50MB
- sshd: ~20MB
- **Caddy** (new, 80/443): ~100MB
- **Journal app** Docker (new, localhost:3001): hard-limited to 512MB
- **Umami** (from basiscalc Slice 2 concurrent work, localhost:3002): ~200MB
- System + buffer: ~400MB
- Remaining headroom: ~1.1GB. Sufficient.

**DNS:** Cloudflare-managed `basiscalc.xyz` zone. Add `CNAME journal → 198.23.244.159` (or A record) with orange-cloud proxy enabled. Cloudflare terminates TLS, Caddy re-terminates for defense-in-depth.

**TLS certificate on Caddy:** Caddy's default automatic Let's Encrypt acquisition does not work when Cloudflare proxy is in front (the HTTP-01 challenge port 80 is intercepted by Cloudflare). Use a **Cloudflare Origin Certificate** instead, signed by Cloudflare, valid 15 years, covers `*.basiscalc.xyz` and `basiscalc.xyz`. Setup during Week 0:

1. Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate.
2. Save the PEM certificate to `/etc/caddy/origin-cert.pem`, private key to `/etc/caddy/origin-key.pem`.
3. `chmod 600 /etc/caddy/origin-key.pem` and `chown caddy:caddy` both files.
4. In Cloudflare SSL/TLS overview, set mode to **Full (strict)** so the CF ↔ origin hop is validated.

**Caddyfile (`/etc/caddy/Caddyfile`):**
```
journal.basiscalc.xyz {
    tls /etc/caddy/origin-cert.pem /etc/caddy/origin-key.pem
    reverse_proxy localhost:3001
    encode zstd gzip
    log {
        output file /var/log/caddy/journal.log
        format json
    }
}
```

**`docker-compose.yml` (on VPS at `/home/lz/deploy/journal/`):**
```yaml
services:
  app:
    image: ghcr.io/liugangdao/journal:latest
    restart: unless-stopped
    ports: ["127.0.0.1:3001:3001"]
    volumes: ["./data:/app/data"]
    environment:
      NODE_ENV: production
      SESSION_SECRET: ${SESSION_SECRET}
      RESEND_API_KEY: ${RESEND_API_KEY}
      TURNSTILE_SECRET: ${TURNSTILE_SECRET}
      BASE_URL: https://journal.basiscalc.xyz
    mem_limit: 512m
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**CI/CD pipeline:**
- GitHub Actions on push to `main`:
  1. Checkout.
  2. Run tests (`pnpm test`).
  3. Build Docker image, push to GHCR as `ghcr.io/liugangdao/journal:latest` and `:${SHA}`.
  4. SSH to VPS: `cd /home/lz/deploy/journal && docker compose pull && docker compose up -d`.
- Secrets needed in GH repo: `SSH_PRIVATE_KEY`, `GHCR_TOKEN`.

**Backups:**
- **Prerequisite:** host machine has `sqlite3` CLI installed (`apt install sqlite3`), added to Week 0 setup. The `.backup` command is SQLite's online backup API and is safe to call against a live WAL-mode database.
- Cron on VPS at 03:00 UTC daily:
  ```
  sqlite3 /home/lz/deploy/journal/data/journal.db ".backup /tmp/journal-$(date +%F).db" \
    && rclone copy /tmp/journal-*.db cloudflare-r2:journal-backup/ \
    && rm /tmp/journal-*.db
  ```
- Retention: last 30 daily files.
- Additional: manual `.backup` snapshot triggered on demand before any `migrations/` upgrade.

**Disaster recovery runbook (documented in README):**
1. Provision new VPS, install Docker + Caddy.
2. `rclone sync cloudflare-r2:journal-backup/ ./` → grab most recent `journal-*.db` → rename to `journal.db` in `data/`.
3. `docker compose up -d`.
4. Update Cloudflare DNS A record to new VPS IP.
5. Wait for Caddy to re-acquire certificate (~30s).
6. Smoke test `https://journal.basiscalc.xyz/api/health`.
Target RTO: 1-2 hours.

**Uptime monitoring:** UptimeRobot free tier, two monitors (journal + basiscalc), 5-minute interval, email + Telegram bot alerts.

---

## 13. Security

- **Session cookies:** `{ secure: true, httpOnly: true, sameSite: 'lax', maxAge: 30d }`.
- **`trust proxy`:** Express trusts the first proxy hop (Cloudflare → Caddy → Express), so `req.ip` is correct.
- **Helmet middleware:** default CSP, HSTS (1 year), X-Frame-Options, referrer policy.
- **Rate limits (express-rate-limit):**
  - `/api/auth/magic-link` — 3 per email per hour, 10 per IP per hour.
  - `/api/migrate` — 1 per device per 10 seconds, max 10MB body, max 10,000 records per call.
  - All `/api/*` — 100 per IP per minute global ceiling.
- **Turnstile:** widget on magic-link form, server verifies the `cf-turnstile-response` token with Cloudflare's siteverify endpoint before issuing email.
- **SQL:** all queries use `better-sqlite3` prepared statements. No string concatenation.
- **Secrets:** `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET` in environment variables, never committed.
- **Client-side key:** `VITE_TURNSTILE_SITE_KEY` is baked into the Vite client build (public, not secret). Cloudflare Turnstile uses a public site key (injected in the widget) and a private secret key (used server-side during verification); both are required.

---

## 14. Analytics

Shared Umami instance with basiscalc.xyz (deployed during basiscalc Slice 2 on the same VPS at `analytics.basiscalc.xyz`). Journal registered as a second website property.

**Custom events tracked:**
- `trade_created` — props: `asset_class`.
- `magic_link_requested`.
- `magic_link_verified`.
- `migration_completed` — props: `record_count`.
- `blog_article_read` — props: `slug`.

**Not tracked:** user identity, email addresses, trade contents. Analytics is strictly behavioral counts.

---

## 15. Monetization

**V1: none.** AdSense application is submitted around Month 3 (site matured, blog articles settled in Google index). Approval typically takes 2-4 months for new tools in 2026, so **realistic first revenue is Month 6**.

**Ad placement (post-approval):**
- Blog article pages: one leaderboard at bottom.
- Landing page: one footer leaderboard.
- **Never inside `/app`**, to keep the tool experience clean and differentiated from ad-laden competitors.

**Revenue expectations:**
- Month 6: $5-30/month.
- Month 12: $20-100/month.

**Secondary options (evaluate by Month 6):**
- TradingView affiliate link in blog articles that mention technical indicators.
- Broker affiliate links in blog articles, with explicit `rel="sponsored nofollow"`.

---

## 16. Timeline

Owner time budget: ~5 hours per week, concurrent with basiscalc Slice 2/3 parallel work in a separate Claude session.

| Week | Focus | Owner time |
|---|---|---|
| 0 | Setup: new repo, schema.sql + migrations runner, Docker + Caddy + Resend + Turnstile configured | 3h |
| 1 | Schema + auth rewrite: magic-link only, Resend integration, sessions retained | 4h |
| 2 | Client data layer: Dexie + LocalStore, ApiStore, useStore() hook, wire into App.jsx | 4h |
| 3 | English UI + asset_class dispatch: translate constants, calc.js polymorphism, seed 33 default pairs | 6h |
| 4 | Migration endpoint + client migration flow + conflict dedup tests | 4h |
| 5 | Marketing pages: landing + about + privacy + terms via EJS with shared layout | 5h |
| 6 | 2 blog articles: Claude drafts + owner adds screenshots and real anecdotes | 8h |
| 7 | Tests (23 cases) + perf Fix 3+4 + CI pipeline green | 4h |
| 8 | Production deploy + DNS + UptimeRobot + GSC verification + AdSense prep (not submit) | 3h |
| **Total** | | **~41h** |

---

## 17. Success Metrics & Kill Switch

**Day 30 (end of Week 4 after launch):**
- V1 features all functional.
- Owner completed full anonymous → sign-in → sync loop at least once on own devices.
- At least 2 blog articles live and indexed in Google Search Console.

**Day 90:**
- Daily UV: 30-100.
- Registered emails: 10-50.
- At least one keyword ranking in Google top 50.
- No AdSense revenue yet (application in review or not yet submitted).

**Day 180:**
- Daily UV: 100-300.
- Registered emails: 50-200.
- AdSense approved.
- Monthly revenue: $5-30.
- At least one organic user feedback/bug report received.

**Kill switch at Day 180:**
- If daily UV < 30 **and** registered emails < 10 → abandon the ad-revenue thesis.
- Evaluate either adding a paid tier (e.g., $5/month Pro with cloud backup / CSV import / broker integration) or sunsetting the product in favor of doubling down on basiscalc or another bet.

---

## 18. Cost Budget (6 months)

| Item | Cost |
|---|---|
| Domain `basiscalc.xyz` (already owned) | $0 |
| Subdomain `journal.basiscalc.xyz` | $0 |
| Cloudflare DNS + proxy | $0 |
| US VPS (already paid) | $0 incremental |
| Resend (free tier, 3k emails/month) | $0 |
| Umami (self-hosted, shared with basiscalc) | $0 |
| Cloudflare R2 (backups, <10GB) | $0 |
| UptimeRobot (free tier, 50 monitors) | $0 |
| **Total new cash outlay** | **$0** |

---

## 19. Risks & Mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| AdSense rejection or long delay | Medium | Medium | Plan B: TradingView and broker affiliate links on blog articles |
| Sync migration fails and user loses local data | Low | High | Retry mechanism; never clear local until HTTP 200 received |
| VPS failure | Low | Medium | Daily R2 backups, documented recovery runbook, 1-2 hour RTO |
| SQLite write contention at scale | Low | Low | V1 user scale < 10k, not a constraint; WAL mode mitigates |
| Google HCU penalizes the site as a thin content farm | Medium | High | Pseudonymous author with verifiable wallet, real trading screenshots per article, cross-brand authority with basiscalc.xyz |
| Owner time constraints delay launch | Medium | Medium | Timeline assumes 5h/week; scope already minimal; further scope cuts happen at owner discretion |
| Turnstile friction blocks real sign-ups | Low | Low | Invisible challenge mode only triggers on suspicious patterns |
| Competitor (e.g., TraderVue) launches a free tier | Low | Medium | Differentiator (discipline tracker) is unique; accept external risk |

---

## 20. Open Questions for User Review

- [ ] Confirm pseudonym lz, Twitter handle, and wallet address(es) to embed on the About page (may be same as basiscalc.xyz About).
- [ ] Confirm that the existing 9 trades + 2 users in `trading-journal` can be wiped on V1 deploy without backup.
- [ ] Confirm GitHub repo visibility: public (matches basiscalc) or private?
- [ ] Confirm `from: noreply@basiscalc.xyz` for magic-link sender, or prefer a different address.
- [ ] Confirm intent to share Umami instance with basiscalc rather than deploy a second Umami.

---

*End of spec.*
