import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    open_time TEXT NOT NULL,
    close_time TEXT,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL,
    strategy TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    lots REAL,
    entry REAL NOT NULL,
    stop REAL NOT NULL,
    target REAL,
    exit_price REAL,
    gross_pnl REAL,
    swap REAL DEFAULT 0,
    score TEXT,
    emotion TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'closed',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS weekly_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    week TEXT NOT NULL,
    lesson TEXT,
    plan TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS monthly_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    month TEXT NOT NULL,
    lesson TEXT,
    plan TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    spread_cost REAL DEFAULT 5,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trade_violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Default seed data for new user registration
const defaultPairs = {
  "EUR/USD": 3.5, "GBP/USD": 4, "USD/JPY": 3, "AUD/USD": 3.5,
  "NZD/USD": 4.5, "USD/CAD": 4, "USD/CHF": 4, "EUR/GBP": 4.5,
  "EUR/JPY": 5, "GBP/JPY": 6, "AUD/JPY": 5, "NZD/JPY": 5,
  "CAD/JPY": 5, "AUD/CAD": 4, "EUR/AUD": 5, "USD/CNH": 8,
  "XAU/USD": 12, "XAG/USD": 10, "USOil": 5, "UKOil": 6,
  "NGAS": 8, "Copper": 5, "BABA.hk": 1
}

const defaultPolicies = [
  { category: 'rules', title: '每日最大亏损不超过账户净值的2%', content: '单日累计亏损达到账户净值2%时，立即停止交易，避免情绪化操作导致更大亏损。', phase: 'both' },
  { category: 'rules', title: '连续亏损3笔后当日停止交易', content: '连续3笔亏损说明当前市场状态与你的策略不匹配，继续交易大概率会增加亏损。', phase: 'both' },
  { category: 'rules', title: '不在重大数据公布前30分钟内开新仓', content: '重大经济数据（非农、CPI、央行决议等）公布前后市场波动剧烈，点差扩大，不适合入场。', phase: 'entry' },
  { category: 'rules', title: '每笔交易必须设置止损', content: '止损是保护资金的最后防线，任何交易都必须在入场时就设定好止损价位。', phase: 'entry' },
  { category: 'rules', title: '不做报复性交易', content: '亏损后立即反向开仓或加大仓位企图回本，是最常见的亏损原因之一。亏损后应冷静分析，而非冲动操作。', phase: 'entry' },
  { category: 'strategy', title: '趋势交易必须等待至少一次回调确认', content: '趋势中直接追涨杀跌容易被套在高点/低点，等待回调到支撑/阻力位再入场可以获得更好的风险回报比。', phase: 'entry' },
  { category: 'strategy', title: '突破交易需等待收盘确认', content: '假突破非常常见，等待K线收盘确认突破有效后再入场，可以大幅减少假突破带来的亏损。', phase: 'entry' },
  { category: 'strategy', title: '逆势交易仓位减半', content: '逆势交易成功率较低，通过减小仓位来控制风险，即使判断错误损失也在可控范围内。', phase: 'entry' },
  { category: 'strategy', title: '多时间框架确认', content: '至少2个时间级别方向一致时才入场。例如日线看多+4小时看多，避免在大周期逆势的情况下操作。', phase: 'entry' },
  { category: 'strategy', title: '入场前明确记录入场理由和预期目标', content: '写下为什么入场、目标在哪、止损在哪，可以帮助你保持理性，避免模糊的"感觉"驱动交易。', phase: 'entry' },
  { category: 'risk', title: '单笔风险不超过账户净值的1%', content: '控制单笔交易的最大亏损在账户的1%以内，这样即使连续亏损10笔，账户仍然有90%以上的资金。', phase: 'entry' },
  { category: 'risk', title: '同方向最多持有3个仓位', content: '同方向持仓过多会导致风险集中，一旦行情反转会面临巨大亏损。分散持仓可以降低系统性风险。', phase: 'entry' },
  { category: 'risk', title: '盈亏比低于1:1.5的交易不开仓', content: '只做潜在盈利大于潜在亏损1.5倍以上的交易，长期下来即使胜率只有40%也能盈利。', phase: 'entry' },
  { category: 'risk', title: '浮盈超过1R后将止损移至成本价', content: '当浮盈达到一倍风险值（1R）后，将止损移到成本价，确保这笔交易不会从盈利变成亏损。', phase: 'exit' },
  { category: 'risk', title: '每周最大亏损不超过账户净值的5%', content: '设定周度亏损上限，达到后本周停止交易。这能防止在不利的市场环境中持续亏损。', phase: 'both' },
]

export function seedUserData(userId) {
  const insertPair = db.prepare('INSERT INTO pairs (user_id, name, spread_cost, sort_order) VALUES (?, ?, ?, ?)')
  const insertPolicy = db.prepare('INSERT INTO policies (user_id, category, title, content, sort_order, phase) VALUES (?, ?, ?, ?, ?, ?)')
  const seed = db.transaction(() => {
    Object.entries(defaultPairs).forEach(([name, cost], i) => {
      insertPair.run(userId, name, cost, i)
    })
    defaultPolicies.forEach((p, i) => {
      insertPolicy.run(userId, p.category, p.title, p.content, i, p.phase)
    })
  })
  seed()
}

// Migration: add status column if missing
const columns = db.prepare("PRAGMA table_info(trades)").all()
const hasStatus = columns.some(c => c.name === 'status')
if (!hasStatus) {
  db.exec(`
    ALTER TABLE trades RENAME TO trades_old;
    CREATE TABLE trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      date TEXT NOT NULL,
      pair TEXT NOT NULL,
      direction TEXT NOT NULL,
      strategy TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      lots REAL,
      entry REAL NOT NULL,
      stop REAL NOT NULL,
      target REAL,
      exit_price REAL,
      gross_pnl REAL,
      swap REAL DEFAULT 0,
      score TEXT,
      emotion TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'closed',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO trades (id, date, pair, direction, strategy, timeframe, lots, entry, stop, target, exit_price, gross_pnl, swap, score, emotion, notes, status, created_at, updated_at)
      SELECT id, date, pair, direction, strategy, timeframe, lots, entry, stop, target, exit_price, gross_pnl, swap, score, emotion, notes, 'closed', created_at, updated_at FROM trades_old;
    DROP TABLE trades_old;
  `)
}

// Migration: add user_id column to existing tables if missing
const tradeCols = db.prepare("PRAGMA table_info(trades)").all()
if (!tradeCols.some(c => c.name === 'user_id')) {
  db.exec('ALTER TABLE trades ADD COLUMN user_id INTEGER REFERENCES users(id)')
}
const weekCols = db.prepare("PRAGMA table_info(weekly_notes)").all()
if (!weekCols.some(c => c.name === 'user_id')) {
  db.exec('ALTER TABLE weekly_notes ADD COLUMN user_id INTEGER REFERENCES users(id)')
}
const monthCols = db.prepare("PRAGMA table_info(monthly_notes)").all()
if (!monthCols.some(c => c.name === 'user_id')) {
  db.exec('ALTER TABLE monthly_notes ADD COLUMN user_id INTEGER REFERENCES users(id)')
}
const pairCols = db.prepare("PRAGMA table_info(pairs)").all()
if (!pairCols.some(c => c.name === 'user_id')) {
  db.exec('ALTER TABLE pairs ADD COLUMN user_id INTEGER REFERENCES users(id)')
}
const policyCols = db.prepare("PRAGMA table_info(policies)").all()
if (!policyCols.some(c => c.name === 'user_id')) {
  db.exec('ALTER TABLE policies ADD COLUMN user_id INTEGER REFERENCES users(id)')
}

// Migration: add phase column to policies
const policyColsPhase = db.prepare("PRAGMA table_info(policies)").all()
if (!policyColsPhase.some(c => c.name === 'phase')) {
  db.exec("ALTER TABLE policies ADD COLUMN phase TEXT NOT NULL DEFAULT 'both'")
}

// Migration: remove UNIQUE constraint on pairs.name (now per-user)
const pairIndexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pairs'").get()
if (pairIndexes && pairIndexes.sql && pairIndexes.sql.includes('UNIQUE')) {
  db.exec(`
    ALTER TABLE pairs RENAME TO pairs_old;
    CREATE TABLE pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      spread_cost REAL DEFAULT 5,
      sort_order INTEGER DEFAULT 0
    );
    INSERT INTO pairs (id, user_id, name, spread_cost, sort_order)
      SELECT id, user_id, name, spread_cost, sort_order FROM pairs_old;
    DROP TABLE pairs_old;
  `)
}

// Migration: add risk_amount column to trades
const tradeColsRisk = db.prepare("PRAGMA table_info(trades)").all()
if (!tradeColsRisk.some(c => c.name === 'risk_amount')) {
  db.exec("ALTER TABLE trades ADD COLUMN risk_amount REAL DEFAULT NULL")
}

// Migration: rename date → open_time, add close_time
const tradeColsTime = db.prepare("PRAGMA table_info(trades)").all()
const hasDate = tradeColsTime.some(c => c.name === 'date')
const hasOpenTime = tradeColsTime.some(c => c.name === 'open_time')
if (hasDate && !hasOpenTime) {
  db.exec(`
    ALTER TABLE trades RENAME TO trades_old_time;
    CREATE TABLE trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      open_time TEXT NOT NULL,
      close_time TEXT,
      pair TEXT NOT NULL,
      direction TEXT NOT NULL,
      strategy TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      lots REAL,
      entry REAL NOT NULL,
      stop REAL NOT NULL,
      target REAL,
      exit_price REAL,
      gross_pnl REAL,
      swap REAL DEFAULT 0,
      score TEXT,
      emotion TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'closed',
      risk_amount REAL DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO trades (id, user_id, open_time, close_time, pair, direction, strategy, timeframe, lots, entry, stop, target, exit_price, gross_pnl, swap, score, emotion, notes, status, risk_amount, created_at, updated_at)
      SELECT id, user_id, date || 'T00:00', NULL, pair, direction, strategy, timeframe, lots, entry, stop, target, exit_price, gross_pnl, swap, score, emotion, notes, status, risk_amount, created_at, updated_at FROM trades_old_time;
    DROP TABLE trades_old_time;
  `)
}

// Migration: fix trade_violations foreign key after trades table rebuild
const tvSchema = db.prepare("SELECT sql FROM sqlite_master WHERE name='trade_violations'").get()
if (tvSchema && tvSchema.sql && tvSchema.sql.includes('trades_old_time')) {
  db.exec(`
    ALTER TABLE trade_violations RENAME TO trade_violations_old;
    CREATE TABLE trade_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO trade_violations (id, trade_id, policy_id, notes, created_at)
      SELECT id, trade_id, policy_id, notes, created_at FROM trade_violations_old;
    DROP TABLE trade_violations_old;
  `)
}

// Migration: add Telegram fields to users table
const userCols = db.prepare("PRAGMA table_info(users)").all()
if (!userCols.some(c => c.name === 'telegram_id')) {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      telegram_id TEXT UNIQUE,
      display_name TEXT,
      avatar_url TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      plan_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO users_new (id, username, email, password, created_at)
      SELECT id, username, email, password, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `)
  db.pragma('foreign_keys = ON')
}

export default db
