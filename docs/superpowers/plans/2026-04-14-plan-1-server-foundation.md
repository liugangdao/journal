# Plan 1 — Server Foundation + Magic-Link Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `journal` repository from the `trading-journal` source, strip obsolete code (passwords, Chinese UI, paid-plan logic, Telegram), stand up the new SQLite schema with a migrations runner, and implement magic-link email authentication using Resend + Cloudflare Turnstile.

**Architecture:** Same Express 5 + better-sqlite3 + express-session backend as the source project, but bcryptjs and the legacy session-based login are removed. Magic-link tokens are stored in a new table with 15-minute expiry. Emails are sent via Resend. All new files are TypeScript; existing JSX is untouched.

**Tech Stack:** Node 22, pnpm 10, Express 5, better-sqlite3, express-session + sqlite session store, vitest (new), Resend (new), marked (new but used in Plan 3), Dexie (new but used in Plan 2), Cloudflare Turnstile.

**Spec reference:** `/home/lz/workspace/journal/docs/superpowers/specs/2026-04-14-journal-basiscalc-xyz-design.md`

**Repo root for all paths below:** `/home/lz/workspace/journal/`

---

## User-Action Prerequisites (done by owner before the listed task)

- [ ] **UA-1 (before Task 1):** Create empty public GitHub repository `github.com/liugangdao/journal`. Do not initialize with README/gitignore/license. Note the SSH URL.
- [ ] **UA-2 (before Task 10):** Sign up for Resend at `resend.com`. Add `basiscalc.xyz` as a sending domain. Resend shows DKIM, SPF, and MX records to add in Cloudflare DNS for `basiscalc.xyz`. Add them; verify on the Resend dashboard. Generate an API key with "Sending access" scope. Record the API key.
- [ ] **UA-3 (before Task 12):** Go to Cloudflare dashboard → Turnstile → Add site → hostname `journal.basiscalc.xyz`, widget mode "Managed". Record both the **Site Key** (public) and **Secret Key** (private).
- [ ] **UA-4 (deferred to Plan 3, documented here for completeness):** Cloudflare Origin Certificate for `*.basiscalc.xyz` — used only during production deployment in Plan 3.

---

## File Structure Created by This Plan

```
journal/
├── .github/workflows/
│   └── ci.yml
├── .gitignore
├── package.json                    # root orchestration
├── pnpm-lock.yaml
├── tsconfig.json                   # strict TS, allows JS coexistence
├── vitest.config.ts
├── docker-compose.yml              # skeleton; full prod usage in Plan 3
├── Dockerfile                      # skeleton
├── server/
│   ├── index.js                    # modified: removed legacy auth, new session config
│   ├── db.js                       # rewritten: schema.sql + migrations runner
│   ├── schema.sql                  # NEW
│   ├── migrations/
│   │   └── 0001_init.sql           # mirrors schema.sql for bootstrap
│   ├── lib/
│   │   ├── token.ts                # NEW
│   │   └── resend.ts               # NEW
│   ├── middleware/
│   │   ├── requireAuth.js          # kept as-is
│   │   ├── rateLimit.js            # NEW
│   │   └── turnstile.js            # NEW
│   ├── routes/
│   │   ├── auth.js                 # rewritten: magic-link only
│   │   └── health.js               # NEW
│   ├── __tests__/
│   │   ├── token.test.ts           # NEW
│   │   ├── resend.test.ts          # NEW
│   │   ├── turnstile.test.ts       # NEW
│   │   └── magic-link.test.ts      # NEW
│   └── package.json
├── client/                         # unchanged in Plan 1
└── docs/superpowers/
    ├── specs/2026-04-14-journal-basiscalc-xyz-design.md   (exists)
    └── plans/2026-04-14-plan-1-server-foundation.md        (this file)
```

**Files deleted in this plan:**
- `server/routes/telegram.js`
- `server/lib/telegram.js`
- `server/middleware/requireQuota.js`
- `server/seed.js` and `server/seed-http.js` (obsolete; data reset is automatic via fresh schema)
- All Chinese default data (rewritten in English inside `db.js::seedUserDefaults`).

**Files preserved unchanged for later plans:**
- `client/src/**` — rewritten in Plan 2.
- `server/routes/trades.js`, `notes.js`, `monthly-notes.js`, `pairs.js`, `policies.js`, `violations.js` — schema changes in Plan 2/3.

---

## Task 1: Scaffold new repo from trading-journal source

**Files:** the entire `/home/lz/workspace/journal/` directory is populated.

- [ ] **Step 1: Create the directory and copy source (excluding generated/ignored files).**

```bash
cd /home/lz/workspace
mkdir -p journal
rsync -a --exclude=.git --exclude=node_modules --exclude=data --exclude='*.db' --exclude='*.db-shm' --exclude='*.db-wal' --exclude=dist trading-journal/ journal/
cd journal
ls -la
```

Expected: `journal/` contains `client/`, `server/`, `package.json`, `docker-compose.yml`, `Dockerfile`, `CLAUDE.md`, etc., with no `.git` or `node_modules`.

- [ ] **Step 2: Remove files that will be rewritten.**

```bash
cd /home/lz/workspace/journal
rm -f server/lib/telegram.js server/routes/telegram.js
rm -f server/middleware/requireQuota.js
rm -f server/seed.js server/seed-http.js
rm -rf docs/
ls server/routes/ server/lib/ server/middleware/
```

Expected: `server/routes/` contains `auth.js`, `monthly-notes.js`, `notes.js`, `pairs.js`, `policies.js`, `trades.js`, `violations.js`. No `telegram.js`. `server/lib/` is empty. `server/middleware/` contains `requireAuth.js`.

- [ ] **Step 3: Restore the spec file into the new docs path.**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp ../trading-journal/../journal/docs/superpowers/specs/2026-04-14-journal-basiscalc-xyz-design.md \
   docs/superpowers/specs/ 2>/dev/null || true
# Note: if the source spec isn't in trading-journal, the spec was already committed at journal/.
ls docs/superpowers/specs/
```

Expected: if the spec file isn't found, it's because this Plan 1 was launched after the spec was committed directly to `journal/`. In that case skip this step — the file is already in place.

- [ ] **Step 4: Initialize a fresh git history.**

```bash
cd /home/lz/workspace/journal
git init -q
cat > .gitignore <<'EOF'
node_modules/
dist/
data/
*.db
*.db-shm
*.db-wal
.env
.env.local
.DS_Store
/server/public/assets/
EOF
git add .
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -q -m "chore: scaffold journal from trading-journal source

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git log --oneline
```

Expected: single commit with the full scaffolded tree.

- [ ] **Step 5: Link to the GitHub remote (UA-1 must be complete) and push.**

```bash
git remote add origin git@github.com:liugangdao/journal.git
git branch -M main
git push -u origin main
```

Expected: push succeeds; `main` branch appears on GitHub.

---

## Task 2: Install dependencies, add new ones, remove bcryptjs

**Files:**
- Modify: `server/package.json`
- Modify: `client/package.json` (Plan 2 expands; Plan 1 only adds dexie to dependencies so the build cache is warmed)

- [ ] **Step 1: Install root, server, and client dependencies using existing `install:all` script.**

```bash
cd /home/lz/workspace/journal
pnpm install --prefer-frozen-lockfile 2>&1 | tail -5 || pnpm run install:all
```

If this is the first install after copying and there's no pnpm-lock, run `pnpm run install:all` which recurses into `client/` and `server/`.

Expected: installation completes, `node_modules/` populated at root, `client/`, and `server/`.

- [ ] **Step 2: Add new server deps.**

```bash
cd /home/lz/workspace/journal/server
pnpm add resend marked
pnpm add -D vitest @vitest/ui typescript @types/node @types/express @types/better-sqlite3 tsx
```

Expected: `server/package.json` has `resend`, `marked` under `dependencies`; `vitest`, `@vitest/ui`, `typescript`, `@types/*`, `tsx` under `devDependencies`.

- [ ] **Step 3: Remove bcryptjs from server.**

```bash
cd /home/lz/workspace/journal/server
pnpm remove bcryptjs || true
grep -l bcrypt **/*.js 2>/dev/null || echo "no bcrypt imports"
```

Expected: bcryptjs is uninstalled. grep shows either "no bcrypt imports" or the list of files to clean in later tasks.

- [ ] **Step 4: Add TypeScript config for server.**

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["**/*.ts", "**/*.js"],
  "exclude": ["node_modules", "**/__tests__/**/node_modules"]
}
```

- [ ] **Step 5: Commit.**

```bash
cd /home/lz/workspace/journal
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "chore: install new deps, remove bcryptjs, add TS config

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Configure vitest

**Files:**
- Create: `vitest.config.ts` (root)
- Modify: `package.json` (root scripts)
- Modify: `server/package.json` (scripts)

- [ ] **Step 1: Create `vitest.config.ts` at repo root.**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/__tests__/**/*.test.{ts,js}'],
    exclude: ['**/node_modules/**'],
  },
});
```

- [ ] **Step 2: Add test scripts.**

Edit `package.json` at root, inside the existing `scripts` object, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

Full `scripts` object becomes:
```json
"scripts": {
  "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
  "dev:client": "cd client && npm run dev",
  "dev:server": "cd server && node --watch index.js",
  "build": "cd client && npm run build",
  "start": "cd server && node index.js",
  "install:all": "npm install && cd client && npm install && cd ../server && npm install",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
}
```

- [ ] **Step 3: Verify vitest runs (should find zero tests and exit clean exit code 1 per convention).**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -5
```

Expected: "No test files found, exiting with code 1." This is expected before any tests exist.

- [ ] **Step 4: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "chore: configure vitest

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Write `schema.sql` with new tables

**Files:**
- Create: `server/schema.sql`
- Create: `server/migrations/0001_init.sql` (same content, serves as the first migration)

- [ ] **Step 1: Create `server/schema.sql`.**

```sql
-- journal.basiscalc.xyz — initial schema
-- Created: 2026-04-14
-- See docs/superpowers/specs/2026-04-14-journal-basiscalc-xyz-design.md §6

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  telegram_id TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mlt_email ON magic_link_tokens(email);
CREATE INDEX IF NOT EXISTS idx_mlt_expires ON magic_link_tokens(expires_at);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id TEXT,
  open_time TEXT NOT NULL,
  close_time TEXT,
  pair TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  direction TEXT NOT NULL,
  strategy TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  lots REAL,
  quantity REAL,
  entry REAL NOT NULL,
  stop REAL NOT NULL,
  target REAL,
  exit_price REAL,
  gross_pnl REAL,
  swap REAL DEFAULT 0,
  risk_amount REAL,
  score TEXT,
  emotion TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'closed',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_user_external ON trades(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_user_opentime ON trades(user_id, open_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair);

CREATE TABLE IF NOT EXISTS pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  contract_size REAL NOT NULL,
  price_precision INTEGER NOT NULL,
  spread_cost REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pairs_user_external ON pairs(user_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  external_id TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  phase TEXT NOT NULL DEFAULT 'both',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_policies_user_external ON policies(user_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trade_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_violations_trade ON trade_violations(trade_id);

CREATE TABLE IF NOT EXISTS weekly_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  external_id TEXT,
  week TEXT NOT NULL,
  lesson TEXT,
  plan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_notes_user_external ON weekly_notes(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_notes_user_week ON weekly_notes(user_id, week);

CREATE TABLE IF NOT EXISTS monthly_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  external_id TEXT,
  month TEXT NOT NULL,
  lesson TEXT,
  plan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_notes_user_external ON monthly_notes(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_notes_user_month ON monthly_notes(user_id, month);
```

- [ ] **Step 2: Copy as first migration.**

```bash
cd /home/lz/workspace/journal
mkdir -p server/migrations
cp server/schema.sql server/migrations/0001_init.sql
ls server/migrations/
```

- [ ] **Step 3: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: add initial schema.sql and first migration

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Rewrite `server/db.js` with migrations runner

**Files:**
- Rewrite: `server/db.js` (completely)

- [ ] **Step 1: Overwrite `server/db.js`.**

```js
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

const db = new Database(join(dataDir, 'journal.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Run all migrations in order, skipping already-applied ones.
const migrationsDir = join(__dirname, 'migrations')
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`)

const applied = new Set(
  db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
)

const migrationFiles = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()

for (const file of migrationFiles) {
  const version = file.replace(/\.sql$/, '')
  if (applied.has(version)) continue
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  const run = db.transaction(() => {
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
  })
  run()
  console.log(`[db] applied migration ${version}`)
}

// Seed default pairs and policies for a newly created user.
// Called from auth.js after INSERT INTO users.
const DEFAULT_PAIRS = [
  // Forex (22)
  { name: 'EUR/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 3.5 },
  { name: 'GBP/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4 },
  { name: 'USD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 3 },
  { name: 'AUD/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 3.5 },
  { name: 'NZD/USD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4.5 },
  { name: 'USD/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4 },
  { name: 'USD/CHF', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4 },
  { name: 'EUR/GBP', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4.5 },
  { name: 'EUR/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5 },
  { name: 'GBP/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 6 },
  { name: 'AUD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5 },
  { name: 'NZD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5 },
  { name: 'CAD/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5 },
  { name: 'AUD/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4 },
  { name: 'EUR/AUD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5 },
  { name: 'EUR/CHF', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5 },
  { name: 'GBP/CHF', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5 },
  { name: 'CHF/JPY', asset_class: 'forex', contract_size: 100000, price_precision: 3, spread_cost: 5 },
  { name: 'EUR/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5 },
  { name: 'GBP/CAD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5 },
  { name: 'GBP/AUD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 5 },
  { name: 'AUD/NZD', asset_class: 'forex', contract_size: 100000, price_precision: 5, spread_cost: 4 },
  // Metals (2)
  { name: 'XAU/USD', asset_class: 'metals', contract_size: 100, price_precision: 2, spread_cost: 12 },
  { name: 'XAG/USD', asset_class: 'metals', contract_size: 5000, price_precision: 3, spread_cost: 10 },
  // Energy (3)
  { name: 'USOil', asset_class: 'energy', contract_size: 1000, price_precision: 2, spread_cost: 5 },
  { name: 'UKOil', asset_class: 'energy', contract_size: 1000, price_precision: 2, spread_cost: 6 },
  { name: 'NGAS', asset_class: 'energy', contract_size: 10000, price_precision: 3, spread_cost: 8 },
  // Crypto perp (6)
  { name: 'BTC/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 2, spread_cost: 0 },
  { name: 'ETH/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 2, spread_cost: 0 },
  { name: 'SOL/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 3, spread_cost: 0 },
  { name: 'AVAX/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 3, spread_cost: 0 },
  { name: 'ARB/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 4, spread_cost: 0 },
  { name: 'DOGE/USDT', asset_class: 'crypto_perp', contract_size: 1, price_precision: 5, spread_cost: 0 },
]

const DEFAULT_POLICIES = [
  { category: 'rules', title: 'Daily loss ≤ 2% of account equity', content: 'When cumulative daily loss reaches 2%, stop trading immediately to avoid emotional compounding.', phase: 'both' },
  { category: 'rules', title: 'Stop after 3 consecutive losses', content: 'Three losses in a row signals strategy-market mismatch; continuing raises loss probability.', phase: 'both' },
  { category: 'rules', title: 'No trades 30 min before or after high-impact data', content: 'Around NFP, CPI, and rate decisions, spreads widen and moves are erratic.', phase: 'entry' },
  { category: 'rules', title: 'Every trade has a stop-loss', content: 'The stop is your capital guarantee. No stop means unbounded risk. Always place it when entering.', phase: 'entry' },
  { category: 'rules', title: 'No revenge trading', content: 'Doubling down to win back losses is the single most common cause of account blow-ups. Step away.', phase: 'entry' },
  { category: 'strategy', title: 'Wait for pullback confirmation in trends', content: 'Chasing tops and bottoms in trends burns capital. Wait for retracement to support or resistance.', phase: 'entry' },
  { category: 'strategy', title: 'Require candle close to confirm breakouts', content: 'False breakouts are rampant. Wait for close above/below the level on your chosen timeframe.', phase: 'entry' },
  { category: 'strategy', title: 'Halve size on counter-trend trades', content: 'Counter-trend setups have lower win rates. Reduce size so an incorrect read stays survivable.', phase: 'entry' },
  { category: 'strategy', title: 'Require alignment across two timeframes', content: 'At least two timeframes must agree on direction before entering. Example: H4 + H1 both long.', phase: 'entry' },
  { category: 'strategy', title: 'Write entry thesis and target before placing the order', content: 'Documenting why, where to exit, and where to stop forces clarity and prevents gut-feel entries.', phase: 'entry' },
  { category: 'risk', title: 'Single-trade risk ≤ 1% of equity', content: 'Capping risk per trade means ten consecutive losses leaves 90%+ of capital intact.', phase: 'entry' },
  { category: 'risk', title: 'Max 3 open positions in same direction', content: 'Concentrated same-direction exposure amplifies drawdowns on reversal. Diversify.', phase: 'entry' },
  { category: 'risk', title: 'Skip trades with reward-to-risk below 1.5', content: 'Take only setups where potential profit is at least 1.5× the planned loss. Long term this is what pays.', phase: 'entry' },
  { category: 'risk', title: 'Move stop to breakeven after 1R profit', content: 'Once a trade is in 1R profit, trail the stop to entry. A winner never becomes a loser.', phase: 'exit' },
  { category: 'risk', title: 'Weekly loss ≤ 5% of equity', content: 'Cumulative weekly drawdown cap prevents continued bleeding in adverse market phases.', phase: 'both' },
  // Crypto perp additions (per spec §6)
  { category: 'rules', title: 'Check funding rate before holding overnight', content: 'Negative funding against your direction can exceed 100% annualized. Read the rate before every overnight hold.', phase: 'entry' },
  { category: 'rules', title: 'No trading in first 5 minutes after listing', content: 'New listings see extreme volatility, thin liquidity, and frequent wicks that liquidate even small-size positions.', phase: 'entry' },
  { category: 'rules', title: 'Close DEX positions before chain-congestion events', content: 'Major airdrop claims, protocol upgrades, or token launches spike gas and oracle lag. Exit proactively.', phase: 'entry' },
]

export function seedUserDefaults(userId) {
  const insertPair = db.prepare(
    'INSERT INTO pairs (user_id, name, asset_class, contract_size, price_precision, spread_cost, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const insertPolicy = db.prepare(
    'INSERT INTO policies (user_id, category, title, content, sort_order, phase) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const tx = db.transaction(() => {
    DEFAULT_PAIRS.forEach((p, i) => {
      insertPair.run(userId, p.name, p.asset_class, p.contract_size, p.price_precision, p.spread_cost, i)
    })
    DEFAULT_POLICIES.forEach((p, i) => {
      insertPolicy.run(userId, p.category, p.title, p.content, i, p.phase)
    })
  })
  tx()
}

export default db
```

- [ ] **Step 2: Verify db boots (no import errors) by running the server briefly.**

```bash
cd /home/lz/workspace/journal/server
node -e "import('./db.js').then(m => console.log('ok', Object.keys(m)))"
```

Expected: `ok [ 'default', 'seedUserDefaults' ]` and a log line `[db] applied migration 0001_init`. `data/journal.db` is created.

- [ ] **Step 3: Inspect that tables and migration row exist.**

```bash
cd /home/lz/workspace/journal/server
node -e "
import('better-sqlite3').then(m => {
  const Database = m.default;
  const db = new Database('data/journal.db');
  console.log('tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all().map(r => r.name));
  console.log('migrations:', db.prepare('SELECT version FROM schema_migrations').all());
});
"
```

Expected: tables list includes `users`, `magic_link_tokens`, `trades`, `pairs`, `policies`, `trade_violations`, `weekly_notes`, `monthly_notes`, `schema_migrations`. Migrations list contains `0001_init`.

- [ ] **Step 4: Commit.**

```bash
cd /home/lz/workspace/journal
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: rewrite db.js with migrations runner and English defaults

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: TDD — `server/lib/token.ts` (secure random tokens)

**Files:**
- Create: `server/lib/token.ts`
- Create: `server/__tests__/token.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `server/__tests__/token.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateMagicLinkToken, isValidTokenShape } from '../lib/token'

describe('token', () => {
  it('generateMagicLinkToken returns 32 URL-safe characters', () => {
    const t = generateMagicLinkToken()
    expect(t).toHaveLength(32)
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('generateMagicLinkToken returns unique values across 100 calls', () => {
    const set = new Set()
    for (let i = 0; i < 100; i++) set.add(generateMagicLinkToken())
    expect(set.size).toBe(100)
  })

  it('isValidTokenShape accepts output of generateMagicLinkToken', () => {
    expect(isValidTokenShape(generateMagicLinkToken())).toBe(true)
  })

  it('isValidTokenShape rejects empty string, wrong length, and invalid chars', () => {
    expect(isValidTokenShape('')).toBe(false)
    expect(isValidTokenShape('short')).toBe(false)
    expect(isValidTokenShape('a'.repeat(32) + 'extra')).toBe(false)
    expect(isValidTokenShape('x'.repeat(31) + '!')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test — expect failure.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -10
```

Expected: test fails because `../lib/token` doesn't exist.

- [ ] **Step 3: Implement `server/lib/token.ts`.**

```ts
import { randomBytes } from 'node:crypto'

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

export function generateMagicLinkToken(): string {
  // 24 bytes = 32 base64url chars
  return randomBytes(24).toString('base64url')
}

export function isValidTokenShape(s: string): boolean {
  return typeof s === 'string' && TOKEN_RE.test(s)
}
```

- [ ] **Step 4: Run the test — expect pass.**

```bash
pnpm test 2>&1 | tail -8
```

Expected: all 4 token tests pass.

- [ ] **Step 5: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: secure random magic-link token generator

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: TDD — `server/lib/resend.ts` (email sending)

**Files:**
- Create: `server/lib/resend.ts`
- Create: `server/__tests__/resend.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `server/__tests__/resend.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendMagicLinkEmail, _setResendClientForTest } from '../lib/resend'

describe('sendMagicLinkEmail', () => {
  const originalEnv = process.env.BASE_URL
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
```

- [ ] **Step 2: Run — expect failure.**

```bash
pnpm test 2>&1 | tail -8
```

Expected: fails because `../lib/resend` doesn't exist.

- [ ] **Step 3: Implement `server/lib/resend.ts`.**

```ts
import { Resend } from 'resend'

let client: { emails: { send: (opts: any) => Promise<any> } } | null = null

function getClient() {
  if (client) return client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  client = new Resend(apiKey) as any
  return client!
}

/** Test seam — allows tests to inject a stub. Not used in production. */
export function _setResendClientForTest(stub: any) {
  client = stub
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'https://journal.basiscalc.xyz'
  const url = `${baseUrl}/auth/verify?token=${token}`

  const result = await getClient().emails.send({
    from: 'noreply@basiscalc.xyz',
    to: [email],
    subject: 'Sign in to basiscalc journal',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
        <h1 style="font-size:20px;margin:0 0 16px">Sign in to basiscalc journal</h1>
        <p style="color:#555">Click the button below to sign in. This link expires in 15 minutes.</p>
        <p style="margin:24px 0">
          <a href="${url}" style="display:inline-block;background:#10b981;color:#0a0a0a;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
            Sign in &rarr;
          </a>
        </p>
        <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore it.</p>
        <p style="color:#888;font-size:12px">Direct link: <a href="${url}">${url}</a></p>
      </div>
    `.trim(),
    text: `Sign in to basiscalc journal\n\nClick the link to sign in (expires in 15 minutes):\n${url}\n\nIf you didn't request this, ignore this email.`,
  })

  if (result.error) {
    throw new Error(result.error.message ?? 'Resend returned an error')
  }
}
```

- [ ] **Step 4: Run — expect pass.**

```bash
pnpm test 2>&1 | tail -8
```

Expected: both resend tests pass.

- [ ] **Step 5: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: Resend magic-link email sender with test seam

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: TDD — `server/middleware/turnstile.js` (Cloudflare verify)

**Files:**
- Create: `server/middleware/turnstile.js`
- Create: `server/__tests__/turnstile.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `server/__tests__/turnstile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyTurnstile } from '../middleware/turnstile.js'

describe('verifyTurnstile middleware', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET = 'test-secret'
  })

  it('returns 400 when body has no turnstileToken', async () => {
    const req = { body: {}, ip: '1.2.3.4' } as any
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
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
    const req = { body: { turnstileToken: 'abc' }, ip: '1.2.3.4' } as any
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
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
    const req = { body: { turnstileToken: 'bad' }, ip: '1.2.3.4' } as any
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
    const next = vi.fn()
    await verifyTurnstile(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Turnstile verification failed' })
    expect(next).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

```bash
pnpm test 2>&1 | tail -8
```

- [ ] **Step 3: Implement `server/middleware/turnstile.js`.**

```js
export async function verifyTurnstile(req, res, next) {
  const token = req.body?.turnstileToken
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Turnstile token missing' })
  }

  const secret = process.env.TURNSTILE_SECRET
  if (!secret) {
    return res.status(500).json({ error: 'Turnstile not configured' })
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secret)
    formData.append('response', token)
    formData.append('remoteip', req.ip ?? '')

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })
    const data = await response.json()

    if (!data.success) {
      return res.status(403).json({ error: 'Turnstile verification failed' })
    }
    next()
  } catch (err) {
    res.status(502).json({ error: 'Turnstile service unreachable' })
  }
}
```

- [ ] **Step 4: Run — expect pass.**

```bash
pnpm test 2>&1 | tail -8
```

- [ ] **Step 5: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: Cloudflare Turnstile verification middleware

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Rate-limiting middleware

**Files:**
- Create: `server/middleware/rateLimit.js`

No tests for this — the `express-rate-limit` package is well-tested upstream. We only configure it.

- [ ] **Step 1: Install `express-rate-limit`.**

```bash
cd /home/lz/workspace/journal/server
pnpm add express-rate-limit
```

- [ ] **Step 2: Create `server/middleware/rateLimit.js`.**

```js
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
 * Migrate endpoint limiter: 1 per device per 10 seconds, keyed by IP.
 * Body size cap is enforced separately by express.json({ limit }).
 */
export const migrateLimiter = rateLimit({
  windowMs: 10_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Migration already in flight; retry in 10 seconds' },
})
```

- [ ] **Step 3: Commit.**

```bash
cd /home/lz/workspace/journal
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: rate limit middleware for magic-link and migrate endpoints

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: TDD — magic-link auth routes (`POST /api/auth/magic-link`, `GET /auth/verify`)

**Files:**
- Rewrite: `server/routes/auth.js`
- Create: `server/__tests__/magic-link.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `server/__tests__/magic-link.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import express from 'express'
import session from 'express-session'
import request from 'supertest'

// Tests rely on:
// 1. Swapping the resend client for a stub (via _setResendClientForTest)
// 2. Skipping Turnstile middleware in test mode (NODE_ENV=test)
// 3. Using an in-memory or temp SQLite DB; we reuse the real db.js and clean between tests.
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
  // In production index.js the same router is also mounted at /auth so that
  // GET /auth/verify works directly from email links.
  app.use('/auth', authRouter)
  return app
}

describe('magic-link auth', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test'
    process.env.BASE_URL = 'http://localhost'
  })

  beforeEach(() => {
    db.prepare('DELETE FROM magic_link_tokens').run()
    db.prepare('DELETE FROM trade_violations').run()
    db.prepare('DELETE FROM trades').run()
    db.prepare('DELETE FROM pairs').run()
    db.prepare('DELETE FROM policies').run()
    db.prepare('DELETE FROM weekly_notes').run()
    db.prepare('DELETE FROM monthly_notes').run()
    db.prepare('DELETE FROM users').run()
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

    // Seeded defaults
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
```

- [ ] **Step 2: Install supertest for test-level HTTP.**

```bash
cd /home/lz/workspace/journal/server
pnpm add -D supertest @types/supertest express-session
```

- [ ] **Step 3: Run — expect failure.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

Expected: failures because `auth.js` hasn't been rewritten. Possibly import error on old session-auth code.

- [ ] **Step 4: Rewrite `server/routes/auth.js`.**

```js
import { Router } from 'express'
import db, { seedUserDefaults } from '../db.js'
import { generateMagicLinkToken, isValidTokenShape } from '../lib/token.js'
import { sendMagicLinkEmail } from '../lib/resend.js'
import { verifyTurnstile } from '../middleware/turnstile.js'
import { magicLinkByEmail, magicLinkByIp } from '../middleware/rateLimit.js'

const router = Router()

function isEmailValid(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

// Skip Turnstile in tests to keep them deterministic.
const maybeTurnstile = process.env.NODE_ENV === 'test' ? (req, res, next) => next() : verifyTurnstile

const FIFTEEN_MIN_MS = 15 * 60 * 1000

// POST /api/auth/magic-link
router.post('/magic-link', magicLinkByIp, magicLinkByEmail, maybeTurnstile, async (req, res) => {
  const emailRaw = req.body?.email
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : ''
  if (!isEmailValid(email)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  const token = generateMagicLinkToken()
  const expiresAt = new Date(Date.now() + FIFTEEN_MIN_MS).toISOString().slice(0, 19).replace('T', ' ')

  db.prepare(
    'INSERT INTO magic_link_tokens (token, email, expires_at) VALUES (?, ?, ?)'
  ).run(token, email, expiresAt)

  try {
    await sendMagicLinkEmail(email, token)
  } catch (err) {
    // Token is already in DB; user will see "email not received" which we prefer over leaking sender errors.
    console.error('[auth] resend error:', err)
    return res.status(502).json({ error: 'Email service unavailable' })
  }

  res.json({ ok: true })
})

// GET /auth/verify?token=XXX  (mounted at app root, not /api)
router.get('/verify', (req, res) => {
  const token = String(req.query?.token ?? '')
  if (!isValidTokenShape(token)) {
    return res.status(400).send('Invalid token format')
  }

  const row = db.prepare('SELECT email, expires_at, used_at FROM magic_link_tokens WHERE token = ?').get(token)
  if (!row) return res.status(400).send('Token not recognized')
  if (row.used_at) return res.status(400).send('Token already used. Request a new sign-in email.')
  const expiresAtMs = Date.parse(row.expires_at.replace(' ', 'T') + 'Z')
  if (Date.now() > expiresAtMs) {
    return res.status(400).send('Token expired. Request a new sign-in email.')
  }

  const email = row.email
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  let userId
  if (existing) {
    userId = existing.id
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId)
  } else {
    const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email)
    userId = result.lastInsertRowid
    seedUserDefaults(userId)
  }

  db.prepare("UPDATE magic_link_tokens SET used_at = datetime('now') WHERE token = ?").run(token)

  req.session.userId = userId
  res.redirect('/app?just_signed_in=1')
})

// GET /api/auth/me — return current session user or 401
router.get('/me', (req, res) => {
  const userId = req.session?.userId
  if (!userId) return res.status(401).json({ error: 'Not signed in' })
  const user = db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(userId)
  if (!user) return res.status(401).json({ error: 'User not found' })
  res.json(user)
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }))
})

export default router
```

- [ ] **Step 5: Run tests — expect pass.**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all 4 magic-link tests pass.

- [ ] **Step 6: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: magic-link auth routes with seed on first sign-in

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Add `/api/health` endpoint

**Files:**
- Create: `server/routes/health.js`

- [ ] **Step 1: Create `server/routes/health.js`.**

```js
import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ ok: true, time: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db unavailable' })
  }
})

export default router
```

- [ ] **Step 2: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: /api/health readiness endpoint

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Rewrite `server/index.js` for new auth + security config

**Files:**
- Rewrite: `server/index.js`

The existing `index.js` wires the old session-based auth, obsolete routes, and CORS defaults. We rewrite it cleanly.

- [ ] **Step 1: Install `helmet` and `better-sqlite3-session-store`.**

```bash
cd /home/lz/workspace/journal/server
pnpm add helmet connect-better-sqlite3 express-session
```

- [ ] **Step 2: Rewrite `server/index.js`.**

```js
import express from 'express'
import session from 'express-session'
import helmet from 'helmet'
import connectBetterSqlite3 from 'connect-better-sqlite3'
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

const SqliteStore = connectBetterSqlite3(session)
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
// /api/violations and /api/trades/:id/violations mounted at root of violationsRouter
app.use('/api', requireAuth, violationsRouter)

// Static SPA fallback (Plan 2 wires the built client into public/)
app.use(express.static(path.join(__dirname, 'public')))
app.get('/app/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Root + marketing pages: placeholder until Plan 3. Return 200 so UptimeRobot is happy.
app.get('/', (req, res) => {
  res.type('text/plain').send('journal.basiscalc.xyz — under construction')
})

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`)
})
```

- [ ] **Step 3: Rewrite `server/middleware/requireAuth.js` if it still references legacy fields.**

Read the file:

```bash
cat server/middleware/requireAuth.js
```

If it references `req.session.userId`, it's already compatible with the new auth. Update to guarantee consistent shape:

```js
export default function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not signed in' })
  }
  req.userId = req.session.userId
  next()
}
```

Overwrite the file with this content.

- [ ] **Step 4: Remove any lingering imports of telegram router / routes that no longer exist.**

```bash
cd /home/lz/workspace/journal/server
grep -rn "telegram" routes/ index.js db.js 2>&1 || echo "clean"
```

Expected: `clean`. If any file still imports telegram, delete those imports.

- [ ] **Step 5: Boot the server and smoke-test health + magic-link endpoint.**

Start the server in the background and test:

```bash
cd /home/lz/workspace/journal
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test-secret NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev:server > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 2

curl -s http://localhost:3001/api/health
echo
curl -s -X POST http://localhost:3001/api/auth/magic-link \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","turnstileToken":"skip-in-test"}'
echo

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
tail -20 /tmp/server.log
```

Expected: `/api/health` returns `{"ok":true,...}`. The magic-link POST returns 502 because RESEND_API_KEY is a dummy, BUT the token row gets inserted.

```bash
cd /home/lz/workspace/journal/server
node -e "
import('better-sqlite3').then(m => {
  const db = new m.default('data/journal.db');
  console.log('tokens:', db.prepare('SELECT token, email FROM magic_link_tokens').all());
});
"
```

Expected: one token row with `email=test@example.com`.

- [ ] **Step 6: Commit.**

```bash
cd /home/lz/workspace/journal
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: rewrite server/index.js with new auth, helmet, session store

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`.**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - name: Install
        run: pnpm install --frozen-lockfile
        continue-on-error: true
      - name: Install (nested)
        run: pnpm run install:all
      - name: Test
        run: pnpm test
        env:
          NODE_ENV: test
          RESEND_API_KEY: dummy
          TURNSTILE_SECRET: dummy
          SESSION_SECRET: ci-test-secret
          BASE_URL: http://localhost
```

Note: the dual install step handles the root + client + server structure. If `pnpm install` at root succeeds fully, `install:all` is a no-op; if it doesn't, `install:all` does the recursion.

- [ ] **Step 2: Commit and push.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "ci: run vitest on push and PR

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 3: Verify CI goes green on GitHub Actions.**

Open `https://github.com/liugangdao/journal/actions` in a browser. Wait for the most recent workflow run. If any test fails in CI but passes locally, inspect the error (often environment variable mismatches) and fix in a follow-up commit.

---

## Task 14: Plan 1 smoke test and review checkpoint

Full end-to-end verification before wrapping Plan 1.

- [ ] **Step 1: Wipe the dev database and restart fresh.**

```bash
cd /home/lz/workspace/journal
rm -f server/data/journal.db server/data/journal.db-shm server/data/journal.db-wal
```

- [ ] **Step 2: Start server with real-ish env (use a temporary Resend key or keep dummy).**

```bash
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test-secret \
  NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev:server &
SERVER_PID=$!
sleep 3
```

- [ ] **Step 3: Hit each endpoint and verify DB state.**

```bash
# Health
curl -s http://localhost:3001/api/health | head -c 200 && echo

# Magic-link request (server returns 502 because Resend is dummy, but token is stored)
curl -s -X POST http://localhost:3001/api/auth/magic-link \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","turnstileToken":"skip"}' | head -c 200 && echo

# Simulate email click by reading the token and hitting /auth/verify
TOKEN=$(cd server && node -e "
import('better-sqlite3').then(m => {
  const db = new m.default('data/journal.db');
  console.log(db.prepare('SELECT token FROM magic_link_tokens WHERE email=?').get('alice@example.com').token);
});
")
echo "token=$TOKEN"

curl -s -i "http://localhost:3001/auth/verify?token=$TOKEN" | head -5

# DB verification
cd server && node -e "
import('better-sqlite3').then(m => {
  const db = new m.default('data/journal.db');
  console.log('user count:', db.prepare('SELECT COUNT(*) as c FROM users').get().c);
  console.log('pair count:', db.prepare('SELECT COUNT(*) as c FROM pairs').get().c);
  console.log('policy count:', db.prepare('SELECT COUNT(*) as c FROM policies').get().c);
  console.log('token used:', db.prepare('SELECT used_at FROM magic_link_tokens').get());
});
" && cd ..

kill $SERVER_PID 2>/dev/null
```

Expected output:
- Health: `{"ok":true,...}`
- Magic-link: `{"error":"Email service unavailable"}` with token stored
- `/auth/verify` response: `HTTP/1.1 302 Found` with `Location: /app?just_signed_in=1`
- user count: 1, pair count: 33, policy count: 18, token used: `{used_at: "2026-..."}`

- [ ] **Step 4: Run the full test suite once more.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Tag Plan 1 completion.**

```bash
git tag -a plan-1-complete -m "Plan 1 — Server foundation + magic-link auth complete"
git push --tags
git log --oneline -n 15
```

---

## Self-Review Checklist

Spec coverage — each relevant requirement mapped to a task:

- §3 V1 scope "Opt-in magic-link email sign-in with Resend" → Tasks 7, 10
- §3 V1 scope "Rate limits + Turnstile" → Tasks 8, 9, 10
- §4 Stack additions Resend, marked, vitest → Tasks 2, 3, 7
- §4 Stack removals bcryptjs → Task 2
- §4 TypeScript policy → Task 2 (tsconfig), Tasks 6-7 use `.ts` for new files
- §5 File structure server/views/, public/marketing removed, server/content/ — **Plans 2/3, not Plan 1**
- §5 File structure server/lib/, server/middleware/, server/routes/auth.js → Tasks 6-11
- §6 schema.sql with new tables and indexes → Tasks 4, 5
- §6 33 default pairs + 18 English policies → Task 5
- §6 schema_migrations runner → Task 5
- §7 anonymous + sync flow → **Plan 2** (client data layer)
- §8 asset-class-polymorphic calc → **Plan 2**
- §9 perf Fix 3+4 → Task 4 indexes present, Fix 3 (useMemo) in **Plan 2**
- §10 Testing coverage — 8 calc, 3 migrate, 4 magic-link, 4 LocalStore, 4 client calc → Plan 1 delivers 4 of the magic-link tests; server calc and migrate tests are **Plan 2**
- §12 /api/health → Task 11
- §13 Session cookies secure/sameSite/httpOnly, trust proxy, helmet, rate limits, Turnstile → Task 12 wires all, Task 8-10 implement
- §13 `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET` env vars → Task 12 reads them
- §14 Umami — **Plan 3**
- §15 AdSense — **Plan 3**
- §17 success metrics — not implemented (operational)
- §18 cost — $0 verified (all services used in Plan 1 are free tier)

Placeholder scan: no TBD/TODO/"implement later" in any task. UA-4 references Plan 3 but gives enough context.

Type consistency: `generateMagicLinkToken` returns string in Task 6 and is called in Task 10 consistently. `sendMagicLinkEmail(email, token)` signature matches across Tasks 7 and 10. `verifyTurnstile` middleware signature `(req, res, next) => Promise<void>` matches between Task 8 definition and Task 10 usage. `seedUserDefaults(userId)` exported in Task 5 and consumed in Task 10 consistently.

Gap: marketing `/` returns a placeholder 200 in Task 12 rather than real landing page. This is intentional — Plan 3 replaces it with the real landing page.

---

*End of Plan 1.*
