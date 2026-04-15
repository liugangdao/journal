import type { Trade, Pair } from '../stores/types'

export interface TradeCalcOutput {
  pips: number | null
  grossPnl: number | null
  rMultiple: number | null
}

export function calcTrade(trade: Trade, pair: Pair): TradeCalcOutput {
  if (!trade.direction) throw new Error('Trade direction missing')
  if (trade.asset_class !== pair.asset_class) {
    throw new Error(
      `Trade asset_class ${trade.asset_class} does not match pair ${pair.asset_class}`
    )
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
