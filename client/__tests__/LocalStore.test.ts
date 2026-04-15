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
    store = new LocalStore(`test-${Date.now()}-${Math.random()}`)
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

  it('listPairs auto-seeds 33 defaults on first call', async () => {
    const pairs = await store.listPairs()
    expect(pairs).toHaveLength(33)
    expect(pairs.find((p) => p.name === 'EUR/USD')?.external_id).toBe('seed-pair-eur-usd')
    expect(pairs.find((p) => p.name === 'BTC/USDT')?.external_id).toBe('seed-pair-btc-usdt')
  })

  it('listPolicies auto-seeds 18 defaults on first call', async () => {
    const policies = await store.listPolicies()
    expect(policies).toHaveLength(18)
    expect(policies[0].external_id).toBe('seed-policy-00')
  })
})
