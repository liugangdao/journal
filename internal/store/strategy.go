package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/liugangdao/journal/internal/rules"
)

type Strategy struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}
type VersionInput struct {
	Rules           string   `json:"rules"`
	KillRecentN     *int     `json:"kill_recent_n"`
	KillRecentBelow *float64 `json:"kill_recent_below"`
	KillMaxDDR      *float64 `json:"kill_max_dd_r"`
}
type Version struct {
	ID         int64 `json:"id"`
	StrategyID int64 `json:"strategy_id"`
	No         int   `json:"no"`
	VersionInput
	CreatedAt time.Time `json:"created_at"`
}

type scanner interface{ Scan(...any) error }

func scanStrategy(row scanner) (Strategy, error) {
	var v Strategy
	var created string
	err := row.Scan(&v.ID, &v.Name, &created)
	if err != nil {
		return v, dbError(err)
	}
	v.CreatedAt, err = parseTime(created)
	return v, err
}

// 系统里只有一个策略，由 syncStrategy 在打开数据库时建立。
func getStrategy(q querier) (Strategy, error) {
	return scanStrategy(q.QueryRow("SELECT id,name,created_at FROM strategies ORDER BY id LIMIT 1"))
}
func listStrategies(q querier) ([]Strategy, error) {
	rows, err := q.Query("SELECT id,name,created_at FROM strategies ORDER BY id")
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	vs := []Strategy{}
	for rows.Next() {
		v, err := scanStrategy(rows)
		if err != nil {
			return nil, err
		}
		vs = append(vs, v)
	}
	return vs, dbError(rows.Err())
}
func (s *Store) Strategy() (Strategy, error) { return getStrategy(s.db) }

const versionColumns = "id,strategy_id,no,rules,kill_recent_n,kill_recent_below,kill_max_dd_r,created_at"

func scanVersion(row scanner) (Version, error) {
	var v Version
	var created string
	err := row.Scan(&v.ID, &v.StrategyID, &v.No, &v.Rules, &v.KillRecentN, &v.KillRecentBelow, &v.KillMaxDDR, &created)
	if err != nil {
		return v, dbError(err)
	}
	v.CreatedAt, err = parseTime(created)
	return v, err
}
func currentVersion(q querier) (Version, error) {
	return scanVersion(q.QueryRow("SELECT " + versionColumns + " FROM strategy_versions ORDER BY no DESC LIMIT 1"))
}
func (s *Store) CurrentVersion() (Version, error) { return currentVersion(s.db) }
func getVersion(q querier, id int64) (Version, error) {
	return scanVersion(q.QueryRow("SELECT "+versionColumns+" FROM strategy_versions WHERE id=?", id))
}
func (s *Store) GetVersion(id int64) (Version, error) { return getVersion(s.db, id) }

func listVersions(q querier) ([]Version, error) {
	rows, err := q.Query("SELECT " + versionColumns + " FROM strategy_versions ORDER BY no,id")
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	vs := []Version{}
	for rows.Next() {
		v, err := scanVersion(rows)
		if err != nil {
			return nil, err
		}
		vs = append(vs, v)
	}
	return vs, dbError(rows.Err())
}
func (s *Store) ListVersions() ([]Version, error) { return listVersions(s.db) }

// VersionDef 返回交易所属版本在代码中的定义。
func (s *Store) VersionDef(versionID int64) (rules.Version, error) {
	v, err := getVersion(s.db, versionID)
	if err != nil {
		return rules.Version{}, err
	}
	return s.versionDef(v.No)
}
func (s *Store) versionDef(no int) (rules.Version, error) {
	d, ok := s.def.Version(no)
	if !ok {
		return d, errors.New("代码中缺少策略版本定义")
	}
	return d, nil
}

func insertVersion(q querier, v Version) (Version, error) {
	result, err := q.Exec("INSERT INTO strategy_versions(strategy_id,no,rules,kill_recent_n,kill_recent_below,kill_max_dd_r,created_at) VALUES(?,?,?,?,?,?,?)", v.StrategyID, v.No, v.Rules, v.KillRecentN, v.KillRecentBelow, v.KillMaxDDR, timestamp(v.CreatedAt))
	if err != nil {
		return v, dbError(err)
	}
	v.ID, err = result.LastInsertId()
	return v, dbError(err)
}

func inputOf(d rules.Version) VersionInput {
	return VersionInput{Rules: d.Rules, KillRecentN: d.KillRecentN, KillRecentBelow: d.KillRecentBelow, KillMaxDDR: d.KillMaxDDR}
}
func equalPtr[T comparable](a, b *T) bool { return (a == nil) == (b == nil) && (a == nil || *a == *b) }
func sameVersion(a, b VersionInput) bool {
	return a.Rules == b.Rules && equalPtr(a.KillRecentN, b.KillRecentN) && equalPtr(a.KillRecentBelow, b.KillRecentBelow) && equalPtr(a.KillMaxDDR, b.KillMaxDDR)
}

// checkVersionsAgainst 要求数据库中的版本是代码定义的前缀：版本号连续，内容与同号定义一致。
func checkVersionsAgainst(def rules.Definition, vs []Version) error {
	if len(vs) > len(def.Versions) {
		return invalidError("数据库中的策略版本比程序新，请更新程序")
	}
	for i, v := range vs {
		if v.No != i+1 {
			return invalidError("数据库中的策略版本号不连续")
		}
		if !sameVersion(v.VersionInput, inputOf(def.Versions[i])) {
			return invalidError(fmt.Sprintf("版本 %d 的规则与数据库不一致：已写入的版本不能修改，请在代码中追加新版本", v.No))
		}
	}
	return nil
}

// syncStrategy 建立唯一策略，名称跟随代码，并按顺序补上代码中新增的版本。
func syncStrategy(tx *sql.Tx, def rules.Definition) error {
	a, err := getStrategy(tx)
	if errors.Is(err, ErrNotFound) {
		a = Strategy{Name: def.Name, CreatedAt: now()}
		result, err := tx.Exec("INSERT INTO strategies(name,created_at) VALUES(?,?)", a.Name, timestamp(a.CreatedAt))
		if err != nil {
			return err
		}
		if a.ID, err = result.LastInsertId(); err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else if _, err := tx.Exec("UPDATE strategies SET name=? WHERE id=?", def.Name, a.ID); err != nil {
		return err
	}
	vs, err := listVersions(tx)
	if err != nil {
		return err
	}
	if err := checkVersionsAgainst(def, vs); err != nil {
		return err
	}
	for _, d := range def.Versions[len(vs):] {
		if _, err := insertVersion(tx, Version{StrategyID: a.ID, No: d.No, VersionInput: inputOf(d), CreatedAt: now()}); err != nil {
			return err
		}
	}
	return nil
}
