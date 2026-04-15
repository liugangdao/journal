import { describe, it, expect } from 'vitest'
import { calcTrade } from '../src/lib/tradeCalc'
import type { Trade, Pair } from '../src/stores/types'

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
    expect(out.grossPnl).toBeCloseTo(500, 0)
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
    expect(out.grossPnl).toBeCloseTo(100, 0)
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
  it('uses user-entered gross_pnl directly', () => {
    const trade: Trade = {
      pair: 'BTC/USDT',
      asset_class: 'crypto_perp',
      direction: 'long',
      quantity: 0.5,
      entry: 60000,
      stop: 58000,
      exit_price: 62000,
      gross_pnl: 950,
      status: 'closed',
    }
    const out = calcTrade(trade, btc)
    expect(out.grossPnl).toBe(950)
  })

  it('R-multiple when risk_amount is provided', () => {
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
    const trade = {
      pair: 'BTC/USDT',
      asset_class: 'crypto_perp',
      entry: 60000,
      stop: 58000,
      exit_price: 62000,
      gross_pnl: 1000,
      status: 'closed',
    } as unknown as Trade
    expect(() => calcTrade(trade, btc)).toThrow(/direction/i)
  })
})
