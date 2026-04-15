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
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ trades: [mkTrade('a'), mkTrade('b')], total: 2 }),
    })
    const store = new ApiStore()
    const result = await store.listTrades()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trades',
      expect.objectContaining({ credentials: 'include', method: 'GET' })
    )
    expect(result).toHaveLength(2)
  })

  it('addTrade calls POST /api/trades with the payload', async () => {
    const trade = mkTrade('new')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: async () => JSON.stringify(trade),
    })
    const store = new ApiStore()
    const result = await store.addTrade(trade)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trades',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body as string)
    expect(body.external_id).toBe('new')
    expect(result.external_id).toBe('new')
  })

  it('throws with server error message on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ error: 'boom' }),
    })
    const store = new ApiStore()
    await expect(store.listTrades()).rejects.toThrow(/boom/)
  })
})
