package store

import (
	"database/sql"
	"errors"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/liugangdao/journal/internal/rules"
	"modernc.org/sqlite"
)

var (
	ErrNotFound = errors.New("记录不存在")
	ErrConflict = errors.New("记录冲突")
)

// conflictError 是带具体说明的冲突，errors.Is(err, ErrConflict) 仍成立，接口原样返回说明。
type conflictError struct{ msg string }

func (e *conflictError) Error() string        { return e.msg }
func (e *conflictError) Is(target error) bool { return target == ErrConflict }

// ErrAlreadyClosed 表示重复平仓，常见于两台设备先后平同一笔。
var ErrAlreadyClosed error = &conflictError{msg: "这笔交易已经平仓（可能已在另一台设备上操作），请刷新后查看"}

type InvalidError struct{ Msg string }

func (e *InvalidError) Error() string { return e.Msg }
func invalidError(msg string) error   { return &InvalidError{Msg: msg} }

type Settings struct {
	RiskPct   float64 `json:"risk_pct"`
	MinSample int     `json:"min_sample"`
}

type Store struct {
	db  *sql.DB
	def rules.Definition
}

type querier interface {
	Exec(string, ...any) (sql.Result, error)
	Query(string, ...any) (*sql.Rows, error)
	QueryRow(string, ...any) *sql.Row
}

// schemaVersion 是当前数据库结构版本。版本 4 起不再兼容更早的数据库。
const schemaVersion = 4

const schema = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
INSERT INTO schema_version SELECT 4 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
CREATE TABLE IF NOT EXISTS settings (
 id INTEGER PRIMARY KEY CHECK(id=1), risk_pct REAL NOT NULL, min_sample INTEGER NOT NULL
);
INSERT OR IGNORE INTO settings VALUES (1,1.0,30);
CREATE TABLE IF NOT EXISTS strategies (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, strategy_id INTEGER NOT NULL REFERENCES strategies(id),
 no INTEGER NOT NULL, rules TEXT NOT NULL, kill_recent_n INTEGER, kill_recent_below REAL,
 kill_max_dd_r REAL, created_at TEXT NOT NULL, UNIQUE(strategy_id,no)
);
CREATE TABLE IF NOT EXISTS trades (
 id INTEGER PRIMARY KEY AUTOINCREMENT, version_id INTEGER NOT NULL REFERENCES strategy_versions(id),
 symbol TEXT NOT NULL, side TEXT NOT NULL, entry REAL NOT NULL, stop REAL NOT NULL,
 equity REAL NOT NULL, risk_pct REAL NOT NULL, qty REAL NOT NULL, entry_reason TEXT NOT NULL,
 phase TEXT NOT NULL, setup TEXT NOT NULL, key_level REAL NOT NULL, exit_plan TEXT NOT NULL,
 target REAL, checklist TEXT NOT NULL, deviations TEXT NOT NULL,
 opened_at TEXT NOT NULL, status TEXT NOT NULL, exit REAL, exit_reason TEXT, followed_rules INTEGER,
 review_note TEXT NOT NULL, high REAL, low REAL, funding REAL, closed_at TEXT
);
CREATE INDEX IF NOT EXISTS trades_version ON trades(version_id);
CREATE TABLE IF NOT EXISTS equity_calibrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, balance REAL NOT NULL, delta REAL,
 reason TEXT NOT NULL, created_at TEXT NOT NULL
);
`

var errOldDatabase = invalidError("旧版数据库不再兼容，请删除或换一个 JOURNAL_DB 路径")

// checkExisting 用只读、不改日志模式的连接检查已有数据库的版本，
// 避免正式连接的建表语句或 WAL 设置改写旧文件。
func checkExisting(fileURL string) error {
	db, err := sql.Open("sqlite", fileURL+"?mode=ro")
	if err != nil {
		return errors.New("无法打开数据库")
	}
	defer db.Close()
	var n int
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='schema_version'").Scan(&n); err != nil {
		return errors.New("无法读取数据库")
	}
	if n == 0 {
		var tables int
		if err := db.QueryRow("SELECT count(*) FROM sqlite_master").Scan(&tables); err != nil {
			return errors.New("无法读取数据库")
		}
		if tables > 0 {
			return errOldDatabase
		}
		return nil
	}
	var version int
	if err := db.QueryRow("SELECT version FROM schema_version").Scan(&version); err != nil || version != schemaVersion {
		return errOldDatabase
	}
	return nil
}

// Open 打开或新建数据库，并把代码中的策略定义同步进去。
func Open(path string, def rules.Definition) (*Store, error) {
	if err := def.Validate(); err != nil {
		return nil, invalidError(err.Error())
	}
	var dsn string
	if path == ":memory:" {
		dsn = ":memory:?"
	} else {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return nil, errors.New("数据库路径无效")
		}
		fileURL := (&url.URL{Scheme: "file", Path: absolute}).String()
		if _, err := os.Stat(absolute); err == nil {
			if err := checkExisting(fileURL); err != nil {
				return nil, err
			}
		}
		dsn = fileURL + "?"
	}
	// 单连接与即时写事务保证读改写串行；每个连接都启用外键、WAL 和忙等待。
	dsn += "_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_txlock=immediate"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, errors.New("无法打开数据库")
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db, def: def}
	err = s.transaction(func(tx *sql.Tx) error {
		if _, err := tx.Exec(schema); err != nil {
			return err
		}
		var version int
		if err := tx.QueryRow("SELECT version FROM schema_version").Scan(&version); err != nil {
			return err
		}
		if version != schemaVersion {
			return errOldDatabase
		}
		return syncStrategy(tx, def)
	})
	if err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Definition() rules.Definition { return s.def }

func (s *Store) Close() error {
	if err := s.db.Close(); err != nil {
		return errors.New("关闭数据库失败")
	}
	return nil
}

func dbError(err error) error {
	if err == nil {
		return nil
	}
	var invalid *InvalidError
	if errors.As(err, &invalid) || errors.Is(err, ErrNotFound) || errors.Is(err, ErrConflict) {
		return err
	}
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	var se *sqlite.Error
	if errors.As(err, &se) {
		switch se.Code() {
		case 1555, 2067:
			return ErrConflict
		case 787:
			return invalidError("引用的记录不存在")
		}
	}
	return errors.New("数据库操作失败")
}

func (s *Store) transaction(fn func(*sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return dbError(err)
	}
	defer tx.Rollback()
	if err = fn(tx); err != nil {
		return dbError(err)
	}
	return dbError(tx.Commit())
}

func finite(v float64) bool        { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func positive(v float64) bool      { return finite(v) && v > 0 }
func now() time.Time               { return time.Now().UTC().Round(0) }
func timestamp(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }
func parseTime(v string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, v)
	if err != nil {
		return t, errors.New("数据库时间格式不正确")
	}
	return t.UTC(), nil
}

func validateSettings(v Settings) error {
	if !positive(v.RiskPct) || v.RiskPct > 100 {
		return invalidError("风险比例必须大于 0 且不超过 100")
	}
	if v.MinSample < 2 {
		return invalidError("最少样本数必须至少为 2")
	}
	return nil
}

func getSettings(q querier) (Settings, error) {
	var v Settings
	err := q.QueryRow("SELECT risk_pct,min_sample FROM settings WHERE id=1").Scan(&v.RiskPct, &v.MinSample)
	return v, dbError(err)
}
func (s *Store) GetSettings() (Settings, error) { return getSettings(s.db) }
func (s *Store) PutSettings(v Settings) error {
	if err := validateSettings(v); err != nil {
		return err
	}
	_, err := s.db.Exec("UPDATE settings SET risk_pct=?,min_sample=? WHERE id=1", v.RiskPct, v.MinSample)
	return dbError(err)
}
