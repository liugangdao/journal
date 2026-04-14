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
