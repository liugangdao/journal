# Plan 2 — Client Data Layer + Migration Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a polymorphic calc module, a store-interface abstraction (LocalStore + ApiStore + `useStore` hook), a `/api/migrate` endpoint, and client wiring so the journal boots anonymous-local-first and syncs to the server on magic-link sign-in.

**Architecture:** The client gets a `JournalStore` interface with two implementations: `LocalStore` writes to IndexedDB via Dexie (used while logged out), `ApiStore` calls the Express REST API (used while logged in). A `useStore()` hook returns the correct implementation based on `/api/auth/me` response. On redirect back from `/auth/verify?...&just_signed_in=1`, the client drains its local Dexie state into the server via a new `POST /api/migrate` endpoint with `INSERT OR IGNORE` dedup keyed on `(user_id, external_id)`.

**Tech Stack:** Dexie 4, React 19, TypeScript (new files only), vitest + fake-indexeddb for client tests, tsx for the server runtime (swap off `node --watch`), express-rate-limit migrateLimiter (already exists), existing `requireAuth` middleware.

**Spec reference:** `/home/lz/workspace/journal/docs/superpowers/specs/2026-04-14-journal-basiscalc-xyz-design.md` — sections 4, 5, 6, 7, 8, 9, 10.

**Repo root for all paths below:** `/home/lz/workspace/journal/`

**Precondition:** Plan 1 complete (tag `plan-1-complete`). Server boots, magic-link auth flow passes 13 unit tests and a smoke test end-to-end.

---

## Scope

**In scope:**
- Server: switch runtime from `node --watch` to `tsx watch` so `.ts` files execute without the `.js` shadow hack left behind by Plan 1 Task 12.
- Client: TypeScript wiring for new files, shared domain types, calc polymorphism, Dexie LocalStore, ApiStore, `useStore` hook.
- Server: new `POST /api/migrate` endpoint and its test file (3 cases).
- Server: minimal updates to `routes/trades.js` and `routes/pairs.js` so the new schema columns (`asset_class`, `external_id`, `quantity`, `contract_size`, `price_precision`) round-trip through the API.
- Client: `App.jsx` reads from `useStore()`; on `?just_signed_in=1` the client drains local data to `/api/migrate` and swaps stores.

**Out of scope (Plan 3):**
- English translation of UI strings and default policies in DB (policies are already English; UI strings stay Chinese for Plan 2).
- Landing page, blog articles, about/privacy/terms pages.
- Production deployment, Docker image, Caddy, UptimeRobot.
- `routes/notes.js`, `routes/monthly-notes.js`, `routes/policies.js`, `routes/violations.js` updates beyond what migration requires (they keep working through migration because migration only adds rows, never reads existing API handlers for write paths).

---

## File Structure Created or Modified

```
journal/
├── package.json                         # modify: dev:server uses tsx
├── vitest.config.ts                     # modify: include client tests
├── client/
│   ├── tsconfig.json                    # NEW
│   ├── vite.config.js                   # modify: no change expected (Vite 7 supports TS by default)
│   ├── package.json                     # modify: add dexie, fake-indexeddb, vitest helpers
│   ├── src/
│   │   ├── App.jsx                      # modify: replace direct API calls with useStore()
│   │   ├── stores/
│   │   │   ├── types.ts                 # NEW — shared domain types
│   │   │   ├── JournalStore.ts          # NEW — interface
│   │   │   ├── LocalStore.ts            # NEW — Dexie implementation
│   │   │   └── ApiStore.ts              # NEW — fetch implementation
│   │   ├── hooks/
│   │   │   ├── useStore.ts              # NEW — store selector + migration trigger
│   │   │   └── useApi.js                # keep: ApiStore wraps it internally
│   │   └── lib/
│   │       ├── calc.ts                  # NEW — replaces calc.js
│   │       └── calc.js                  # delete
│   └── __tests__/
│       ├── calc.test.ts                 # NEW — 8 cases per spec §10
│       ├── LocalStore.test.ts           # NEW — 4 cases
│       └── ApiStore.test.ts             # NEW — 3 cases
├── server/
│   ├── index.js                         # modify: mount /api/migrate router
│   ├── lib/
│   │   ├── token.ts                     # keep (Plan 1)
│   │   ├── token.js                     # delete (shadow from Plan 1 Task 12)
│   │   ├── resend.ts                    # keep (Plan 1)
│   │   └── resend.js                    # delete (shadow from Plan 1 Task 12)
│   ├── routes/
│   │   ├── migrate.js                   # NEW
│   │   ├── trades.js                    # modify: asset_class, external_id, quantity columns
│   │   └── pairs.js                     # modify: asset_class, external_id, contract_size, price_precision columns
│   └── __tests__/
│       └── migrate.test.ts              # NEW — 3 cases
└── docs/superpowers/
    └── plans/
        └── 2026-04-14-plan-2-client-data-layer.md   (this file)
```

---

## Task 1: Swap server runtime to `tsx` and delete .js shadows

**Files:**
- Modify: `package.json` (root scripts)
- Modify: `server/package.json` (scripts)
- Delete: `server/lib/token.js`
- Delete: `server/lib/resend.js`

- [ ] **Step 1: Verify `tsx` is already a devDependency in `server/`.**

```bash
cd /home/lz/workspace/journal
grep '"tsx"' server/package.json
```

Expected: `"tsx": "^4.21.0"` or similar. If missing, `cd server && pnpm add -D tsx`.

- [ ] **Step 2: Update root `package.json` `dev:server` and `start` scripts.**

Read the current root `package.json`, then overwrite via this node one-liner:

```bash
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts['dev:server'] = 'cd server && tsx watch index.js';
pkg.scripts.start = 'cd server && tsx index.js';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
grep -E 'dev:server|start' package.json
```

Expected: both scripts now use `tsx` instead of `node`.

- [ ] **Step 3: Delete the .js shadow files for token and resend.**

```bash
rm -f server/lib/token.js server/lib/resend.js
ls server/lib/
```

Expected: `server/lib/` contains only `token.ts` and `resend.ts`.

- [ ] **Step 4: Verify imports still resolve.**

The existing `server/routes/auth.js` imports `'../lib/token.js'` and `'../lib/resend.js'`. Under tsx, these specifiers resolve to the `.ts` files via TypeScript's node resolution. Verify by running the test suite:

```bash
pnpm test 2>&1 | tail -10
```

Expected: 13 tests still pass. If imports fail with `.js` extension resolution problems, update the imports in `server/routes/auth.js` to omit the extension:

```js
import { generateMagicLinkToken, isValidTokenShape } from '../lib/token'
import { sendMagicLinkEmail } from '../lib/resend'
```

- [ ] **Step 5: Boot the server under tsx to confirm the runtime change works.**

```bash
cd /home/lz/workspace/journal
rm -f data/journal.db data/journal.db-shm data/journal.db-wal
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test \
  NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev:server > /tmp/plan2-task1.log 2>&1 &
SP=$!
sleep 4
curl -s --noproxy '*' http://localhost:3001/api/health
kill $SP 2>/dev/null
wait $SP 2>/dev/null
cat /tmp/plan2-task1.log
```

Expected:
- `/api/health` returns `{"ok":true,"time":"..."}`
- Log contains `[db] applied migration 0001_init` and `[server] listening on :3001`
- No crash on `.ts` imports

**Orphan process check:** before running any `node`/`tsx` server command in any task below, run `pkill -9 -f "node.*index.js"; pkill -9 -f "tsx.*index.js"; sleep 1`. Plan 1 Task 14 hit a production-breaking bug where orphan server processes from prior runs were holding port 3001; curl hit the stale process. Always kill orphans first.

- [ ] **Step 6: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "chore: run server under tsx, drop .ts→.js shadow files

Plan 1 Task 12 hacked in .js shadow files for token/resend because
node --watch can't load TypeScript. Switching dev:server and start
to tsx removes the need and eliminates the drift risk between the
.ts and .js versions.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Add client TypeScript support

**Files:**
- Create: `client/tsconfig.json`
- Modify: `vitest.config.ts` (root)

- [ ] **Step 1: Create `client/tsconfig.json`.**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx", "__tests__/**/*.ts", "__tests__/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Install client TypeScript types and vitest helpers.**

```bash
cd /home/lz/workspace/journal/client
pnpm add -D typescript @types/react @types/react-dom
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react
pnpm add -D fake-indexeddb
```

Use `dangerouslyDisableSandbox: true` on the Bash calls if pnpm needs network.

`fake-indexeddb` is the test harness used in Task 5 for LocalStore tests.

- [ ] **Step 3: Update `vitest.config.ts` at repo root to include client tests.**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['server/**', 'node'],
      ['client/**', 'jsdom'],
    ],
    include: [
      'server/**/__tests__/**/*.test.{ts,js}',
      'client/**/__tests__/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**'],
  },
})
```

Install `@vitejs/plugin-react` at repo root if it isn't already (Step 2 adds it inside `client/`; vitest reads `vitest.config.ts` at root so the plugin import needs to resolve from there):

```bash
cd /home/lz/workspace/journal
pnpm add -D @vitejs/plugin-react -w 2>&1 || pnpm add -D @vitejs/plugin-react
```

- [ ] **Step 4: Smoke-test the config.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

Expected: 13 existing tests still pass. Vitest may report "No client tests found" — that's fine; we add them in Task 3.

If vitest crashes because of a config error (e.g., jsdom missing), install the missing package at repo root.

- [ ] **Step 5: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "chore: add client TypeScript + vitest config

Enables .ts / .tsx authoring under client/src. Vitest picks up both
server (node) and client (jsdom) tests with environmentMatchGlobs.
Existing .jsx files continue to work unchanged.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: Polymorphic `calc.ts` with 8 test cases

**Files:**
- Delete: `client/src/lib/calc.js`
- Create: `client/src/lib/calc.ts`
- Create: `client/__tests__/calc.test.ts`

- [ ] **Step 1: Read the legacy `calc.js` to understand its current API.**

```bash
cat /home/lz/workspace/journal/client/src/lib/calc.js
```

Note the exported function names (`calcTrade`, `calcStats`, or similar) and the shape of the `trade` parameter. The new TS version preserves those exports; callers should not need changes.

- [ ] **Step 2: Write the failing test at `client/__tests__/calc.test.ts`.**

```ts
import { describe, it, expect } from 'vitest'
import { calcTrade, type Trade, type Pair } from '../src/lib/calc'

const eurusd: Pair = {
  name: 'EUR/USD',
  asset_class: 'forex',
  contract_size: 100000,
  price_precision: 5,
  spread_cost: 3.5,
}
const xauusd: Pair = {
  name: 'XAU/USD',
  asset_class: 'metals',
  contract_size: 100,
  price_precision: 2,
  spread_cost: 12,
}
const usoil: Pair = {
  name: 'USOil',
  asset_class: 'energy',
  contract_size: 1000,
  price_precision: 2,
  spread_cost: 5,
}
const btc: Pair = {
  name: 'BTC/USDT',
  asset_class: 'crypto_perp',
  contract_size: 1,
  price_precision: 2,
  spread_cost: 0,
}

describe('calcTrade — forex', () => {
  it('long EUR/USD 1 lot: pips and pnl match expected', () => {
    const trade: Trade = {
      pair: 'EUR/USD',
      asset_class: 'forex',
      direction: 'long',
      lots: 1,
      entry: 1.1000,
      stop: 1.0950,
      exit_price: 1.1050,
      status: 'closed',
    }
    const out = calcTrade(trade, eurusd)
    expect(out.pips).toBeCloseTo(50, 1)
    expect(out.grossPnl).toBeCloseTo(500, 0) // 50 pips * 10 per pip
  })

  it('short EUR/USD 1 lot with stop 50 pips above entry: losing stop = -500', () => {
    const trade: Trade = {
      pair: 'EUR/USD',
      asset_class: 'forex',
      direction: 'short',
      lots: 1,
      entry: 1.1000,
      stop: 1.1050,
      exit_price: 1.1050,
      status: 'closed',
    }
    const out = calcTrade(trade, eurusd)
    expect(out.pips).toBeCloseTo(-50, 1)
    expect(out.grossPnl).toBeCloseTo(-500, 0)
  })
})

describe('calcTrade — metals', () => {
  it('long XAU/USD 0.1 lot from 2000 to 2010: 10 pts * 10 = $100', () => {
    const trade: Trade = {
      pair: 'XAU/USD',
      asset_class: 'metals',
      direction: 'long',
      lots: 0.1,
      entry: 2000,
      stop: 1990,
      exit_price: 2010,
      status: 'closed',
    }
    const out = calcTrade(trade, xauusd)
    expect(out.grossPnl).toBeCloseTo(100, 0) // 10 * 100 * 0.1
  })

  it('short XAG/USD 1 lot from 25 to 24: $1 move * 5000 = $5000', () => {
    const xag: Pair = {
      name: 'XAG/USD',
      asset_class: 'metals',
      contract_size: 5000,
      price_precision: 3,
      spread_cost: 10,
    }
    const trade: Trade = {
      pair: 'XAG/USD',
      asset_class: 'metals',
      direction: 'short',
      lots: 1,
      entry: 25,
      stop: 26,
      exit_price: 24,
      status: 'closed',
    }
    const out = calcTrade(trade, xag)
    expect(out.grossPnl).toBeCloseTo(5000, 0)
  })
})

describe('calcTrade — energy', () => {
  it('long USOil 1 lot from 80 to 82: $2 * 1000 = $2000', () => {
    const trade: Trade = {
      pair: 'USOil',
      asset_class: 'energy',
      direction: 'long',
      lots: 1,
      entry: 80,
      stop: 78,
      exit_price: 82,
      status: 'closed',
    }
    const out = calcTrade(trade, usoil)
    expect(out.grossPnl).toBeCloseTo(2000, 0)
  })
})

describe('calcTrade — crypto perp', () => {
  it('uses user-entered gross_pnl directly, does not recompute', () => {
    const trade: Trade = {
      pair: 'BTC/USDT',
      asset_class: 'crypto_perp',
      direction: 'long',
      quantity: 0.5,
      entry: 60000,
      stop: 58000,
      exit_price: 62000,
      gross_pnl: 950, // user entered
      status: 'closed',
    }
    const out = calcTrade(trade, btc)
    expect(out.grossPnl).toBe(950)
  })

  it('R-multiple when risk_amount is provided: gross_pnl / risk_amount', () => {
    const trade: Trade = {
      pair: 'BTC/USDT',
      asset_class: 'crypto_perp',
      direction: 'long',
      quantity: 0.5,
      entry: 60000,
      stop: 58000,
      exit_price: 62000,
      gross_pnl: 1000,
      risk_amount: 500,
      status: 'closed',
    }
    const out = calcTrade(trade, btc)
    expect(out.rMultiple).toBe(2)
  })

  it('returns null R-multiple when risk_amount missing', () => {
    const trade: Trade = {
      pair: 'BTC/USDT',
      asset_class: 'crypto_perp',
      direction: 'short',
      quantity: 1,
      entry: 60000,
      stop: 62000,
      exit_price: 58000,
      gross_pnl: 2000,
      status: 'closed',
    }
    const out = calcTrade(trade, btc)
    expect(out.rMultiple).toBeNull()
  })

  it('throws when direction is missing', () => {
    const trade: any = {
      pair: 'BTC/USDT',
      asset_class: 'crypto_perp',
      entry: 60000,
      stop: 58000,
      exit_price: 62000,
      gross_pnl: 1000,
      status: 'closed',
    }
    expect(() => calcTrade(trade, btc)).toThrow(/direction/i)
  })
})
```

- [ ] **Step 3: Run the test — expect failure.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

Expected: fails because `../src/lib/calc` does not exist.

- [ ] **Step 4: Implement `client/src/lib/calc.ts`.**

```ts
export type AssetClass = 'forex' | 'metals' | 'energy' | 'crypto_perp'
export type Direction = 'long' | 'short'
export type TradeStatus = 'open' | 'closed' | 'missed'

export interface Pair {
  name: string
  asset_class: AssetClass
  contract_size: number
  price_precision: number
  spread_cost: number
}

export interface Trade {
  pair: string
  asset_class: AssetClass
  direction: Direction
  lots?: number
  quantity?: number
  entry: number
  stop: number
  target?: number
  exit_price?: number
  gross_pnl?: number
  risk_amount?: number
  status: TradeStatus
}

export interface TradeCalcOutput {
  pips: number | null
  grossPnl: number | null
  rMultiple: number | null
}

export function calcTrade(trade: Trade, pair: Pair): TradeCalcOutput {
  if (!trade.direction) throw new Error('Trade direction missing')
  if (trade.asset_class !== pair.asset_class) {
    throw new Error(`Trade asset_class ${trade.asset_class} does not match pair ${pair.asset_class}`)
  }

  switch (trade.asset_class) {
    case 'crypto_perp':
      return calcCrypto(trade)
    case 'forex':
    case 'metals':
    case 'energy':
      return calcPipBased(trade, pair)
  }
}

function calcCrypto(trade: Trade): TradeCalcOutput {
  const grossPnl = trade.gross_pnl ?? null
  const rMultiple =
    grossPnl !== null && trade.risk_amount && trade.risk_amount !== 0
      ? grossPnl / trade.risk_amount
      : null
  return { pips: null, grossPnl, rMultiple }
}

function calcPipBased(trade: Trade, pair: Pair): TradeCalcOutput {
  if (trade.exit_price == null) {
    return { pips: null, grossPnl: null, rMultiple: null }
  }

  const sign = trade.direction === 'long' ? 1 : -1
  const priceDelta = (trade.exit_price - trade.entry) * sign
  const lots = trade.lots ?? 0
  const grossPnl = priceDelta * pair.contract_size * lots

  // Pips: forex 4/5-digit → multiplier 10000; 2/3-digit JPY → 100; metals/energy → 1:1 pts.
  const pipMultiplier =
    pair.asset_class === 'forex'
      ? (pair.price_precision >= 4 ? 10000 : 100)
      : 1
  const pips = priceDelta * pipMultiplier

  const rMultiple =
    trade.risk_amount && trade.risk_amount !== 0
      ? grossPnl / trade.risk_amount
      : null

  return { pips, grossPnl, rMultiple }
}
```

- [ ] **Step 5: Delete the legacy `calc.js`.**

```bash
rm -f /home/lz/workspace/journal/client/src/lib/calc.js
ls /home/lz/workspace/journal/client/src/lib/
```

Expected: `calc.ts` present, `calc.js` gone. Other files in lib/ (like `constants.js`) untouched.

- [ ] **Step 6: Run the test — expect pass.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

Expected: 8 calc tests pass (13 + 8 = 21 total).

If any test fails, inspect the expected value and fix the implementation. Do NOT modify the test expectations.

- [ ] **Step 7: Check that any existing client code that imported `calc.js` still works.**

```bash
grep -rn "from '.*lib/calc'" client/src/ --include="*.jsx" --include="*.js" --include="*.ts" --include="*.tsx"
```

The existing `App.jsx` (JSX) likely imports `./lib/calc` with no extension. Node/Vite will resolve to `calc.ts` now — this works in Vite + dev mode. If an import explicitly says `.js`, change it to extensionless:

```js
// bad
import { calcTrade } from './lib/calc.js'
// good
import { calcTrade } from './lib/calc'
```

Do NOT refactor `App.jsx` beyond fixing the import path. The full wiring into `useStore` happens in Task 11.

- [ ] **Step 8: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: polymorphic calc.ts with asset_class dispatch and 8 tests

Replaces calc.js. Dispatches on asset_class: pip-based math for
forex/metals/energy, user-entered gross_pnl for crypto_perp.
R-multiple is gross_pnl / risk_amount when available.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: Shared domain types

**Files:**
- Create: `client/src/stores/types.ts`

Note: `calc.ts` already exports `Trade`, `Pair`, `AssetClass`, `Direction`, `TradeStatus`. This task adds the rest of the domain types that the stores need.

- [ ] **Step 1: Create `client/src/stores/types.ts`.**

```ts
import type { Trade, Pair, AssetClass, Direction, TradeStatus } from '../lib/calc'

export type { Trade, Pair, AssetClass, Direction, TradeStatus }

export interface TradeRow extends Trade {
  id?: number
  external_id: string
  open_time: string
  close_time?: string | null
  strategy: string
  timeframe: string
  swap?: number
  score?: string | null
  emotion?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface WeeklyNote {
  id?: number
  external_id: string
  week: string // 'YYYY-Www'
  lesson?: string
  plan?: string
  created_at?: string
}

export interface MonthlyNote {
  id?: number
  external_id: string
  month: string // 'YYYY-MM'
  lesson?: string
  plan?: string
  created_at?: string
}

export interface PolicyRow {
  id?: number
  external_id: string
  category: string
  title: string
  content: string
  sort_order: number
  is_active: number
  phase: 'entry' | 'exit' | 'both'
  created_at?: string
  updated_at?: string
}

export interface PairRow extends Pair {
  id?: number
  external_id: string
  sort_order: number
}

export interface TradeViolation {
  id?: number
  trade_external_id: string // resolved to trade_id on migrate
  policy_external_id: string // resolved to policy_id on migrate
  notes?: string
  created_at?: string
}

/** Payload for POST /api/migrate — mirrors what LocalStore.exportAll returns */
export interface MigratePayload {
  trades: TradeRow[]
  weekly_notes: WeeklyNote[]
  monthly_notes: MonthlyNote[]
  policies: PolicyRow[]
  pairs: PairRow[]
  trade_violations: TradeViolation[]
}
```

- [ ] **Step 2: Smoke test — verify the file type-checks.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -8
```

Expected: 21 tests still pass (types.ts has no runtime code).

- [ ] **Step 3: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: shared domain types for stores

TradeRow extends calc's Trade with DB-only fields (id, external_id,
timestamps). WeeklyNote/MonthlyNote/PolicyRow/PairRow/TradeViolation
mirror the server schema. MigratePayload is the POST body shape.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: Install Dexie + `LocalStore` with TDD

**Files:**
- Create: `client/src/stores/JournalStore.ts`
- Create: `client/src/stores/LocalStore.ts`
- Create: `client/__tests__/LocalStore.test.ts`

- [ ] **Step 1: Install Dexie in the client package.**

```bash
cd /home/lz/workspace/journal/client
pnpm add dexie
```

Use `dangerouslyDisableSandbox: true` if the install needs network.

- [ ] **Step 2: Define the store interface at `client/src/stores/JournalStore.ts`.**

```ts
import type {
  TradeRow,
  WeeklyNote,
  MonthlyNote,
  PolicyRow,
  PairRow,
  TradeViolation,
  MigratePayload,
} from './types'

export interface JournalStore {
  // Trades
  listTrades(): Promise<TradeRow[]>
  addTrade(trade: Omit<TradeRow, 'id'>): Promise<TradeRow>
  updateTrade(externalId: string, patch: Partial<TradeRow>): Promise<TradeRow>
  deleteTrade(externalId: string): Promise<void>

  // Notes
  listWeeklyNotes(): Promise<WeeklyNote[]>
  upsertWeeklyNote(note: WeeklyNote): Promise<WeeklyNote>
  deleteWeeklyNote(externalId: string): Promise<void>

  listMonthlyNotes(): Promise<MonthlyNote[]>
  upsertMonthlyNote(note: MonthlyNote): Promise<MonthlyNote>
  deleteMonthlyNote(externalId: string): Promise<void>

  // Policies & pairs & violations
  listPolicies(): Promise<PolicyRow[]>
  upsertPolicy(policy: PolicyRow): Promise<PolicyRow>
  deletePolicy(externalId: string): Promise<void>

  listPairs(): Promise<PairRow[]>
  upsertPair(pair: PairRow): Promise<PairRow>
  deletePair(externalId: string): Promise<void>

  listViolationsForTrade(tradeExternalId: string): Promise<TradeViolation[]>
  setViolationsForTrade(tradeExternalId: string, policyExternalIds: string[]): Promise<void>

  // Bulk
  exportAll(): Promise<MigratePayload>
  clearAll(): Promise<void>
}
```

- [ ] **Step 3: Write the failing test at `client/__tests__/LocalStore.test.ts`.**

```ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { LocalStore } from '../src/stores/LocalStore'
import type { TradeRow } from '../src/stores/types'

function mkTrade(external_id: string, overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    external_id,
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
    ...overrides,
  }
}

describe('LocalStore', () => {
  let store: LocalStore

  beforeEach(async () => {
    store = new LocalStore(`test-${Math.random()}`)
    await store.clearAll()
  })

  it('addTrade + listTrades round-trip', async () => {
    await store.addTrade(mkTrade('ext-1'))
    await store.addTrade(mkTrade('ext-2', { pair: 'GBP/USD' }))
    const trades = await store.listTrades()
    expect(trades).toHaveLength(2)
    expect(trades.map((t) => t.external_id).sort()).toEqual(['ext-1', 'ext-2'])
  })

  it('deleteTrade removes by external_id', async () => {
    await store.addTrade(mkTrade('keep'))
    await store.addTrade(mkTrade('remove'))
    await store.deleteTrade('remove')
    const trades = await store.listTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0].external_id).toBe('keep')
  })

  it('exportAll returns a MigratePayload snapshot', async () => {
    await store.addTrade(mkTrade('t1'))
    await store.upsertWeeklyNote({ external_id: 'w1', week: '2026-W15', lesson: 'nice' })
    await store.upsertMonthlyNote({ external_id: 'm1', month: '2026-04', lesson: 'nice' })
    const snap = await store.exportAll()
    expect(snap.trades).toHaveLength(1)
    expect(snap.weekly_notes).toHaveLength(1)
    expect(snap.monthly_notes).toHaveLength(1)
    expect(snap.policies).toEqual([])
    expect(snap.pairs).toEqual([])
    expect(snap.trade_violations).toEqual([])
  })

  it('clearAll empties every table', async () => {
    await store.addTrade(mkTrade('t1'))
    await store.upsertWeeklyNote({ external_id: 'w1', week: '2026-W15' })
    await store.clearAll()
    const snap = await store.exportAll()
    expect(snap.trades).toEqual([])
    expect(snap.weekly_notes).toEqual([])
  })
})
```

- [ ] **Step 4: Run — expect failure.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

- [ ] **Step 5: Implement `client/src/stores/LocalStore.ts`.**

```ts
import Dexie, { type Table } from 'dexie'
import type {
  TradeRow,
  WeeklyNote,
  MonthlyNote,
  PolicyRow,
  PairRow,
  TradeViolation,
  MigratePayload,
} from './types'
import type { JournalStore } from './JournalStore'

class JournalDB extends Dexie {
  trades!: Table<TradeRow, string>
  weekly_notes!: Table<WeeklyNote, string>
  monthly_notes!: Table<MonthlyNote, string>
  policies!: Table<PolicyRow, string>
  pairs!: Table<PairRow, string>
  trade_violations!: Table<TradeViolation & { id?: number }, number>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      trades: 'external_id, open_time, pair',
      weekly_notes: 'external_id, week',
      monthly_notes: 'external_id, month',
      policies: 'external_id, sort_order',
      pairs: 'external_id, sort_order',
      trade_violations: '++id, trade_external_id',
    })
  }
}

export class LocalStore implements JournalStore {
  private db: JournalDB

  constructor(dbName = 'journalLocal') {
    this.db = new JournalDB(dbName)
  }

  async listTrades(): Promise<TradeRow[]> {
    return this.db.trades.orderBy('open_time').reverse().toArray()
  }

  async addTrade(trade: Omit<TradeRow, 'id'>): Promise<TradeRow> {
    await this.db.trades.put(trade as TradeRow)
    return trade as TradeRow
  }

  async updateTrade(externalId: string, patch: Partial<TradeRow>): Promise<TradeRow> {
    const current = await this.db.trades.get(externalId)
    if (!current) throw new Error(`trade not found: ${externalId}`)
    const next = { ...current, ...patch, external_id: externalId } as TradeRow
    await this.db.trades.put(next)
    return next
  }

  async deleteTrade(externalId: string): Promise<void> {
    await this.db.trades.delete(externalId)
  }

  async listWeeklyNotes(): Promise<WeeklyNote[]> {
    return this.db.weekly_notes.orderBy('week').reverse().toArray()
  }

  async upsertWeeklyNote(note: WeeklyNote): Promise<WeeklyNote> {
    await this.db.weekly_notes.put(note)
    return note
  }

  async deleteWeeklyNote(externalId: string): Promise<void> {
    await this.db.weekly_notes.delete(externalId)
  }

  async listMonthlyNotes(): Promise<MonthlyNote[]> {
    return this.db.monthly_notes.orderBy('month').reverse().toArray()
  }

  async upsertMonthlyNote(note: MonthlyNote): Promise<MonthlyNote> {
    await this.db.monthly_notes.put(note)
    return note
  }

  async deleteMonthlyNote(externalId: string): Promise<void> {
    await this.db.monthly_notes.delete(externalId)
  }

  async listPolicies(): Promise<PolicyRow[]> {
    return this.db.policies.orderBy('sort_order').toArray()
  }

  async upsertPolicy(policy: PolicyRow): Promise<PolicyRow> {
    await this.db.policies.put(policy)
    return policy
  }

  async deletePolicy(externalId: string): Promise<void> {
    await this.db.policies.delete(externalId)
  }

  async listPairs(): Promise<PairRow[]> {
    return this.db.pairs.orderBy('sort_order').toArray()
  }

  async upsertPair(pair: PairRow): Promise<PairRow> {
    await this.db.pairs.put(pair)
    return pair
  }

  async deletePair(externalId: string): Promise<void> {
    await this.db.pairs.delete(externalId)
  }

  async listViolationsForTrade(tradeExternalId: string): Promise<TradeViolation[]> {
    return this.db.trade_violations.where('trade_external_id').equals(tradeExternalId).toArray()
  }

  async setViolationsForTrade(tradeExternalId: string, policyExternalIds: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.trade_violations, async () => {
      await this.db.trade_violations.where('trade_external_id').equals(tradeExternalId).delete()
      for (const policyExternalId of policyExternalIds) {
        await this.db.trade_violations.add({
          trade_external_id: tradeExternalId,
          policy_external_id: policyExternalId,
        })
      }
    })
  }

  async exportAll(): Promise<MigratePayload> {
    const [trades, weekly_notes, monthly_notes, policies, pairs, trade_violations] = await Promise.all([
      this.db.trades.toArray(),
      this.db.weekly_notes.toArray(),
      this.db.monthly_notes.toArray(),
      this.db.policies.toArray(),
      this.db.pairs.toArray(),
      this.db.trade_violations.toArray(),
    ])
    return {
      trades,
      weekly_notes,
      monthly_notes,
      policies,
      pairs,
      trade_violations: trade_violations.map(({ id, ...rest }) => rest),
    }
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.trades,
      this.db.weekly_notes,
      this.db.monthly_notes,
      this.db.policies,
      this.db.pairs,
      this.db.trade_violations,
      async () => {
        await Promise.all([
          this.db.trades.clear(),
          this.db.weekly_notes.clear(),
          this.db.monthly_notes.clear(),
          this.db.policies.clear(),
          this.db.pairs.clear(),
          this.db.trade_violations.clear(),
        ])
      }
    )
  }
}
```

- [ ] **Step 6: Run — expect pass.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

Expected: 4 LocalStore tests pass (13 + 8 + 4 = 25 total).

- [ ] **Step 7: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: Dexie-backed LocalStore implementing JournalStore

Anonymous users write to this store. Trades, notes, policies, pairs,
and trade_violations all keyed by external_id. exportAll returns a
MigratePayload for the /api/migrate endpoint.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: `ApiStore` with TDD

**Files:**
- Create: `client/src/stores/ApiStore.ts`
- Create: `client/__tests__/ApiStore.test.ts`

- [ ] **Step 1: Write the failing test at `client/__tests__/ApiStore.test.ts`.**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiStore } from '../src/stores/ApiStore'
import type { TradeRow } from '../src/stores/types'

function mkTrade(external_id: string): TradeRow {
  return {
    external_id,
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
}

describe('ApiStore', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('listTrades calls GET /api/trades and returns body.trades', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ trades: [mkTrade('a'), mkTrade('b')], total: 2 }),
    })
    const store = new ApiStore()
    const result = await store.listTrades()
    expect(fetchMock).toHaveBeenCalledWith('/api/trades', expect.objectContaining({ credentials: 'include' }))
    expect(result).toHaveLength(2)
  })

  it('addTrade calls POST /api/trades with the payload', async () => {
    const trade = mkTrade('new')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => trade,
    })
    const store = new ApiStore()
    const result = await store.addTrade(trade)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trades',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    )
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
    expect(body.external_id).toBe('new')
    expect(result.external_id).toBe('new')
  })

  it('throws on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    })
    const store = new ApiStore()
    await expect(store.listTrades()).rejects.toThrow(/boom/)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

- [ ] **Step 3: Implement `client/src/stores/ApiStore.ts`.**

```ts
import type {
  TradeRow,
  WeeklyNote,
  MonthlyNote,
  PolicyRow,
  PairRow,
  TradeViolation,
  MigratePayload,
} from './types'
import type { JournalStore } from './JournalStore'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function request<T>(path: string, method: HttpMethod = 'GET', body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
  }
  if (body !== undefined) init.body = JSON.stringify(body)

  const res = await fetch(path, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = (data && (data as any).error) || res.statusText || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

export class ApiStore implements JournalStore {
  async listTrades(): Promise<TradeRow[]> {
    const res = await request<{ trades: TradeRow[] }>('/api/trades')
    return res.trades ?? []
  }

  async addTrade(trade: Omit<TradeRow, 'id'>): Promise<TradeRow> {
    return request<TradeRow>('/api/trades', 'POST', trade)
  }

  async updateTrade(externalId: string, patch: Partial<TradeRow>): Promise<TradeRow> {
    // Server exposes id-based endpoints; we resolve external_id → id server-side in Task 9.
    return request<TradeRow>(`/api/trades/by-external/${encodeURIComponent(externalId)}`, 'PUT', patch)
  }

  async deleteTrade(externalId: string): Promise<void> {
    await request<void>(`/api/trades/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listWeeklyNotes(): Promise<WeeklyNote[]> {
    return request<WeeklyNote[]>('/api/notes')
  }

  async upsertWeeklyNote(note: WeeklyNote): Promise<WeeklyNote> {
    return request<WeeklyNote>('/api/notes', 'POST', note)
  }

  async deleteWeeklyNote(externalId: string): Promise<void> {
    await request<void>(`/api/notes/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listMonthlyNotes(): Promise<MonthlyNote[]> {
    return request<MonthlyNote[]>('/api/monthly-notes')
  }

  async upsertMonthlyNote(note: MonthlyNote): Promise<MonthlyNote> {
    return request<MonthlyNote>('/api/monthly-notes', 'POST', note)
  }

  async deleteMonthlyNote(externalId: string): Promise<void> {
    await request<void>(`/api/monthly-notes/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listPolicies(): Promise<PolicyRow[]> {
    return request<PolicyRow[]>('/api/policies')
  }

  async upsertPolicy(policy: PolicyRow): Promise<PolicyRow> {
    return request<PolicyRow>('/api/policies', 'POST', policy)
  }

  async deletePolicy(externalId: string): Promise<void> {
    await request<void>(`/api/policies/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listPairs(): Promise<PairRow[]> {
    return request<PairRow[]>('/api/pairs')
  }

  async upsertPair(pair: PairRow): Promise<PairRow> {
    return request<PairRow>('/api/pairs', 'POST', pair)
  }

  async deletePair(externalId: string): Promise<void> {
    await request<void>(`/api/pairs/by-external/${encodeURIComponent(externalId)}`, 'DELETE')
  }

  async listViolationsForTrade(tradeExternalId: string): Promise<TradeViolation[]> {
    return request<TradeViolation[]>(
      `/api/trades/by-external/${encodeURIComponent(tradeExternalId)}/violations`
    )
  }

  async setViolationsForTrade(tradeExternalId: string, policyExternalIds: string[]): Promise<void> {
    await request<void>(
      `/api/trades/by-external/${encodeURIComponent(tradeExternalId)}/violations`,
      'PUT',
      { policy_external_ids: policyExternalIds }
    )
  }

  async exportAll(): Promise<MigratePayload> {
    return request<MigratePayload>('/api/export')
  }

  async clearAll(): Promise<void> {
    // Server never exposes a "clear all" endpoint for authenticated users. This is a no-op on the
    // server-side store; LocalStore implements it because it runs locally.
    return Promise.resolve()
  }
}
```

Note: `by-external/:external_id` routes are added in Task 9 where the server routes get updated. The ApiStore is written to call them; tests mock fetch so they pass before the server implements those paths.

- [ ] **Step 4: Run — expect pass.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

Expected: 3 ApiStore tests pass (13 + 8 + 4 + 3 = 28 total).

- [ ] **Step 5: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: fetch-based ApiStore implementing JournalStore

Calls the Express REST API using credentialed fetch. External-id-
keyed endpoints (by-external/:id) are added to server routes in a
later task; ApiStore is written to call them and tests mock fetch.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: `useStore()` hook

**Files:**
- Create: `client/src/hooks/useStore.ts`

- [ ] **Step 1: Create `client/src/hooks/useStore.ts`.**

```ts
import { useEffect, useState } from 'react'
import { LocalStore } from '../stores/LocalStore'
import { ApiStore } from '../stores/ApiStore'
import type { JournalStore } from '../stores/JournalStore'

const localStoreSingleton = new LocalStore()
const apiStoreSingleton = new ApiStore()

export interface StoreState {
  store: JournalStore
  isAuthenticated: boolean
  userEmail: string | null
  loading: boolean
}

export function useStore(): StoreState {
  const [state, setState] = useState<StoreState>({
    store: localStoreSingleton,
    isAuthenticated: false,
    userEmail: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const user = (await res.json()) as { email: string }
          setState({
            store: apiStoreSingleton,
            isAuthenticated: true,
            userEmail: user.email,
            loading: false,
          })
        } else {
          setState({
            store: localStoreSingleton,
            isAuthenticated: false,
            userEmail: null,
            loading: false,
          })
        }
      } catch {
        if (cancelled) return
        setState({
          store: localStoreSingleton,
          isAuthenticated: false,
          userEmail: null,
          loading: false,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function getLocalStore(): LocalStore {
  return localStoreSingleton
}

export function getApiStore(): ApiStore {
  return apiStoreSingleton
}
```

- [ ] **Step 2: Run the test suite to catch any TypeScript/import errors.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -8
```

Expected: 28 tests still pass. No dedicated test for this hook in Plan 2 — it's thin glue; Task 12 end-to-end manual test exercises it.

- [ ] **Step 3: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: useStore hook selects LocalStore or ApiStore based on session

Pings /api/auth/me once on mount. 200 → ApiStore, 401 or network
error → LocalStore. Singletons are shared across the app so they
don't recreate on every re-render.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 8: `POST /api/migrate` endpoint with 3 TDD tests

**Files:**
- Create: `server/routes/migrate.js`
- Create: `server/__tests__/migrate.test.ts`
- Modify: `server/index.js`

- [ ] **Step 1: Write the failing test at `server/__tests__/migrate.test.ts`.**

```ts
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
    ;(req as any).session.userId = userId
    ;(req as any).userId = userId
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

    expect(db.prepare('SELECT COUNT(*) FROM trades WHERE user_id = ?').pluck().get(userId)).toBe(1)
    expect(db.prepare('SELECT COUNT(*) FROM pairs WHERE user_id = ?').pluck().get(userId)).toBe(1)
    expect(db.prepare('SELECT COUNT(*) FROM policies WHERE user_id = ?').pluck().get(userId)).toBe(1)
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
    const emptyRest = { weekly_notes: [], monthly_notes: [], policies: [], pairs: [], trade_violations: [] }

    const first = await request(app).post('/api/migrate').send({ trades: [trade], ...emptyRest }).expect(200)
    expect(first.body.trades).toBe(1)

    const second = await request(app).post('/api/migrate').send({ trades: [trade], ...emptyRest }).expect(200)
    expect(second.body.trades).toBe(0)

    expect(db.prepare('SELECT COUNT(*) FROM trades WHERE user_id = ?').pluck().get(userId)).toBe(1)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

- [ ] **Step 3: Create `server/routes/migrate.js`.**

```js
import { Router } from 'express'
import db from '../db.js'

const router = Router()

const TRADE_COLS = [
  'user_id', 'external_id', 'open_time', 'close_time', 'pair', 'asset_class',
  'direction', 'strategy', 'timeframe', 'lots', 'quantity', 'entry', 'stop',
  'target', 'exit_price', 'gross_pnl', 'swap', 'risk_amount', 'score',
  'emotion', 'notes', 'status',
]

const PAIR_COLS = [
  'user_id', 'external_id', 'name', 'asset_class', 'contract_size',
  'price_precision', 'spread_cost', 'sort_order',
]

const POLICY_COLS = [
  'user_id', 'external_id', 'category', 'title', 'content', 'sort_order',
  'is_active', 'phase',
]

const WEEKLY_COLS = ['user_id', 'external_id', 'week', 'lesson', 'plan']
const MONTHLY_COLS = ['user_id', 'external_id', 'month', 'lesson', 'plan']

function buildInsert(table, cols) {
  const placeholders = cols.map(() => '?').join(', ')
  return db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
}

function pickValues(cols, row, defaults = {}) {
  return cols.map((c) => {
    if (c === 'user_id') return defaults.user_id
    const v = row[c]
    return v === undefined ? null : v
  })
}

// POST /api/migrate
router.post('/', (req, res) => {
  const userId = req.userId
  if (!userId) return res.status(401).json({ error: 'Not signed in' })

  const payload = req.body ?? {}
  const arrays = {
    trades: Array.isArray(payload.trades) ? payload.trades : [],
    weekly_notes: Array.isArray(payload.weekly_notes) ? payload.weekly_notes : [],
    monthly_notes: Array.isArray(payload.monthly_notes) ? payload.monthly_notes : [],
    policies: Array.isArray(payload.policies) ? payload.policies : [],
    pairs: Array.isArray(payload.pairs) ? payload.pairs : [],
    trade_violations: Array.isArray(payload.trade_violations) ? payload.trade_violations : [],
  }

  const totalRecords =
    arrays.trades.length +
    arrays.weekly_notes.length +
    arrays.monthly_notes.length +
    arrays.policies.length +
    arrays.pairs.length +
    arrays.trade_violations.length
  if (totalRecords > 10000) {
    return res.status(413).json({ error: 'Migration batch too large (max 10,000 records)' })
  }

  const insertTrade = buildInsert('trades', TRADE_COLS)
  const insertPair = buildInsert('pairs', PAIR_COLS)
  const insertPolicy = buildInsert('policies', POLICY_COLS)
  const insertWeekly = buildInsert('weekly_notes', WEEKLY_COLS)
  const insertMonthly = buildInsert('monthly_notes', MONTHLY_COLS)
  const insertViolation = db.prepare(`
    INSERT INTO trade_violations (trade_id, policy_id, notes)
    SELECT t.id, p.id, ?
    FROM trades t, policies p
    WHERE t.user_id = ? AND t.external_id = ?
      AND p.user_id = ? AND p.external_id = ?
  `)

  const counts = { trades: 0, weekly_notes: 0, monthly_notes: 0, policies: 0, pairs: 0, trade_violations: 0 }

  const run = db.transaction(() => {
    for (const row of arrays.trades) {
      const info = insertTrade.run(...pickValues(TRADE_COLS, row, { user_id: userId }))
      counts.trades += info.changes
    }
    for (const row of arrays.pairs) {
      const info = insertPair.run(...pickValues(PAIR_COLS, row, { user_id: userId }))
      counts.pairs += info.changes
    }
    for (const row of arrays.policies) {
      const info = insertPolicy.run(...pickValues(POLICY_COLS, row, { user_id: userId }))
      counts.policies += info.changes
    }
    for (const row of arrays.weekly_notes) {
      const info = insertWeekly.run(...pickValues(WEEKLY_COLS, row, { user_id: userId }))
      counts.weekly_notes += info.changes
    }
    for (const row of arrays.monthly_notes) {
      const info = insertMonthly.run(...pickValues(MONTHLY_COLS, row, { user_id: userId }))
      counts.monthly_notes += info.changes
    }
    for (const v of arrays.trade_violations) {
      const info = insertViolation.run(
        v.notes ?? null,
        userId,
        v.trade_external_id,
        userId,
        v.policy_external_id
      )
      counts.trade_violations += info.changes
    }
  })
  run()

  res.json(counts)
})

export default router
```

- [ ] **Step 4: Wire the router in `server/index.js`.**

Read the current `server/index.js`. Add an import and a route mount. The diff is:

1. After the existing `import violationsRouter from './routes/violations.js'` line, add:

```js
import migrateRouter from './routes/migrate.js'
```

2. After the existing `app.use('/api/policies', requireAuth, policiesRouter)` line (or wherever authenticated routes are mounted), add:

```js
app.use('/api/migrate', requireAuth, migrateRouter)
```

Place it BEFORE the catch-all violations mount (`app.use('/api', requireAuth, violationsRouter)`) to avoid path collision.

- [ ] **Step 5: Run — expect pass.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -12
```

Expected: 3 migrate tests pass (28 + 3 = 31 total).

- [ ] **Step 6: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: POST /api/migrate with INSERT OR IGNORE dedup

Bulk-inserts anonymous-local snapshot into the authenticated user's
rows. Trade violations are resolved via (trade_external_id,
policy_external_id) lookup. 10k-row ceiling to match spec rate
limits.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 9: Update `routes/trades.js` for the new schema columns

**Files:**
- Modify: `server/routes/trades.js`

The legacy `trades.js` from trading-journal source uses `open_time`, `pair`, `direction`, `strategy`, etc. but does NOT include `asset_class`, `external_id`, or `quantity`. Plan 2 adds them so the ApiStore and the migrate flow round-trip.

- [ ] **Step 1: Read the current file to understand the existing queries.**

```bash
cat /home/lz/workspace/journal/server/routes/trades.js
```

- [ ] **Step 2: Apply the minimal-diff update.**

Use `Edit` to change each INSERT / UPDATE / SELECT statement to include the new columns. The file has four handlers:

**GET `/api/trades/quota`** — this is legacy free-tier quota logic. Plan 2 deletes the entire route since paid plans are out of scope. Find the block `router.get('/quota', ...)` and remove it.

**GET `/`** — modify the SELECT to return `asset_class`, `external_id`, `quantity` along with existing columns. Since `SELECT * FROM trades` is used, no SQL change needed, but add `asset_class` to the `allowed` sort columns list if desired.

**POST `/`** — the handler destructures from `req.body`:

```js
const {
  open_time, close_time, pair, direction, strategy, timeframe, lots,
  entry, stop, target, exit_price, gross_pnl, swap, score, emotion,
  notes, status, risk_amount
} = req.body
```

Expand to include the new fields:

```js
const {
  external_id, asset_class, quantity,
  open_time, close_time, pair, direction, strategy, timeframe, lots,
  entry, stop, target, exit_price, gross_pnl, swap, score, emotion,
  notes, status, risk_amount
} = req.body
```

Update the INSERT to include these columns:

```js
const stmt = db.prepare(`
  INSERT INTO trades (user_id, external_id, asset_class, open_time, close_time, pair, direction, strategy, timeframe, lots, quantity, entry, stop, target, exit_price, gross_pnl, swap, score, emotion, notes, status, risk_amount)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
```

And the corresponding `.run()` call. Default `asset_class` to `'forex'` if not provided (legacy compat).

**PUT `/:id`** — same idea. Destructure `external_id`, `asset_class`, `quantity`; update the UPDATE statement.

**DELETE `/:id`** — no change needed.

**NEW: GET `/by-external/:external_id`** — add a new handler that looks up a trade by `(user_id, external_id)`:

```js
router.get('/by-external/:external_id', (req, res) => {
  try {
    const trade = db.prepare('SELECT * FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    res.json(trade)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

**NEW: PUT `/by-external/:external_id`** — update by external_id:

```js
router.put('/by-external/:external_id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!existing) return res.status(404).json({ error: 'Trade not found' })
    const merged = { ...existing, ...req.body }
    db.prepare(`
      UPDATE trades SET
        asset_class = ?, pair = ?, direction = ?, strategy = ?, timeframe = ?,
        lots = ?, quantity = ?, entry = ?, stop = ?, target = ?, exit_price = ?,
        gross_pnl = ?, swap = ?, score = ?, emotion = ?, notes = ?, status = ?,
        risk_amount = ?, close_time = ?, open_time = ?, updated_at = datetime('now')
      WHERE user_id = ? AND external_id = ?
    `).run(
      merged.asset_class, merged.pair, merged.direction, merged.strategy, merged.timeframe,
      merged.lots, merged.quantity, merged.entry, merged.stop, merged.target, merged.exit_price,
      merged.gross_pnl, merged.swap ?? 0, merged.score, merged.emotion, merged.notes, merged.status,
      merged.risk_amount, merged.close_time, merged.open_time,
      req.userId, req.params.external_id
    )
    const updated = db.prepare('SELECT * FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

**NEW: DELETE `/by-external/:external_id`**:

```js
router.delete('/by-external/:external_id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM trades WHERE user_id = ? AND external_id = ?')
      .run(req.userId, req.params.external_id)
    if (info.changes === 0) return res.status(404).json({ error: 'Trade not found' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

**NEW: GET `/by-external/:external_id/violations` and PUT `/by-external/:external_id/violations`** — these are referenced by `ApiStore.listViolationsForTrade` and `setViolationsForTrade`. The implementation looks up the trade id from external_id, then delegates to existing violation logic (or runs the UPDATE/SELECT directly):

```js
router.get('/by-external/:external_id/violations', (req, res) => {
  try {
    const trade = db.prepare('SELECT id FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    const rows = db.prepare(`
      SELECT tv.*, p.title AS policy_title
      FROM trade_violations tv
      JOIN policies p ON p.id = tv.policy_id
      WHERE tv.trade_id = ?
    `).all(trade.id)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/by-external/:external_id/violations', (req, res) => {
  try {
    const trade = db.prepare('SELECT id FROM trades WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!trade) return res.status(404).json({ error: 'Trade not found' })
    const policyExternalIds = Array.isArray(req.body?.policy_external_ids) ? req.body.policy_external_ids : []
    const run = db.transaction(() => {
      db.prepare('DELETE FROM trade_violations WHERE trade_id = ?').run(trade.id)
      const insertVio = db.prepare(`
        INSERT INTO trade_violations (trade_id, policy_id)
        SELECT ?, p.id FROM policies p WHERE p.user_id = ? AND p.external_id = ?
      `)
      for (const pe of policyExternalIds) insertVio.run(trade.id, req.userId, pe)
    })
    run()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 3: Boot the server and spot-check.**

```bash
cd /home/lz/workspace/journal
pkill -9 -f "tsx.*index.js"; sleep 1
rm -f data/journal.db data/journal.db-shm data/journal.db-wal
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test \
  NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev:server > /tmp/plan2-task9.log 2>&1 &
SP=$!
sleep 4
curl -s --noproxy '*' http://localhost:3001/api/health
kill $SP 2>/dev/null
wait $SP 2>/dev/null
tail -5 /tmp/plan2-task9.log
```

Expected: `/api/health` returns ok, server log shows no import errors.

- [ ] **Step 4: Run tests.**

```bash
pnpm test 2>&1 | tail -8
```

Expected: 31 tests still pass.

- [ ] **Step 5: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: trades.js supports asset_class, external_id, quantity

Adds new columns to POST/PUT and new by-external/:id endpoints
(GET, PUT, DELETE, violations GET/PUT) so ApiStore can address
trades via the client-generated UUID. Legacy id-based endpoints
still work for backwards compat with the existing App.jsx.

Also removes the /quota route (no paid tier).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 10: Update `routes/pairs.js` for the new schema columns

**Files:**
- Modify: `server/routes/pairs.js`

- [ ] **Step 1: Read the existing file.**

```bash
cat /home/lz/workspace/journal/server/routes/pairs.js
```

- [ ] **Step 2: Update POST handler.**

The legacy file inserts `(user_id, name, spread_cost, sort_order)`. Expand to include the new columns:

```js
const { external_id, name, asset_class, contract_size, price_precision, spread_cost, sort_order } = req.body
const stmt = db.prepare(`
  INSERT INTO pairs (user_id, external_id, name, asset_class, contract_size, price_precision, spread_cost, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
stmt.run(
  req.userId,
  external_id ?? null,
  name,
  asset_class ?? 'forex',
  contract_size ?? 100000,
  price_precision ?? 5,
  spread_cost ?? 0,
  sort_order ?? 0
)
```

Update the PUT handler similarly to allow modifying any of the new columns.

- [ ] **Step 3: Add by-external endpoints** (GET/PUT/DELETE keyed on `external_id`), mirroring the pattern from Task 9:

```js
router.get('/by-external/:external_id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM pairs WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!row) return res.status(404).json({ error: 'Pair not found' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/by-external/:external_id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM pairs WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id)
    if (!existing) return res.status(404).json({ error: 'Pair not found' })
    const merged = { ...existing, ...req.body }
    db.prepare(`
      UPDATE pairs SET name = ?, asset_class = ?, contract_size = ?,
        price_precision = ?, spread_cost = ?, sort_order = ?
      WHERE user_id = ? AND external_id = ?
    `).run(
      merged.name, merged.asset_class, merged.contract_size,
      merged.price_precision, merged.spread_cost, merged.sort_order,
      req.userId, req.params.external_id
    )
    res.json(db.prepare('SELECT * FROM pairs WHERE user_id = ? AND external_id = ?')
      .get(req.userId, req.params.external_id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/by-external/:external_id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM pairs WHERE user_id = ? AND external_id = ?')
      .run(req.userId, req.params.external_id)
    if (info.changes === 0) return res.status(404).json({ error: 'Pair not found' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 4: Tests and commit.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -8
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: pairs.js supports asset_class, contract_size, external_id

Adds new columns to POST/PUT plus by-external endpoints so ApiStore
can upsert pairs by client UUID.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 11: Client migration flow + App.jsx wiring

**Files:**
- Create: `client/src/hooks/useMigrationTrigger.ts`
- Modify: `client/src/App.jsx`

The migration trigger runs once, on the first render after sign-in, when `?just_signed_in=1` is present in the URL.

- [ ] **Step 1: Create `client/src/hooks/useMigrationTrigger.ts`.**

```ts
import { useEffect } from 'react'
import { getLocalStore } from './useStore'

export type MigrationStatus = 'idle' | 'running' | 'success' | 'error'

export function useMigrationTrigger(onStatus?: (s: MigrationStatus) => void): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('just_signed_in') !== '1') return

    let cancelled = false
    ;(async () => {
      onStatus?.('running')
      try {
        const local = getLocalStore()
        const payload = await local.exportAll()
        const total =
          payload.trades.length +
          payload.weekly_notes.length +
          payload.monthly_notes.length +
          payload.policies.length +
          payload.pairs.length +
          payload.trade_violations.length

        if (total > 0) {
          const res = await fetch('/api/migrate', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error((body as any).error ?? `HTTP ${res.status}`)
          }
          await local.clearAll()
        }
        if (!cancelled) onStatus?.('success')
      } catch (err) {
        console.error('[migrate] failed', err)
        if (!cancelled) onStatus?.('error')
      } finally {
        const url = new URL(window.location.href)
        url.searchParams.delete('just_signed_in')
        window.history.replaceState(null, '', url.toString())
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
```

- [ ] **Step 2: Wire `useStore` and `useMigrationTrigger` into `App.jsx`.**

This is a surgical edit of the existing App.jsx. The existing App fetches `/api/auth/me` via a custom `useApi` hook and renders either `<LandingPage>` (unauth) or the authenticated app. The change:

1. Import the new hooks at the top of App.jsx:

```js
import { useStore } from './hooks/useStore'
import { useMigrationTrigger } from './hooks/useMigrationTrigger'
```

2. Inside the App component, add at the top of the component body:

```js
const { store, isAuthenticated, loading: storeLoading } = useStore()
const [migrationStatus, setMigrationStatus] = useState('idle')
useMigrationTrigger(setMigrationStatus)
```

3. In the existing auth-check effect (which currently calls `api.getMe()` then toggles auth state), use `isAuthenticated` from `useStore` instead. Remove redundant session fetches — `useStore` already fetches `/api/auth/me`.

4. Rendering change: when `isAuthenticated === false`, show the journal UI directly (anonymous mode, reads from LocalStore), NOT the LandingPage. This is the core of "anonymous-first": the app is usable without signing in. Move any "sign in to sync" affordance into the app header.

5. All CRUD operations that currently call `api.createTrade(...)` etc. are replaced with `store.addTrade(...)`.

**Minimum viable edit:** the agent may find that App.jsx is 525 lines of tightly-coupled state. Rather than rewriting everything, introduce a `storeAdapter` wrapper that maps the legacy `api.*` method names to the new `store.*` method names. Then inside the existing App.jsx, replace `api` references with `storeAdapter`.

Example adapter (new file `client/src/lib/storeAdapter.js`):

```js
// Maps legacy useApi-style method names to the new JournalStore interface.
// Enables App.jsx to switch stores without a full rewrite.
export function makeStoreAdapter(store) {
  return {
    // Trades
    listTrades: async () => {
      const trades = await store.listTrades()
      return { trades, total: trades.length, limit: 0, offset: 0 }
    },
    createTrade: (trade) => store.addTrade({ ...trade, external_id: trade.external_id ?? crypto.randomUUID() }),
    updateTrade: (trade) => store.updateTrade(trade.external_id, trade),
    deleteTrade: (id_or_external) => store.deleteTrade(id_or_external),
    // Notes
    listNotes: () => store.listWeeklyNotes(),
    createNote: (note) => store.upsertWeeklyNote({ ...note, external_id: note.external_id ?? crypto.randomUUID() }),
    deleteNote: (id_or_external) => store.deleteWeeklyNote(id_or_external),
    listMonthlyNotes: () => store.listMonthlyNotes(),
    createMonthlyNote: (note) => store.upsertMonthlyNote({ ...note, external_id: note.external_id ?? crypto.randomUUID() }),
    deleteMonthlyNote: (id_or_external) => store.deleteMonthlyNote(id_or_external),
    // Policies
    listPolicies: () => store.listPolicies(),
    createPolicy: (policy) => store.upsertPolicy({ ...policy, external_id: policy.external_id ?? crypto.randomUUID() }),
    deletePolicy: (id_or_external) => store.deletePolicy(id_or_external),
    // Pairs
    listPairs: () => store.listPairs(),
    createPair: (pair) => store.upsertPair({ ...pair, external_id: pair.external_id ?? crypto.randomUUID() }),
    deletePair: (id_or_external) => store.deletePair(id_or_external),
  }
}
```

Inside App.jsx, replace `const api = useApi()` with `const storeAdapter = useMemo(() => makeStoreAdapter(store), [store])`. Then rename all `api.*` calls to `storeAdapter.*`.

- [ ] **Step 3: Smoke-test the client in dev mode.**

```bash
cd /home/lz/workspace/journal
pkill -9 -f "tsx.*index.js"; pkill -9 -f "vite"; sleep 1
pnpm run dev > /tmp/plan2-dev.log 2>&1 &
DEV_PID=$!
sleep 10
# Hit client port (Vite default :3000) and server (:3001)
curl -s --noproxy '*' -o - -w "\nHTTP %{http_code}\n" http://localhost:3000/
curl -s --noproxy '*' http://localhost:3001/api/health
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
tail -30 /tmp/plan2-dev.log
```

Expected: client serves HTML (HTTP 200), server health returns ok. No runtime errors in the dev log about missing imports or undefined functions.

If the client crashes on load, inspect the browser console output (the dev log will capture Vite errors; browser errors need manual inspection via the user).

- [ ] **Step 4: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: App.jsx reads from useStore + migration trigger on signin

Anonymous users hit LocalStore (IndexedDB via Dexie); authenticated
users hit ApiStore. Migration trigger drains local data to /api/migrate
on first render after ?just_signed_in=1. Existing App.jsx stays
mostly intact via a thin storeAdapter that maps legacy api.* method
names to JournalStore.* methods.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 12: End-to-end smoke test and tag

- [ ] **Step 1: Kill orphan servers.**

```bash
pkill -9 -f "tsx.*index.js" 2>/dev/null
pkill -9 -f "node.*index.js" 2>/dev/null
pkill -9 -f "vite" 2>/dev/null
sleep 1
ps aux | grep -E "tsx|node.*index|vite" | grep -v grep | wc -l
```

Expected: 0.

- [ ] **Step 2: Fresh DB, fresh boot.**

```bash
cd /home/lz/workspace/journal
rm -f data/journal.db data/journal.db-shm data/journal.db-wal
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test \
  NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev > /tmp/plan2-smoke.log 2>&1 &
DEV_PID=$!
sleep 10
```

- [ ] **Step 3: Anonymous trade round-trip via curl** (simulates what the client would do if the user clicked "add trade" while logged out — but since the client uses LocalStore for anonymous, there's no server call. Instead, smoke-test the SERVER flow: magic-link → verify → migrate).

```bash
# Trigger magic-link
curl -s --noproxy '*' -X POST http://localhost:3001/api/auth/magic-link \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@plan2.test","turnstileToken":"skip"}'
echo
# Extract token
TOKEN=$(node -e "
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('/home/lz/workspace/journal/data/journal.db');
const r = db.prepare('SELECT token FROM magic_link_tokens').get();
process.stdout.write(r.token);
")
echo "token=$TOKEN"
# Verify (captures session cookie)
curl -s --noproxy '*' -c /tmp/plan2-cookies.txt -i "http://localhost:3001/auth/verify?token=$TOKEN" | head -5
```

Expected: 302 redirect to `/app?just_signed_in=1`. Cookie file `/tmp/plan2-cookies.txt` contains `connect.sid`.

- [ ] **Step 4: POST to /api/migrate using the authenticated cookie.**

```bash
curl -s --noproxy '*' -b /tmp/plan2-cookies.txt \
  -X POST http://localhost:3001/api/migrate \
  -H 'Content-Type: application/json' \
  -d '{
    "trades": [{
      "external_id": "smoke-trade-1",
      "open_time": "2026-04-14T10:00",
      "pair": "BTC/USDT",
      "asset_class": "crypto_perp",
      "direction": "long",
      "strategy": "breakout",
      "timeframe": "H1",
      "quantity": 0.5,
      "entry": 60000,
      "stop": 58000,
      "exit_price": 62000,
      "gross_pnl": 1000,
      "status": "closed"
    }],
    "weekly_notes": [],
    "monthly_notes": [],
    "policies": [],
    "pairs": [],
    "trade_violations": []
  }'
echo
```

Expected: `{"trades":1,"weekly_notes":0,"monthly_notes":0,"policies":0,"pairs":0,"trade_violations":0}`

- [ ] **Step 5: Verify the row landed.**

```bash
node -e "
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('/home/lz/workspace/journal/data/journal.db');
const trade = db.prepare('SELECT external_id, asset_class, pair, gross_pnl FROM trades WHERE user_id = (SELECT id FROM users WHERE email = ?)').get('smoke@plan2.test');
console.log(trade);
const count = db.prepare('SELECT COUNT(*) FROM trades').pluck().get();
console.log('total trades:', count);
"
```

Expected: `{ external_id: 'smoke-trade-1', asset_class: 'crypto_perp', pair: 'BTC/USDT', gross_pnl: 1000 }` and `total trades: 1`.

- [ ] **Step 6: Cleanup and run full test suite.**

```bash
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
pnpm test 2>&1 | tail -8
```

Expected: 31 tests pass (13 from Plan 1 + 8 calc + 4 LocalStore + 3 ApiStore + 3 migrate).

- [ ] **Step 7: Tag and push.**

```bash
git tag -a plan-2-complete -m "Plan 2 — Client data layer and migration flow complete

12 tasks: tsx runtime, client TS setup, polymorphic calc (8 tests),
Dexie LocalStore (4 tests), fetch ApiStore (3 tests), useStore hook,
POST /api/migrate with INSERT OR IGNORE dedup (3 tests), trades/pairs
route updates with by-external endpoints, App.jsx wired via
storeAdapter, migration trigger on just_signed_in=1.

31 total tests pass. Server boots under tsx, client dev server
renders anonymous mode, magic-link → verify → migrate round-trip
verified via curl."
git push --tags
```

---

## Self-Review Checklist

**Spec coverage:**
- §4 Stack additions (Dexie, tsx) → Tasks 1, 5
- §5 File structure (`stores/`, `hooks/useStore`, `lib/calc.ts`, `routes/migrate.js`) → Tasks 3, 4, 5, 6, 7, 8
- §6 Data model — `asset_class`, `external_id`, `quantity` round-tripped through routes → Tasks 9, 10
- §7 Anonymous + sync flow — LocalStore (Task 5), ApiStore (Task 6), useStore (Task 7), /api/migrate (Task 8), App.jsx wiring + trigger (Task 11), dedup via external_id (Task 8) ✓
- §8 calc polymorphism → Task 3
- §10 test coverage — 8 calc + 4 LocalStore + 3 ApiStore + 3 migrate = 18 new tests in Plan 2 (server-side calc tests from §10 are covered by the client calc.ts tests; the spec's "server" wording is reinterpreted as "in the vitest suite" since calc has always been client-side)
- §12-15 deployment/monetization/marketing — Plan 3 and Plan 4

**Placeholder scan:** No TBD / TODO / "implement later" in any task. Task 9 Step 2 describes edits to existing files in prose ("find the block X, change it to Y") because a full rewrite would duplicate dozens of unchanged lines.

**Type consistency:**
- `Trade`, `Pair`, `AssetClass`, `Direction`, `TradeStatus` defined in Task 3 (`calc.ts`) and re-exported from Task 4 (`types.ts`)
- `TradeRow`, `MigratePayload`, etc. from Task 4 used consistently in Tasks 5, 6, 7, 11
- `JournalStore` interface from Task 5 implemented by both `LocalStore` (Task 5) and `ApiStore` (Task 6) with identical method signatures
- `getLocalStore()` / `getApiStore()` from Task 7 consumed by Task 11's `useMigrationTrigger`
- `/api/migrate` POST body shape matches `MigratePayload` definition in Task 4 and server parsing in Task 8

**Gaps:**
- Plan 2 does NOT update `routes/notes.js`, `routes/monthly-notes.js`, `routes/policies.js`, `routes/violations.js` for the new `external_id` columns beyond what migration needs. The `ApiStore` calls `by-external` endpoints on these routes but the endpoints don't exist yet. **This is a real gap for authenticated users**: after Plan 2, the app works anonymously (LocalStore) and can migrate on sign-in (via the dedicated /api/migrate endpoint), but authenticated users who then add new notes/policies via `ApiStore.upsertWeeklyNote` etc. will get 404s because the server doesn't have those endpoints. Plan 3 adds them. Until then, authenticated users are effectively read-only after migration for notes/policies — a known limitation for the Plan 2 checkpoint.

---

*End of Plan 2.*
