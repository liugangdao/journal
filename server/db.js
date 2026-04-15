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

// --- Migrations runner ----------------------------------------------------
const migrationsDir = join(__dirname, 'migrations')
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`)

const applied = new Set(
  db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
)

const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
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

// --- Default seed data (per spec §6) --------------------------------------
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
  { category: 'rules', title: 'Daily loss <= 2% of account equity', content: 'When cumulative daily loss reaches 2%, stop trading immediately to avoid emotional compounding.', phase: 'both' },
  { category: 'rules', title: 'Stop after 3 consecutive losses', content: 'Three losses in a row signals strategy-market mismatch; continuing raises loss probability.', phase: 'both' },
  { category: 'rules', title: 'No trades 30 min before or after high-impact data', content: 'Around NFP, CPI, and rate decisions, spreads widen and moves are erratic.', phase: 'entry' },
  { category: 'rules', title: 'Every trade has a stop-loss', content: 'The stop is your capital guarantee. No stop means unbounded risk. Always place it when entering.', phase: 'entry' },
  { category: 'rules', title: 'No revenge trading', content: 'Doubling down to win back losses is the single most common cause of account blow-ups. Step away.', phase: 'entry' },
  { category: 'strategy', title: 'Wait for pullback confirmation in trends', content: 'Chasing tops and bottoms in trends burns capital. Wait for retracement to support or resistance.', phase: 'entry' },
  { category: 'strategy', title: 'Require candle close to confirm breakouts', content: 'False breakouts are rampant. Wait for close above/below the level on your chosen timeframe.', phase: 'entry' },
  { category: 'strategy', title: 'Halve size on counter-trend trades', content: 'Counter-trend setups have lower win rates. Reduce size so an incorrect read stays survivable.', phase: 'entry' },
  { category: 'strategy', title: 'Require alignment across two timeframes', content: 'At least two timeframes must agree on direction before entering. Example: H4 + H1 both long.', phase: 'entry' },
  { category: 'strategy', title: 'Write entry thesis and target before placing the order', content: 'Documenting why, where to exit, and where to stop forces clarity and prevents gut-feel entries.', phase: 'entry' },
  { category: 'risk', title: 'Single-trade risk <= 1% of equity', content: 'Capping risk per trade means ten consecutive losses leaves 90%+ of capital intact.', phase: 'entry' },
  { category: 'risk', title: 'Max 3 open positions in same direction', content: 'Concentrated same-direction exposure amplifies drawdowns on reversal. Diversify.', phase: 'entry' },
  { category: 'risk', title: 'Skip trades with reward-to-risk below 1.5', content: 'Take only setups where potential profit is at least 1.5x the planned loss. Long term this is what pays.', phase: 'entry' },
  { category: 'risk', title: 'Move stop to breakeven after 1R profit', content: 'Once a trade is in 1R profit, trail the stop to entry. A winner never becomes a loser.', phase: 'exit' },
  { category: 'risk', title: 'Weekly loss <= 5% of equity', content: 'Cumulative weekly drawdown cap prevents continued bleeding in adverse market phases.', phase: 'both' },
  { category: 'rules', title: 'Check funding rate before holding overnight', content: 'Negative funding against your direction can exceed 100% annualized. Read the rate before every overnight hold.', phase: 'entry' },
  { category: 'rules', title: 'No trading in first 5 minutes after listing', content: 'New listings see extreme volatility, thin liquidity, and frequent wicks that liquidate even small-size positions.', phase: 'entry' },
  { category: 'rules', title: 'Close DEX positions before chain-congestion events', content: 'Major airdrop claims, protocol upgrades, or token launches spike gas and oracle lag. Exit proactively.', phase: 'entry' },
]

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function seedUserDefaults(userId) {
  const insertPair = db.prepare(
    'INSERT INTO pairs (user_id, external_id, name, asset_class, contract_size, price_precision, spread_cost, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertPolicy = db.prepare(
    'INSERT INTO policies (user_id, external_id, category, title, content, sort_order, phase) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const tx = db.transaction(() => {
    DEFAULT_PAIRS.forEach((p, i) => {
      const externalId = `seed-pair-${slugify(p.name)}`
      insertPair.run(userId, externalId, p.name, p.asset_class, p.contract_size, p.price_precision, p.spread_cost, i)
    })
    DEFAULT_POLICIES.forEach((p, i) => {
      const externalId = `seed-policy-${String(i).padStart(2, '0')}`
      insertPolicy.run(userId, externalId, p.category, p.title, p.content, i, p.phase)
    })
  })
  tx()
}

export default db
