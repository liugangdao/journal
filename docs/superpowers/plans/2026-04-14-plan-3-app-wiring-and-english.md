# Plan 3 — App.jsx Wiring + English UI + Perf Fix 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Plan 2 client data layer (LocalStore + ApiStore + useStore + migration trigger) into the existing App.jsx, translate all UI strings from Chinese to English, replace legacy `calc.js` usages with the polymorphic `tradeCalc.ts`, and add useMemo-backed stats caching (perf Fix 3 from spec §9). End state: a working anonymous-first English journal app where the browser is the primary data store and magic-link sign-in triggers cloud sync.

**Architecture:** A thin `storeAdapter.ts` wrapper translates the 20-ish legacy `api.*` method names into `JournalStore` method calls. App.jsx is refactored to treat `authUser === false` as "anonymous mode with LocalStore" instead of "show LandingPage". Anonymous users see the full app UI and can add trades, notes, and policies; a persistent "Sign in to sync" button in the header opens an email entry form that triggers the magic-link flow. Direction values change from `多/空` to `long/short` (this is a one-way schema format change; the dev DB is wiped as part of the task). UI strings move from inline Chinese literals to an `i18n/en.ts` module (flat key-value) read by components. Recharts data arrays and `calcStats` results get `useMemo` wrappers.

**Tech Stack:** Same as Plan 1/2 — React 19, Tailwind 4, Recharts, Dexie via LocalStore, fetch via ApiStore, TypeScript for new files. No new npm deps.

**Spec reference:** `/home/lz/workspace/journal/docs/superpowers/specs/2026-04-14-journal-basiscalc-xyz-design.md` — §2 (value prop), §3 (scope), §7 (sync flow), §8 (calc dispatch), §9 (perf Fix 3).

**Repo root for all paths below:** `/home/lz/workspace/journal/`

**Precondition:** Plan 2 tag `plan-2-complete`. 34 tests pass. Backend boots; ApiStore routes (by-external) exist; LocalStore auto-seeds defaults; `/api/migrate` works end-to-end.

---

## Scope

**In scope:**
- Replace `useApi`-based data fetching in App.jsx with `useStore()` + `storeAdapter`.
- Add sign-in affordance (header button → email form → magic-link POST).
- Wire `useMigrationTrigger` into App.jsx — drains LocalStore on `?just_signed_in=1`.
- Show the full journal UI to anonymous users (no more "log in to see anything").
- Remove code paths for deleted features: Telegram auth, `/api/auth/quota`, `AuthPage` required gate, `UpgradeModal`, `QuotaBanner`.
- Translate every Chinese string in `client/src/` to English.
- Change direction values from `"多" / "空"` to `"long" / "short"` everywhere.
- Replace remaining `calcStats` / `calcTrade` callers to use the new `tradeCalc.ts` asset-class dispatch (Dashboard, PsychologyPanel, TradeTable, TradeForm, legacy `calc.js` gets deleted).
- Add `useMemo` wrappers for `calcStats(trades)` and every Recharts `data=` prop (spec §9 Fix 3).

**Explicitly out of scope (Plan 4):**
- Landing page (`/`)
- About, privacy, terms pages
- Blog articles and `/blog/:slug` route
- EJS / marketing templates
- Umami analytics
- Production deployment (Caddy + Docker + CF Origin Certificate)

**Explicitly out of scope (beyond MVP):**
- UI redesign, visual refresh, or new component styling.
- State management refactor (App.jsx 29-hook mega-state stays as-is; the state still works after wiring through storeAdapter).
- Performance Fix 1 (Context extraction) and Fix 2 (React Query).

---

## File Structure

```
journal/
├── client/
│   ├── src/
│   │   ├── App.jsx                  # modify: replace useApi with useStore + storeAdapter
│   │   ├── i18n/
│   │   │   └── en.ts                # NEW — flat key→string dictionary
│   │   ├── hooks/
│   │   │   ├── useStore.ts          # keep (Plan 2)
│   │   │   ├── useMigrationTrigger.ts  # keep (Plan 2)
│   │   │   ├── useStoreAdapter.ts   # NEW — returns legacy-shaped adapter
│   │   │   └── useApi.js            # modify: shrink to session-only concerns
│   │   ├── lib/
│   │   │   ├── calc.js              # DELETE (last callers move to tradeCalc.ts)
│   │   │   ├── tradeCalc.ts         # keep + extend with calcStats (moved from calc.js)
│   │   │   └── constants.js         # rewrite: English strategy/emotion/score/timeframe
│   │   ├── components/
│   │   │   ├── Dashboard.jsx        # modify: useMemo + English + calcStats from tradeCalc
│   │   │   ├── TradeTable.jsx       # modify: English + tradeCalc.calcTrade
│   │   │   ├── TradeForm.jsx        # modify: English + direction long/short
│   │   │   ├── PsychologyPanel.jsx  # modify: English + useMemo + calcStats from tradeCalc
│   │   │   ├── Settings.jsx         # modify: English + remove quota/premium code
│   │   │   ├── Policies.jsx         # modify: English
│   │   │   ├── NotesTab.jsx         # modify: English
│   │   │   ├── WeeklyNotes.jsx      # modify: English
│   │   │   ├── MonthlyNotes.jsx     # modify: English
│   │   │   ├── OpenPositions.jsx    # modify: English
│   │   │   ├── MoreTab.jsx          # modify: English
│   │   │   ├── Layout.jsx           # modify: English nav labels + SignInButton
│   │   │   ├── SignInButton.jsx     # NEW — header button opening magic-link form
│   │   │   ├── SignInDialog.jsx     # NEW — email entry + submit + "check inbox" UI
│   │   │   ├── ExportBar.jsx        # modify: English
│   │   │   ├── TradeFilter.jsx      # modify: English
│   │   │   ├── QuotaBanner.jsx      # DELETE
│   │   │   ├── UpgradeModal.jsx     # DELETE
│   │   │   ├── LandingPage.jsx      # keep file (unused in Plan 3, Plan 4 rewrites)
│   │   │   ├── AuthPage.jsx         # DELETE (replaced by SignInDialog)
│   │   │   └── ...
│   │   └── stores/
│   │       └── (keep Plan 2 files)
│   └── __tests__/
│       └── (keep Plan 2 files — may add calcStats test case)
└── server/
    └── (untouched in Plan 3)
```

---

## Task 1: Extend `tradeCalc.ts` with `calcStats` (port from legacy)

**Files:**
- Modify: `client/src/lib/tradeCalc.ts`
- Modify: `client/__tests__/calc.test.ts` — add 1 test for calcStats aggregation

The legacy `calc.js` has a big `calcStats(trades)` aggregator that Dashboard and PsychologyPanel depend on. It must move into `tradeCalc.ts` with the same output shape so the components can swap imports without changing their own logic. The new version dispatches per-trade via the polymorphic `calcTrade` but the aggregation (win rate, profit factor, breakdowns by pair/strategy/emotion, cumulative P&L curve, streaks) is the same.

- [ ] **Step 1: Read the legacy `calcStats` to understand its full output shape.**

```bash
cat /home/lz/workspace/journal/client/src/lib/calc.js
```

Note every field of the object it returns and how it's consumed by Dashboard/PsychologyPanel.

- [ ] **Step 2: Add a test in `client/__tests__/calc.test.ts` (append at the bottom).**

```ts
import { calcStats } from '../src/lib/tradeCalc'

describe('calcStats aggregation', () => {
  it('returns null for empty input', () => {
    expect(calcStats([], new Map())).toBeNull()
  })

  it('computes win rate, profit factor, and total P&L', () => {
    const pairs = new Map([
      ['EUR/USD', eurusd],
      ['BTC/USDT', btc],
    ])
    const trades = [
      {
        external_id: 't1',
        open_time: '2026-04-10T10:00',
        pair: 'EUR/USD',
        asset_class: 'forex' as const,
        direction: 'long' as const,
        strategy: 'trend',
        timeframe: 'H4',
        lots: 1,
        entry: 1.1,
        stop: 1.095,
        exit_price: 1.105,
        gross_pnl: 500,
        status: 'closed' as const,
      },
      {
        external_id: 't2',
        open_time: '2026-04-11T10:00',
        pair: 'BTC/USDT',
        asset_class: 'crypto_perp' as const,
        direction: 'long' as const,
        strategy: 'breakout',
        timeframe: 'H1',
        quantity: 1,
        entry: 60000,
        stop: 58000,
        exit_price: 62000,
        gross_pnl: -200,
        status: 'closed' as const,
      },
    ]
    const stats = calcStats(trades, pairs)
    expect(stats).not.toBeNull()
    expect(stats!.tradeCount).toBe(2)
    expect(stats!.winCount).toBe(1)
    expect(stats!.winRate).toBeCloseTo(50, 0)
    expect(stats!.totalNet).toBeCloseTo(300, 0)
  })
})
```

- [ ] **Step 3: Run — expect failure (calcStats doesn't exist).**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -10
```

- [ ] **Step 4: Implement `calcStats` in `tradeCalc.ts`.**

Append at the bottom of `client/src/lib/tradeCalc.ts`:

```ts
import type { TradeRow } from '../stores/types'

export interface StatsBreakdown {
  name: string
  count: number
  winRate: number
  pnl: number
  avgR: number
}

export interface CalcStatsOutput {
  tradeCount: number
  winCount: number
  lossCount: number
  winRate: number
  totalNet: number
  totalGross: number
  totalSpread: number
  totalSwap: number
  avgWin: number
  avgLoss: number
  avgR: number
  profitFactor: number
  byPair: StatsBreakdown[]
  byStrategy: StatsBreakdown[]
  byEmotion: StatsBreakdown[]
  byDay: StatsBreakdown[]
  byTimeframe: StatsBreakdown[]
  cumPnl: Array<{ idx: number; date: string; pnl: number }>
  maxWinStreak: number
  maxLossStreak: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weekday(dateStr: string): string {
  return WEEKDAYS[new Date(dateStr).getDay()]
}

export function calcStats(
  trades: TradeRow[],
  pairsByName: Map<string, Pair>
): CalcStatsOutput | null {
  const active = trades.filter((t) => t.status !== 'missed')
  if (active.length === 0) return null

  type Enriched = TradeRow & {
    wd: string
    calc: TradeCalcOutput
    netPnl: number
    spread: number
  }
  const enriched: Enriched[] = active.map((t) => {
    const pair = pairsByName.get(t.pair)
    let calc: TradeCalcOutput
    if (!pair) {
      calc = { pips: null, grossPnl: t.gross_pnl ?? null, rMultiple: null }
    } else {
      calc = calcTrade(t, pair)
    }
    const gross = calc.grossPnl ?? t.gross_pnl ?? 0
    const swap = t.swap ?? 0
    const netPnl = gross + swap
    const lots = t.lots ?? 0
    const spread = pair ? pair.spread_cost * lots : 0
    return { ...t, wd: weekday(t.open_time), calc, netPnl, spread }
  })

  const wins = enriched.filter((t) => t.netPnl > 0)
  const losses = enriched.filter((t) => t.netPnl < 0)
  const totalNet = enriched.reduce((s, t) => s + t.netPnl, 0)
  const totalGross = enriched.reduce((s, t) => s + (t.calc.grossPnl ?? 0), 0)
  const totalSpread = enriched.reduce((s, t) => s + t.spread, 0)
  const totalSwap = enriched.reduce((s, t) => s + (t.swap ?? 0), 0)
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.netPnl, 0) / losses.length : 0
  const rTrades = enriched.filter((t) => t.calc.rMultiple !== null)
  const avgR = rTrades.length
    ? rTrades.reduce((s, t) => s + (t.calc.rMultiple ?? 0), 0) / rTrades.length
    : 0

  const lossSum = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0))
  const winSum = wins.reduce((s, t) => s + t.netPnl, 0)
  const profitFactor = lossSum > 0 ? winSum / lossSum : winSum > 0 ? Infinity : 0

  type Bucket = { count: number; wins: number; totalPnl: number; totalR: number; rCount: number }
  const buckets: Record<string, Record<string, Bucket>> = {
    pair: {},
    strategy: {},
    emotion: {},
    wd: {},
    timeframe: {},
  }
  for (const t of enriched) {
    for (const [dim, keyRaw] of [
      ['pair', t.pair] as const,
      ['strategy', t.strategy] as const,
      ['emotion', t.emotion ?? '—'] as const,
      ['wd', t.wd] as const,
      ['timeframe', t.timeframe] as const,
    ]) {
      const key = keyRaw ?? '—'
      if (!buckets[dim][key]) buckets[dim][key] = { count: 0, wins: 0, totalPnl: 0, totalR: 0, rCount: 0 }
      const b = buckets[dim][key]
      b.count++
      if (t.netPnl > 0) b.wins++
      b.totalPnl += t.netPnl
      if (t.calc.rMultiple !== null) {
        b.totalR += t.calc.rMultiple
        b.rCount++
      }
    }
  }

  function toArr(m: Record<string, Bucket>): StatsBreakdown[] {
    return Object.entries(m).map(([k, v]) => ({
      name: k,
      count: v.count,
      winRate: v.count ? (v.wins / v.count) * 100 : 0,
      pnl: Math.round(v.totalPnl * 100) / 100,
      avgR: v.rCount ? Math.round((v.totalR / v.rCount) * 100) / 100 : 0,
    }))
  }

  const sorted = [...enriched].sort((a, b) => a.open_time.localeCompare(b.open_time))
  let cum = 0
  const cumPnl = sorted.map((t, i) => {
    cum += t.netPnl
    return { idx: i + 1, date: t.open_time.slice(0, 10), pnl: Math.round(cum * 100) / 100 }
  })

  let maxWinStreak = 0
  let maxLossStreak = 0
  let curWin = 0
  let curLoss = 0
  for (const t of sorted) {
    if (t.netPnl > 0) {
      curWin++
      curLoss = 0
      maxWinStreak = Math.max(maxWinStreak, curWin)
    } else if (t.netPnl < 0) {
      curLoss++
      curWin = 0
      maxLossStreak = Math.max(maxLossStreak, curLoss)
    } else {
      curWin = 0
      curLoss = 0
    }
  }

  return {
    tradeCount: enriched.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: enriched.length ? (wins.length / enriched.length) * 100 : 0,
    totalNet: Math.round(totalNet * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
    totalSpread: Math.round(totalSpread * 100) / 100,
    totalSwap: Math.round(totalSwap * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    avgR: Math.round(avgR * 100) / 100,
    profitFactor: Number.isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : profitFactor,
    byPair: toArr(buckets.pair),
    byStrategy: toArr(buckets.strategy),
    byEmotion: toArr(buckets.emotion),
    byDay: toArr(buckets.wd),
    byTimeframe: toArr(buckets.timeframe),
    cumPnl,
    maxWinStreak,
    maxLossStreak,
  }
}
```

- [ ] **Step 5: Run tests — expect pass.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -10
```

Expected: 34 + 2 = 36 tests pass.

- [ ] **Step 6: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: move calcStats into tradeCalc.ts with polymorphic dispatch

calcStats now takes trades and a pairs-by-name Map, enriches each
trade via the polymorphic calcTrade (forex pips vs crypto gross_pnl
vs metals/energy pip-based), and returns the same aggregate shape
that Dashboard and PsychologyPanel consume. 2 new tests cover the
empty-input and mixed-asset-class happy paths.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Delete deprecated components and Chinese-direction data helpers

**Files:**
- Delete: `client/src/components/AuthPage.jsx`
- Delete: `client/src/components/QuotaBanner.jsx`
- Delete: `client/src/components/UpgradeModal.jsx`
- Delete: `client/src/hooks/useTelegram.js`
- Delete: `client/src/lib/calc.js`

- [ ] **Step 1: Delete the files.**

```bash
cd /home/lz/workspace/journal
rm -f client/src/components/AuthPage.jsx
rm -f client/src/components/QuotaBanner.jsx
rm -f client/src/components/UpgradeModal.jsx
rm -f client/src/hooks/useTelegram.js
rm -f client/src/lib/calc.js
```

- [ ] **Step 2: Update components that import these files — replace or remove imports.**

Grep for each:

```bash
grep -rn "AuthPage\|QuotaBanner\|UpgradeModal\|useTelegram\|lib/calc" client/src/ --include="*.jsx" --include="*.js"
```

For every hit that is NOT in a `import` line, that code is a usage site — delete the whole block referring to it. For `import` lines in App.jsx:

- Remove `import AuthPage from './components/AuthPage'`
- Remove `import { useTelegram, tg } from './hooks/useTelegram'`
- Remove `import QuotaBanner from './components/QuotaBanner'`
- Remove `import UpgradeModal from './components/UpgradeModal'`
- Change `import { calcTrade } from '../lib/calc'` to `import { calcTrade } from '../lib/tradeCalc'` in `TradeTable.jsx` and `TradeForm.jsx`
- Change `import { calcStats } from '../lib/calc'` to `import { calcStats } from '../lib/tradeCalc'` in `Dashboard.jsx` and `PsychologyPanel.jsx`

- [ ] **Step 3: In App.jsx, remove the state and code blocks that referenced the deleted features.**

Use the Edit tool to remove (locations are approximate; search by string):

- The `isTelegram`, `tg` identifiers, the `useTelegram()` call, and any branch that checks `isTelegram`
- `const [quota, setQuota] = useState(null)` and everywhere that sets/reads quota
- `const [showUpgrade, setShowUpgrade] = useState(false)` and the JSX block `<UpgradeModal ... />`
- Any block that calls `api.telegramAuth()` or `api.getQuota()`
- Any JSX block that renders `<QuotaBanner ... />`

After removal, App.jsx should have NO references to quota, telegram, upgrade, or authPage.

- [ ] **Step 4: Verify the build + tests still pass.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -6
pnpm run build 2>&1 | tail -10 || echo "build not configured"
```

Expected: tests pass (no imports of deleted files remain). The `build` command may not exist at repo root; that's OK. The critical check is the tests and that no import error crashes the vitest run.

- [ ] **Step 5: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "chore: remove deprecated components (AuthPage, QuotaBanner, UpgradeModal, useTelegram, calc.js)

AuthPage replaced by SignInDialog (Task 4). Telegram/quota/upgrade
are out of scope under the 'free forever, no membership' spec.
Last callers of legacy calc.js migrated to tradeCalc.ts in Task 1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: Create i18n/en.ts dictionary

**Files:**
- Create: `client/src/i18n/en.ts`

Centralize every English UI string here. Components import from `../i18n/en` (or `../../i18n/en` for nested) and reference keys. This makes future locale additions (spec §3 "Chinese locale frozen in branch") a find-and-replace rather than a rewrite.

- [ ] **Step 1: Create `client/src/i18n/en.ts` with the dictionary.**

```ts
export const en = {
  app: {
    title: 'Trading Journal',
    signIn: 'Sign in',
    signOut: 'Sign out',
    signInToSync: 'Sign in to sync',
    loading: 'Loading…',
  },
  tabs: {
    record: 'Record',
    stats: 'Stats',
    weekly: 'Weekly',
    monthly: 'Monthly',
    policy: 'Policy',
    settings: 'Settings',
    more: 'More',
  },
  trade: {
    new: 'New trade',
    edit: 'Edit trade',
    close: 'Close position',
    delete: 'Delete',
    pair: 'Pair',
    assetClass: 'Asset class',
    direction: 'Direction',
    long: 'Long',
    short: 'Short',
    strategy: 'Strategy',
    timeframe: 'Timeframe',
    lots: 'Lots',
    quantity: 'Quantity',
    entry: 'Entry',
    stop: 'Stop',
    target: 'Target',
    exitPrice: 'Exit price',
    grossPnl: 'Gross P&L',
    swap: 'Swap',
    riskAmount: 'Risk amount',
    score: 'Execution score',
    emotion: 'Emotion',
    notes: 'Notes',
    openTime: 'Open time',
    closeTime: 'Close time',
    status: {
      open: 'Open',
      closed: 'Closed',
      missed: 'Missed',
    },
  },
  assetClass: {
    forex: 'Forex',
    metals: 'Metals',
    energy: 'Energy',
    crypto_perp: 'Crypto perp',
  },
  score: {
    A: 'Flawless',
    B: 'Solid',
    C: 'Shaky',
    D: 'Major violation',
    ADesc: 'Plan followed precisely; risk honored; patience intact.',
    BDesc: 'Overall on-plan with one minor deviation.',
    CDesc: 'Multiple deviations; risk controlled but entry/exit sloppy.',
    DDesc: 'Broke a core rule (no stop, revenge, oversize, etc.)',
  },
  emotion: {
    calm: 'Calm',
    confident: 'Confident',
    anxious: 'Anxious',
    fearful: 'Fearful',
    greedy: 'Greedy',
    fomo: 'FOMO',
    bored: 'Bored',
    tilted: 'Tilted',
    hopeful: 'Hopeful',
  },
  strategy: {
    trend: 'Trend',
    pullback: 'Pullback',
    breakout: 'Breakout',
    range: 'Range',
    reversal: 'Reversal',
    news: 'News',
    scalp: 'Scalp',
    other: 'Other',
  },
  stats: {
    winRate: 'Win rate',
    profitFactor: 'Profit factor',
    totalPnl: 'Total P&L',
    avgR: 'Avg R',
    tradeCount: 'Trades',
    maxWinStreak: 'Best streak',
    maxLossStreak: 'Worst streak',
    byPair: 'By pair',
    byStrategy: 'By strategy',
    byEmotion: 'By emotion',
    byDay: 'By day of week',
    byTimeframe: 'By timeframe',
    cumPnl: 'Cumulative P&L',
  },
  notes: {
    weekly: {
      title: 'Weekly review',
      week: 'Week',
      lesson: 'Lesson',
      plan: 'Plan',
      add: 'Add weekly note',
      delete: 'Delete',
    },
    monthly: {
      title: 'Monthly review',
      month: 'Month',
      lesson: 'Lesson',
      plan: 'Plan',
      add: 'Add monthly note',
      delete: 'Delete',
    },
  },
  policy: {
    title: 'Discipline rules',
    category: 'Category',
    phase: 'Phase',
    phases: {
      entry: 'Entry',
      exit: 'Exit',
      both: 'Both',
    },
    categories: {
      rules: 'Rules',
      strategy: 'Strategy',
      risk: 'Risk',
    },
    active: 'Active',
    inactive: 'Inactive',
    addNew: 'Add rule',
    violations: 'Violations on this trade',
  },
  signIn: {
    emailLabel: 'Your email',
    emailPlaceholder: 'you@example.com',
    submit: 'Send sign-in link',
    checkInbox: 'Check your inbox',
    checkInboxDesc: 'We sent a link to {email}. Click it to sign in and sync.',
    resend: 'Resend',
    cancel: 'Cancel',
    error: 'Something went wrong. Try again.',
  },
  migration: {
    running: 'Syncing your local data to the server…',
    success: 'Synced.',
    error: 'Sync failed. Your local data is safe; we will retry on next sign-in.',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    close: 'Close',
    open: 'Open',
  },
} as const

export type Dict = typeof en
```

- [ ] **Step 2: Test the module imports cleanly.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -6
```

Expected: tests pass (no runtime yet, just type-safe import).

- [ ] **Step 3: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: i18n/en.ts central dictionary for English UI strings

All future locale additions (including the frozen Chinese branch)
read from this shape. Component strings migrate to en.xxx.xxx in
later tasks.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: `SignInDialog` and `SignInButton` components

**Files:**
- Create: `client/src/components/SignInButton.jsx`
- Create: `client/src/components/SignInDialog.jsx`

The header shows a button when the user is anonymous. Clicking opens a dialog with an email input and a "Send sign-in link" button. On submit, the dialog POSTs to `/api/auth/magic-link` with a stub Turnstile token and transitions to a "Check your inbox" success state. The dialog closes on cancel or outside click.

- [ ] **Step 1: Create `client/src/components/SignInButton.jsx`.**

```jsx
import { useState } from 'react'
import SignInDialog from './SignInDialog'
import { en } from '../i18n/en'

export default function SignInButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-emerald-500 text-neutral-950 px-3 py-1.5 text-sm font-medium hover:bg-emerald-400"
      >
        {en.app.signInToSync}
      </button>
      {open && <SignInDialog onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 2: Create `client/src/components/SignInDialog.jsx`.**

```jsx
import { useEffect, useState } from 'react'
import { en } from '../i18n/en'

export default function SignInDialog({ onClose }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | submitting | sent | error
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    // Load Turnstile widget when available. The widget mounts into
    // #cf-turnstile when the script injects it via the ONLOAD callback.
    if (typeof window === 'undefined') return
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
    if (!siteKey) {
      // Dev mode: no Turnstile. Use a stub token; server skips verify when NODE_ENV=test.
      setTurnstileToken('skip-in-test')
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    window.onTurnstileLoad = () => {
      const tw = window.turnstile
      if (!tw) return
      tw.render('#cf-turnstile', {
        sitekey: siteKey,
        callback: (token) => setTurnstileToken(token),
      })
    }
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
      delete window.onTurnstileLoad
    }
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    if (!email || !turnstileToken) return
    setState('submitting')
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState('sent')
    } catch (err) {
      console.error(err)
      setState('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="rounded-lg bg-card border border-border p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {state === 'sent' ? (
          <>
            <h2 className="text-lg font-semibold">{en.signIn.checkInbox}</h2>
            <p className="mt-2 text-sm text-muted">
              {en.signIn.checkInboxDesc.replace('{email}', email)}
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded bg-neutral-200 dark:bg-neutral-800 px-3 py-2 text-sm"
              onClick={onClose}
            >
              {en.common.close}
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted">{en.signIn.emailLabel}</span>
              <input
                type="email"
                required
                autoFocus
                placeholder={en.signIn.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded bg-input border border-border px-3 py-2"
              />
            </label>
            <div id="cf-turnstile" />
            {state === 'error' && (
              <p className="text-sm text-red-500">{en.signIn.error}</p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-border px-3 py-2 text-sm"
              >
                {en.signIn.cancel}
              </button>
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="rounded bg-emerald-500 text-neutral-950 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {state === 'submitting' ? '…' : en.signIn.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: SignInButton + SignInDialog for magic-link auth entry

Header button opens a modal with email input, Turnstile widget,
and submit. On success the dialog switches to a 'check your inbox'
state. In dev (no VITE_TURNSTILE_SITE_KEY) it ships a stub token
so local testing works; production requires a real sitekey.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: `useStoreAdapter` — legacy-api-to-store bridge

**Files:**
- Create: `client/src/hooks/useStoreAdapter.ts`

This hook returns an object with method names matching the legacy `api.*` used by App.jsx, translating each call to the underlying `JournalStore`. Generates external_ids via `crypto.randomUUID()` for new records. The adapter is intentionally thin — it does not add business logic, just naming shims.

- [ ] **Step 1: Create `client/src/hooks/useStoreAdapter.ts`.**

```ts
import { useMemo } from 'react'
import type { JournalStore } from '../stores/JournalStore'
import type { TradeRow, WeeklyNote, MonthlyNote, PolicyRow, PairRow } from '../stores/types'

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ext-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface StoreAdapter {
  // Trades
  listTrades: (params?: unknown) => Promise<{ trades: TradeRow[]; total: number; limit: number; offset: number }>
  getTrades: (params?: unknown) => Promise<{ trades: TradeRow[]; total: number; limit: number; offset: number }>
  createTrade: (trade: Partial<TradeRow>) => Promise<TradeRow>
  updateTrade: (idOrExternalId: string | number, patch: Partial<TradeRow>) => Promise<TradeRow>
  deleteTrade: (idOrExternalId: string | number) => Promise<void>
  getTradeViolations: (idOrExternalId: string | number) => Promise<Array<{ policy_external_id: string }>>
  updateTradeViolations: (
    idOrExternalId: string | number,
    violations: Array<string | number>
  ) => Promise<void>

  // Notes
  getNotes: () => Promise<WeeklyNote[]>
  createNote: (note: Partial<WeeklyNote>) => Promise<WeeklyNote>
  deleteNote: (idOrExternalId: string | number) => Promise<void>
  getMonthlyNotes: () => Promise<MonthlyNote[]>
  createMonthlyNote: (note: Partial<MonthlyNote>) => Promise<MonthlyNote>
  deleteMonthlyNote: (idOrExternalId: string | number) => Promise<void>

  // Policies
  getPolicies: () => Promise<PolicyRow[]>
  createPolicy: (policy: Partial<PolicyRow>) => Promise<PolicyRow>
  updatePolicy: (idOrExternalId: string | number, patch: Partial<PolicyRow>) => Promise<PolicyRow>
  deletePolicy: (idOrExternalId: string | number) => Promise<void>
  togglePolicy: (idOrExternalId: string | number, is_active: number) => Promise<PolicyRow>

  // Pairs
  getPairs: () => Promise<PairRow[]>
  createPair: (pair: Partial<PairRow>) => Promise<PairRow>
  updatePair: (idOrExternalId: string | number, patch: Partial<PairRow>) => Promise<PairRow>
  deletePair: (idOrExternalId: string | number) => Promise<void>

  // Session (thin pass-through; live wire done in App.jsx via useStore)
  getMe: () => Promise<{ email: string } | null>
  logout: () => Promise<void>
}

export function useStoreAdapter(store: JournalStore): StoreAdapter {
  return useMemo<StoreAdapter>(() => {
    async function resolveTradeExternalId(idOrExternalId: string | number): Promise<string> {
      if (typeof idOrExternalId === 'string') return idOrExternalId
      // Legacy callers pass a numeric id; for LocalStore the numeric id
      // does not exist so callers should have migrated by now. As a
      // fallback, look up by scanning.
      const trades = await store.listTrades()
      const found = trades.find((t) => t.id === idOrExternalId)
      if (!found) throw new Error(`Trade not found: ${idOrExternalId}`)
      return found.external_id
    }

    return {
      listTrades: async () => {
        const trades = await store.listTrades()
        return { trades, total: trades.length, limit: 0, offset: 0 }
      },
      getTrades: async () => {
        const trades = await store.listTrades()
        return { trades, total: trades.length, limit: 0, offset: 0 }
      },
      createTrade: async (trade) => {
        const external_id = trade.external_id ?? uuid()
        return store.addTrade({ ...(trade as TradeRow), external_id })
      },
      updateTrade: async (idOrExternalId, patch) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        return store.updateTrade(external_id, patch)
      },
      deleteTrade: async (idOrExternalId) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        await store.deleteTrade(external_id)
      },
      getTradeViolations: async (idOrExternalId) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        const rows = await store.listViolationsForTrade(external_id)
        return rows.map((r) => ({ policy_external_id: r.policy_external_id }))
      },
      updateTradeViolations: async (idOrExternalId, violations) => {
        const external_id = await resolveTradeExternalId(idOrExternalId)
        // Legacy callers pass policy ids (numbers) OR external_ids (strings).
        // For LocalStore (anonymous) only external_ids make sense.
        const policyExternalIds = violations.map(String)
        await store.setViolationsForTrade(external_id, policyExternalIds)
      },

      getNotes: () => store.listWeeklyNotes(),
      createNote: async (note) => {
        const external_id = note.external_id ?? uuid()
        return store.upsertWeeklyNote({ ...(note as WeeklyNote), external_id })
      },
      deleteNote: async (idOrExternalId) => {
        // Legacy calls with numeric id — for LocalStore, map via scan
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listWeeklyNotes()).find((n) => n.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Note not found')
        await store.deleteWeeklyNote(external_id)
      },
      getMonthlyNotes: () => store.listMonthlyNotes(),
      createMonthlyNote: async (note) => {
        const external_id = note.external_id ?? uuid()
        return store.upsertMonthlyNote({ ...(note as MonthlyNote), external_id })
      },
      deleteMonthlyNote: async (idOrExternalId) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listMonthlyNotes()).find((n) => n.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Note not found')
        await store.deleteMonthlyNote(external_id)
      },

      getPolicies: () => store.listPolicies(),
      createPolicy: async (policy) => {
        const external_id = policy.external_id ?? uuid()
        return store.upsertPolicy({ ...(policy as PolicyRow), external_id })
      },
      updatePolicy: async (idOrExternalId, patch) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listPolicies()).find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Policy not found')
        const current = (await store.listPolicies()).find((p) => p.external_id === external_id)!
        return store.upsertPolicy({ ...current, ...patch, external_id })
      },
      deletePolicy: async (idOrExternalId) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listPolicies()).find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Policy not found')
        await store.deletePolicy(external_id)
      },
      togglePolicy: async (idOrExternalId, is_active) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listPolicies()).find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Policy not found')
        const current = (await store.listPolicies()).find((p) => p.external_id === external_id)!
        return store.upsertPolicy({ ...current, is_active, external_id })
      },

      getPairs: () => store.listPairs(),
      createPair: async (pair) => {
        const external_id = pair.external_id ?? uuid()
        return store.upsertPair({ ...(pair as PairRow), external_id })
      },
      updatePair: async (idOrExternalId, patch) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listPairs()).find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Pair not found')
        const current = (await store.listPairs()).find((p) => p.external_id === external_id)!
        return store.upsertPair({ ...current, ...patch, external_id })
      },
      deletePair: async (idOrExternalId) => {
        const external_id = typeof idOrExternalId === 'string'
          ? idOrExternalId
          : (await store.listPairs()).find((p) => p.id === idOrExternalId)?.external_id
        if (!external_id) throw new Error('Pair not found')
        await store.deletePair(external_id)
      },

      getMe: async () => {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' })
          if (!res.ok) return null
          return (await res.json()) as { email: string }
        } catch {
          return null
        }
      },
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      },
    }
  }, [store])
}
```

- [ ] **Step 2: Commit.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -6
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: useStoreAdapter bridges legacy api.* names to JournalStore

Thin naming shim. Every legacy method maps to 1-2 JournalStore
calls with automatic external_id generation and id→external_id
resolution via listXxx scan (works for LocalStore; ApiStore ids
are also numeric and handled the same way).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: Wire `useStore` + `useStoreAdapter` + `useMigrationTrigger` into App.jsx

**Files:**
- Modify: `client/src/App.jsx`

This is the largest task. Replace the three effects that load data via `api.*` with effects that call `storeAdapter.*` and read `isAuthenticated` from `useStore`. Show the full app to anonymous users. Add SignInButton to the Layout header for anonymous users.

- [ ] **Step 1: Read App.jsx top (first 180 lines).**

```bash
head -180 /home/lz/workspace/journal/client/src/App.jsx
```

Understand the current flow: `authUser` state, session check, data load in `reloadData`, and conditional rendering (`authUser ? <Layout> : <LandingPage>`).

- [ ] **Step 2: Replace the imports block at the top of App.jsx.**

Use Edit. Replace:

```jsx
import { api } from './hooks/useApi'
```

With:

```jsx
import { useStore } from './hooks/useStore'
import { useStoreAdapter } from './hooks/useStoreAdapter'
import { useMigrationTrigger } from './hooks/useMigrationTrigger'
import SignInButton from './components/SignInButton'
import { en } from './i18n/en'
```

Also remove imports of deleted components (`AuthPage`, `useTelegram`, `QuotaBanner`, `UpgradeModal`) — already deleted in Task 2; this confirms no stray import remains.

- [ ] **Step 3: Replace the `AppContent` state block.**

At the top of the `AppContent` function body, replace:

```jsx
const [authUser, setAuthUser] = useState(null)
const [authChecked, setAuthChecked] = useState(false)
const [showAuth, setShowAuth] = useState(false)
// ... other unchanged state ...
const isTelegram = useTelegram()
const [quota, setQuota] = useState(null)
const [showUpgrade, setShowUpgrade] = useState(false)
```

With:

```jsx
const { store, isAuthenticated, userEmail, loading: storeLoading } = useStore()
const storeAdapter = useStoreAdapter(store)
const [migrationStatus, setMigrationStatus] = useState('idle')
useMigrationTrigger(setMigrationStatus)
```

Keep all other state (allTrades, pagedTrades, notes, monthlyNotes, pairs, policies, tab, showForm, editing, closingId, editViolations, loading, theme, toast, confirmState).

- [ ] **Step 4: Replace every `api.xxx(...)` call in the file with `storeAdapter.xxx(...)`.**

```bash
grep -n "api\." /home/lz/workspace/journal/client/src/App.jsx
```

For each hit, replace `api.` with `storeAdapter.`. Exception: the auth-check effect at the top of App.jsx (which reads from `authUser` state) — that entire effect is replaced in Step 5.

- [ ] **Step 5: Replace the two auth-check effects with a simple derived value.**

Find and delete the two `useEffect` blocks that:
1. Call `api.telegramAuth()` / `api.getMe()` and set `authUser`
2. Call `api.setUnauthorizedHandler`

Replace with a single useEffect that reacts to `isAuthenticated` — which is already computed by `useStore`. If the user signs in mid-session, data reloads:

```jsx
useEffect(() => {
  if (storeLoading) return
  setLoading(true)
  Promise.all([reloadData(), fetchPagedTrades(tradeFilter)]).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [storeLoading, isAuthenticated, migrationStatus])
```

`migrationStatus` is in the dep array so that after a successful migration the data re-loads and users see their just-migrated trades on the server.

- [ ] **Step 6: Change the top-level render guard.**

Find the JSX block that conditionally renders `<LandingPage>` or `<AuthPage>` when `!authUser`. Replace with: always render the main app layout. Put a SignInButton in the header if `!isAuthenticated`.

Before (approximate):

```jsx
if (authChecked && !authUser) {
  return showAuth ? <AuthPage onAuth={handleAuth} onCancel={() => setShowAuth(false)} /> : <LandingPage onSignIn={() => setShowAuth(true)} />
}
return <Layout ...>...</Layout>
```

After:

```jsx
return (
  <Layout
    theme={theme}
    toggleTheme={toggleTheme}
    signInSlot={!isAuthenticated ? <SignInButton /> : null}
    userEmail={userEmail}
    onLogout={async () => {
      await storeAdapter.logout()
      window.location.reload()
    }}
  >
    {migrationStatus === 'running' && (
      <div className="bg-amber-500 text-neutral-950 px-4 py-2 text-sm">{en.migration.running}</div>
    )}
    {migrationStatus === 'error' && (
      <div className="bg-red-500 text-white px-4 py-2 text-sm">{en.migration.error}</div>
    )}
    {/* ... the rest of the existing children ... */}
  </Layout>
)
```

- [ ] **Step 7: Update Layout.jsx to accept `signInSlot`, `userEmail`, `onLogout` props.**

Read `client/src/components/Layout.jsx` and add the three new props. Render `signInSlot` in the header right-side; if `userEmail` is present, render a small user chip with an `onLogout` handler attached to a sign-out link.

- [ ] **Step 8: Run type check / lint / tests.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -10
```

Expected: 36 tests pass. If any hook imports fail, recheck Task 1-5 commits are in place.

- [ ] **Step 9: Dev smoke test — open the app in a browser.**

```bash
pkill -9 -f "tsx.*index.js" 2>/dev/null; pkill -9 -f vite 2>/dev/null; sleep 1
cd /home/lz/workspace/journal
rm -f data/journal.db*
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test \
  NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev > /tmp/plan3-dev.log 2>&1 &
sleep 10
curl -s --noproxy '*' -o - -w "\nHTTP %{http_code}\n" http://localhost:3000/
tail -30 /tmp/plan3-dev.log
```

Expected: Vite serves HTML on :3000 (HTTP 200). No crashes in the dev log.

Open `http://localhost:3000/` in a browser (if the test environment has a browser). You should see:
- The main app UI (NOT the LandingPage)
- A "Sign in to sync" button in the header
- 33 default pairs available in the pair dropdown (seeded from LocalStore)
- 18 default policies under the Policy tab

- [ ] **Step 10: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: wire useStore + useStoreAdapter + useMigrationTrigger into App.jsx

Anonymous users see the full app with LocalStore backing.
Signed-in users hit ApiStore. Migration trigger on
?just_signed_in=1 drains local → server. Removed the
LandingPage/AuthPage gate and all references to Telegram,
quota, and upgrade.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: Translate `constants.js` → `constants.ts` with English values

**Files:**
- Modify: `client/src/lib/constants.js` → rename to `constants.ts`

The legacy constants hold Chinese strings for `STRATEGIES`, `EMOTIONS`, `SCORES`, `TIMEFRAMES`, `WEEKDAYS`, and `SPREAD_COST`. Strategies/emotions/scores get English labels matching `en.ts`; timeframes stay as-is (H1, H4, D1 are language-neutral); WEEKDAYS go to English. SPREAD_COST is no longer used (pairs table has spread_cost per row) — delete it.

- [ ] **Step 1: Rewrite the file with English values.**

```bash
mv /home/lz/workspace/journal/client/src/lib/constants.js /home/lz/workspace/journal/client/src/lib/constants.ts
```

Replace content:

```ts
import { en } from '../i18n/en'

export const STRATEGIES: Array<{ value: string; label: string }> = [
  { value: 'trend', label: en.strategy.trend },
  { value: 'pullback', label: en.strategy.pullback },
  { value: 'breakout', label: en.strategy.breakout },
  { value: 'range', label: en.strategy.range },
  { value: 'reversal', label: en.strategy.reversal },
  { value: 'news', label: en.strategy.news },
  { value: 'scalp', label: en.strategy.scalp },
  { value: 'other', label: en.strategy.other },
]

export const EMOTIONS: Array<{ value: string; label: string }> = [
  { value: 'calm', label: en.emotion.calm },
  { value: 'confident', label: en.emotion.confident },
  { value: 'anxious', label: en.emotion.anxious },
  { value: 'fearful', label: en.emotion.fearful },
  { value: 'greedy', label: en.emotion.greedy },
  { value: 'fomo', label: en.emotion.fomo },
  { value: 'bored', label: en.emotion.bored },
  { value: 'tilted', label: en.emotion.tilted },
  { value: 'hopeful', label: en.emotion.hopeful },
]

export const SCORES: Array<{ value: 'A' | 'B' | 'C' | 'D'; label: string; desc: string }> = [
  { value: 'A', label: en.score.A, desc: en.score.ADesc },
  { value: 'B', label: en.score.B, desc: en.score.BDesc },
  { value: 'C', label: en.score.C, desc: en.score.CDesc },
  { value: 'D', label: en.score.D, desc: en.score.DDesc },
]

export const TIMEFRAMES: string[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN']

export const WEEKDAYS: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const DIRECTIONS: Array<{ value: 'long' | 'short'; label: string }> = [
  { value: 'long', label: en.trade.long },
  { value: 'short', label: en.trade.short },
]

export const ASSET_CLASSES: Array<{ value: 'forex' | 'metals' | 'energy' | 'crypto_perp'; label: string }> = [
  { value: 'forex', label: en.assetClass.forex },
  { value: 'metals', label: en.assetClass.metals },
  { value: 'energy', label: en.assetClass.energy },
  { value: 'crypto_perp', label: en.assetClass.crypto_perp },
]
```

- [ ] **Step 2: Update all importers to use the new file.**

```bash
cd /home/lz/workspace/journal
grep -rn "from '.*lib/constants'" client/src/ --include="*.jsx" --include="*.js" --include="*.ts" --include="*.tsx"
```

Every import is extensionless (`from '../lib/constants'`), so no change needed — Vite resolves to `.ts` now.

- [ ] **Step 3: Run tests + dev smoke.**

```bash
pnpm test 2>&1 | tail -6
```

Expected: 36 tests pass.

- [ ] **Step 4: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: constants.ts with English labels via i18n/en

STRATEGIES / EMOTIONS / SCORES / DIRECTIONS / ASSET_CLASSES /
TIMEFRAMES / WEEKDAYS all keyed off en.ts. Legacy SPREAD_COST
constant deleted (spread_cost now lives on each pair row).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 8: Translate components to English (batch)

**Files:**
- Modify: `client/src/components/TradeForm.jsx`
- Modify: `client/src/components/TradeTable.jsx`
- Modify: `client/src/components/Dashboard.jsx`
- Modify: `client/src/components/PsychologyPanel.jsx`
- Modify: `client/src/components/WeeklyNotes.jsx`
- Modify: `client/src/components/MonthlyNotes.jsx`
- Modify: `client/src/components/NotesTab.jsx`
- Modify: `client/src/components/OpenPositions.jsx`
- Modify: `client/src/components/MoreTab.jsx`
- Modify: `client/src/components/Policies.jsx`
- Modify: `client/src/components/Settings.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/components/ExportBar.jsx`
- Modify: `client/src/components/TradeFilter.jsx`

For each component, replace every Chinese string literal with the corresponding `en.xxx.yyy` key. This is a mechanical grep-and-replace task that takes the longest wall-clock time.

- [ ] **Step 1: Produce a grep of every Chinese string in the client.**

```bash
cd /home/lz/workspace/journal
grep -rn '[\x{4e00}-\x{9fff}]' client/src/components/ client/src/App.jsx --include="*.jsx" --include="*.js" 2>&1 | head -80
```

The output lists `file:line: content` for every Chinese character.

- [ ] **Step 2: For each component file, open it and replace Chinese strings with `{en.xxx.yyy}` JSX references.**

The replacement list:

| Chinese | English / key |
|---|---|
| `新增交易` | `{en.trade.new}` |
| `编辑交易` | `{en.trade.edit}` |
| `平仓` | `{en.trade.close}` |
| `删除` | `{en.common.delete}` |
| `品种` | `{en.trade.pair}` |
| `方向` | `{en.trade.direction}` |
| `多` | `{en.trade.long}` |
| `空` | `{en.trade.short}` |
| `策略` | `{en.trade.strategy}` |
| `周期` / `时间框架` | `{en.trade.timeframe}` |
| `手数` | `{en.trade.lots}` |
| `入场价` | `{en.trade.entry}` |
| `止损` | `{en.trade.stop}` |
| `目标` | `{en.trade.target}` |
| `出场价` | `{en.trade.exitPrice}` |
| `盈亏` / `毛盈亏` | `{en.trade.grossPnl}` |
| `隔夜利息` | `{en.trade.swap}` |
| `风险金额` | `{en.trade.riskAmount}` |
| `执行评分` | `{en.trade.score}` |
| `情绪` | `{en.trade.emotion}` |
| `备注` | `{en.trade.notes}` |
| `开仓时间` | `{en.trade.openTime}` |
| `平仓时间` | `{en.trade.closeTime}` |
| `完美执行` | `{en.score.A}` |
| `较好` / similar tier labels | `{en.score.B/C/D}` |
| `胜率` | `{en.stats.winRate}` |
| `盈亏比` | `{en.stats.profitFactor}` |
| `总盈亏` / `净盈亏` | `{en.stats.totalPnl}` |
| `平均R` | `{en.stats.avgR}` |
| `交易数` | `{en.stats.tradeCount}` |
| `最长连胜` | `{en.stats.maxWinStreak}` |
| `最长连败` | `{en.stats.maxLossStreak}` |
| `按品种` | `{en.stats.byPair}` |
| `按策略` | `{en.stats.byStrategy}` |
| `按情绪` | `{en.stats.byEmotion}` |
| `按星期` | `{en.stats.byDay}` |
| `按周期` | `{en.stats.byTimeframe}` |
| `累计盈亏` | `{en.stats.cumPnl}` |
| `周复盘` | `{en.notes.weekly.title}` |
| `月复盘` | `{en.notes.monthly.title}` |
| `周` | `{en.notes.weekly.week}` |
| `月` | `{en.notes.monthly.month}` |
| `心得` | `{en.notes.weekly.lesson}` |
| `计划` | `{en.notes.weekly.plan}` |
| `纪律规则` | `{en.policy.title}` |
| `分类` | `{en.policy.category}` |
| `阶段` | `{en.policy.phase}` |
| `入场` | `{en.policy.phases.entry}` |
| `出场` | `{en.policy.phases.exit}` |
| `两者` | `{en.policy.phases.both}` |
| `启用` | `{en.policy.active}` |
| `停用` | `{en.policy.inactive}` |
| `规则` | `{en.policy.categories.rules}` |
| `策略` (policy category) | `{en.policy.categories.strategy}` |
| `风险` | `{en.policy.categories.risk}` |
| `记录` (tab) | `{en.tabs.record}` |
| `统计` (tab) | `{en.tabs.stats}` |
| `周度` / `周复盘` (tab) | `{en.tabs.weekly}` |
| `月度` / `月复盘` (tab) | `{en.tabs.monthly}` |
| `纪律` (tab) | `{en.tabs.policy}` |
| `设置` (tab) | `{en.tabs.settings}` |
| `更多` (tab) | `{en.tabs.more}` |
| `保存` | `{en.common.save}` |
| `取消` | `{en.common.cancel}` |
| `编辑` | `{en.common.edit}` |
| `确认` | `{en.common.confirm}` |
| `关闭` | `{en.common.close}` |

Additional component-specific replacements discovered during the grep go through the same `{en.xxx}` pattern — add new keys to `i18n/en.ts` as needed and commit both files together.

The `direction` field has a data-format change: everywhere that wrote `"多"` or `"空"` as a string value (not a label), change to `"long"` / `"short"`. Check TradeForm / TradeTable / any state-defaulting helper.

Check TradeForm's `emptyTrade` default for `direction`:
```bash
grep -n "direction" client/src/components/TradeForm.jsx | head -20
```

Ensure `emptyTrade.direction` is `'long'` (not `'多'`).

- [ ] **Step 3: After each file is done, run the test suite to catch any compile errors.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -6
```

Expected: 36 tests continue to pass.

- [ ] **Step 4: Commit after every 3-4 files** (to keep commits small). Example:

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: translate TradeForm, TradeTable, Dashboard to English via en.ts

Chinese string literals replaced with {en.xxx.yyy} references.
Direction field values switched from 多/空 to long/short.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Repeat for remaining batches until every client component is English.

- [ ] **Step 5: Final grep to confirm no Chinese remains.**

```bash
cd /home/lz/workspace/journal
grep -rn '[\x{4e00}-\x{9fff}]' client/src/ --include="*.jsx" --include="*.js" --include="*.ts" --include="*.tsx" | wc -l
```

Expected: 0 (or only inside the legacy `LandingPage.jsx` which is not wired up and will be replaced in Plan 4).

- [ ] **Step 6: Final commit and push.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat: translate remaining client UI to English

All client/src/components/*.jsx now read their labels from en.ts.
Grep for CJK range returns 0 hits outside LandingPage.jsx (unused
in Plan 3; replaced by Plan 4 marketing page).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 9: Perf Fix 3 — useMemo on calcStats and Recharts data

**Files:**
- Modify: `client/src/components/Dashboard.jsx`
- Modify: `client/src/components/PsychologyPanel.jsx`

Spec §9 Fix 3 requires `useMemo` wrappers around `calcStats(trades)` results and every Recharts `data=` prop so that re-renders of unrelated App.jsx state do not recompute the stat pipeline or rebuild chart data arrays.

- [ ] **Step 1: In Dashboard.jsx, find the `calcStats` call site.**

Likely looks like:

```jsx
const stats = calcStats(trades, spreadCostMap)
```

Wrap with useMemo:

```jsx
const pairsByName = useMemo(
  () => new Map(pairs.map((p) => [p.name, p])),
  [pairs]
)
const stats = useMemo(() => calcStats(trades, pairsByName), [trades, pairsByName])
```

(Note: `spreadCostMap` is legacy — the new `calcStats` signature takes `pairsByName: Map<string, Pair>`. This also changes the call site.)

- [ ] **Step 2: Find every `<LineChart>` / `<BarChart>` / `<AreaChart>` / similar `data={...}` in Dashboard.jsx.**

For each, if the data is computed inline (e.g., `data={stats.cumPnl.map(x => ...)}`), extract to a useMemo:

```jsx
const cumPnlData = useMemo(
  () => stats?.cumPnl ?? [],
  [stats]
)
// ...
<LineChart data={cumPnlData}>...</LineChart>
```

Do this for each chart data array.

- [ ] **Step 3: Apply the same pattern in PsychologyPanel.jsx.**

- [ ] **Step 4: Make sure `useMemo` is imported.**

```bash
grep -n "useMemo" client/src/components/Dashboard.jsx client/src/components/PsychologyPanel.jsx
```

If missing, add to the existing `import { useState, useEffect } from 'react'` line.

- [ ] **Step 5: Run tests.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -6
```

Expected: 36 tests continue to pass.

- [ ] **Step 6: Commit.**

```bash
git add -A
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "perf: useMemo calcStats + Recharts data arrays (spec §9 Fix 3)

Re-renders of unrelated App.jsx state (tab switches, filter
changes, form toggles) no longer recompute the stats pipeline or
rebuild chart data arrays. calcStats is now called with a
pairsByName Map memoized from the pairs state.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 10: End-to-end smoke test + tag

- [ ] **Step 1: Kill orphan processes.**

```bash
pkill -9 -f "tsx.*index.js" 2>/dev/null
pkill -9 -f "node.*index.js" 2>/dev/null
pkill -9 -f vite 2>/dev/null
sleep 1
ps aux | grep -E "tsx|node.*index|vite" | grep -v grep | wc -l
```

Expected: 0.

- [ ] **Step 2: Fresh DB, boot dev server with client.**

```bash
cd /home/lz/workspace/journal
rm -f data/journal.db data/journal.db-shm data/journal.db-wal
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test \
  NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev > /tmp/plan3-smoke.log 2>&1 &
DEV=$!
sleep 12
```

- [ ] **Step 3: Verify both server and client respond.**

```bash
curl -s --noproxy '*' -o - -w "\nHTTP %{http_code}\n" http://localhost:3001/api/health
curl -s --noproxy '*' -o - -w "\nHTTP %{http_code}\n" http://localhost:3000/ | head -20
```

Expected: server /api/health returns 200; client root serves HTML (HTTP 200).

- [ ] **Step 4: Simulate full anonymous → sign-in → migrate flow via curl.**

```bash
# Magic-link request
curl -s --noproxy '*' -X POST http://localhost:3001/api/auth/magic-link \
  -H 'Content-Type: application/json' \
  -d '{"email":"plan3@smoke.test","turnstileToken":"skip"}'
echo

# Extract token, hit verify, capture cookie
TOKEN=$(node -e "
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('/home/lz/workspace/journal/data/journal.db');
const r = db.prepare('SELECT token FROM magic_link_tokens').get();
process.stdout.write(r.token);
")
curl -s --noproxy '*' -c /tmp/plan3-cookies.txt -i "http://localhost:3001/auth/verify?token=$TOKEN" | head -5

# Post a migration with a trade using the new long direction
curl -s --noproxy '*' -b /tmp/plan3-cookies.txt \
  -X POST http://localhost:3001/api/migrate \
  -H 'Content-Type: application/json' \
  -d '{
    "trades": [{
      "external_id": "plan3-trade-1",
      "open_time": "2026-04-14T10:00",
      "pair": "EUR/USD",
      "asset_class": "forex",
      "direction": "long",
      "strategy": "breakout",
      "timeframe": "H1",
      "lots": 1,
      "entry": 1.1,
      "stop": 1.095,
      "exit_price": 1.105,
      "gross_pnl": 500,
      "status": "closed"
    }],
    "weekly_notes": [],
    "monthly_notes": [],
    "policies": [],
    "pairs": [],
    "trade_violations": []
  }'
echo

# DB verification
node -e "
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('/home/lz/workspace/journal/data/journal.db');
const trade = db.prepare('SELECT * FROM trades WHERE external_id = ?').get('plan3-trade-1');
console.log('direction:', trade.direction, 'asset_class:', trade.asset_class);
"

kill $DEV 2>/dev/null
wait $DEV 2>/dev/null
```

Expected:
- migrate returns `{"trades":1,...}`
- trade direction is `"long"` (not `"多"`)

- [ ] **Step 5: Run the vitest suite.**

```bash
cd /home/lz/workspace/journal
pnpm test 2>&1 | tail -6
```

Expected: 36 tests pass.

- [ ] **Step 6: Tag and push.**

```bash
git tag -a plan-3-complete -m "Plan 3 — App wiring + English UI + perf Fix 3

10 tasks: calcStats ported to tradeCalc.ts, deprecated components
removed, i18n/en.ts dictionary, SignInButton + SignInDialog,
useStoreAdapter legacy-to-JournalStore bridge, App.jsx wired with
useStore + useMigrationTrigger, constants.ts with English labels,
components translated, useMemo on stats and charts.

36 tests pass. Anonymous user sees English journal UI with 33
seeded pairs; sign-in triggers migrate; direction values now
long/short across data path."
git push --tags
```

---

## Self-Review Checklist

**Spec coverage (Plan 3 goals):**
- §2 value proposition "works anonymously in your browser" → Task 6 App.jsx renders to anonymous users ✓
- §3 "English-only UI" → Task 3 i18n/en.ts, Task 7 constants.ts, Task 8 components ✓
- §3 "Magic-link email sign-in" → Task 4 SignInButton + SignInDialog ✓
- §3 "Cross-device sync via /api/migrate" → Task 6 wires useMigrationTrigger ✓
- §7 Anonymous local-first → Task 6 App.jsx renders to anonymous users without forcing login ✓
- §8 asset-class-polymorphic calc → Task 1 calcStats uses polymorphic calcTrade ✓
- §9 Perf Fix 3 (useMemo) → Task 9 ✓
- §9 Perf Fix 4 (indexes) → Plan 1 Task 4 schema already has indexes
- §9 Fix 1+2 deferred → out of scope per spec

**Placeholder scan:**
- No TBD / TODO / "implement later" in any task body.
- Task 8 uses a translation table format ("for every file, replace these strings") which is more prescriptive than task-by-task; this is intentional because listing 14 separate translation tasks would quadruple the plan length without adding clarity. The table shows exactly which string to replace with which key; the task is mechanical.

**Type consistency:**
- `JournalStore` interface from Plan 2 used by `useStoreAdapter` in Task 5 ✓
- `calcStats(trades, pairsByName)` signature defined in Task 1 is consumed by Task 9's `useMemo` wrapping ✓
- `StoreAdapter` interface from Task 5 provides method names matching legacy `api.*`, so Task 6's App.jsx mechanical rename works ✓
- `en.signIn.checkInboxDesc` uses `{email}` template placeholder; Task 4 SignInDialog does the replacement ✓

**Gaps:**
- `LandingPage.jsx` is kept but unused in Plan 3. It still contains Chinese strings. Plan 4 replaces it with a proper English landing page; for Plan 3 it's a dead file. Acceptable.
- No unit tests added for `useStoreAdapter` or `SignInDialog` — these are tightly coupled to fetch and DOM and would need an integration-test harness. Accepted as a known gap; Plan 5 deployment readiness review can revisit.

---

*End of Plan 3.*
