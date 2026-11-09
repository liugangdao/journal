package store

import (
	"database/sql"
	"strings"
	"time"
)

type Strategy struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Archived  bool      `json:"archived"`
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

func validateVersion(v VersionInput) error {
	if (v.KillRecentN == nil) != (v.KillRecentBelow == nil) {
		return invalidError("最近笔数和均值阈值必须一起填写")
	}
	if v.KillRecentN != nil && *v.KillRecentN <= 0 {
		return invalidError("最近笔数必须大于 0")
	}
	if v.KillRecentBelow != nil && !finite(*v.KillRecentBelow) {
		return invalidError("均值阈值必须是有限数字")
	}
	if v.KillMaxDDR != nil && !positive(*v.KillMaxDDR) {
		return invalidError("最大回撤阈值必须大于 0")
	}
	return nil
}

type scanner interface{ Scan(...any) error }

func scanStrategy(row scanner) (Strategy, error) {
	var v Strategy
	var created string
	err := row.Scan(&v.ID, &v.Name, &v.Archived, &created)
	if err != nil {
		return v, dbError(err)
	}
	v.CreatedAt, err = parseTime(created)
	return v, err
}
func getStrategy(q querier, id int64) (Strategy, error) {
	return scanStrategy(q.QueryRow("SELECT id,name,archived,created_at FROM strategies WHERE id=?", id))
}
func listStrategies(q querier, includeArchived bool) ([]Strategy, error) {
	query := "SELECT id,name,archived,created_at FROM strategies"
	if !includeArchived {
		query += " WHERE archived=0"
	}
	query += " ORDER BY id"
	rows, err := q.Query(query)
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
func (s *Store) ListStrategies(includeArchived bool) ([]Strategy, error) {
	return listStrategies(s.db, includeArchived)
}

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
func currentVersion(q querier, id int64) (Version, error) {
	return scanVersion(q.QueryRow("SELECT "+versionColumns+" FROM strategy_versions WHERE strategy_id=? ORDER BY no DESC LIMIT 1", id))
}
func (s *Store) CurrentVersion(strategyID int64) (Version, error) {
	return currentVersion(s.db, strategyID)
}
func (s *Store) GetVersion(id int64) (Version, error) {
	return scanVersion(s.db.QueryRow("SELECT "+versionColumns+" FROM strategy_versions WHERE id=?", id))
}

func listVersions(q querier, strategyID *int64) ([]Version, error) {
	query := "SELECT " + versionColumns + " FROM strategy_versions"
	args := []any{}
	if strategyID != nil {
		query += " WHERE strategy_id=?"
		args = append(args, *strategyID)
	}
	query += " ORDER BY strategy_id,no,id"
	rows, err := q.Query(query, args...)
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
func (s *Store) ListVersions(strategyID int64) ([]Version, error) {
	var vs []Version
	err := s.transaction(func(tx *sql.Tx) error {
		if _, err := getStrategy(tx, strategyID); err != nil {
			return err
		}
		var err error
		vs, err = listVersions(tx, &strategyID)
		return err
	})
	return vs, err
}

func insertVersion(q querier, v Version) (Version, error) {
	result, err := q.Exec("INSERT INTO strategy_versions(strategy_id,no,rules,kill_recent_n,kill_recent_below,kill_max_dd_r,created_at) VALUES(?,?,?,?,?,?,?)", v.StrategyID, v.No, v.Rules, v.KillRecentN, v.KillRecentBelow, v.KillMaxDDR, timestamp(v.CreatedAt))
	if err != nil {
		return v, dbError(err)
	}
	v.ID, err = result.LastInsertId()
	return v, dbError(err)
}

func (s *Store) CreateStrategy(name string, v VersionInput) (Strategy, Version, error) {
	a := Strategy{Name: strings.TrimSpace(name), CreatedAt: now()}
	v.Rules = strings.TrimSpace(v.Rules)
	var version Version
	if a.Name == "" {
		return a, version, invalidError("策略名称不能为空")
	}
	if err := validateVersion(v); err != nil {
		return a, version, err
	}
	err := s.transaction(func(tx *sql.Tx) error {
		result, err := tx.Exec("INSERT INTO strategies(name,archived,created_at) VALUES(?,0,?)", a.Name, timestamp(a.CreatedAt))
		if err != nil {
			return err
		}
		a.ID, err = result.LastInsertId()
		if err != nil {
			return err
		}
		version, err = insertVersion(tx, Version{StrategyID: a.ID, No: 1, VersionInput: v, CreatedAt: a.CreatedAt})
		return err
	})
	return a, version, nameConflict(err)
}

func (s *Store) UpdateStrategy(id int64, name *string, archived *bool) (Strategy, error) {
	var a Strategy
	err := s.transaction(func(tx *sql.Tx) error {
		var err error
		a, err = getStrategy(tx, id)
		if err != nil {
			return err
		}
		if name != nil {
			a.Name = strings.TrimSpace(*name)
			if a.Name == "" {
				return invalidError("策略名称不能为空")
			}
		}
		if archived != nil {
			a.Archived = *archived
		}
		_, err = tx.Exec("UPDATE strategies SET name=?,archived=? WHERE id=?", a.Name, a.Archived, id)
		return err
	})
	return a, nameConflict(err)
}

func (s *Store) CreateVersion(strategyID int64, v VersionInput) (Version, error) {
	var out Version
	v.Rules = strings.TrimSpace(v.Rules)
	if err := validateVersion(v); err != nil {
		return out, err
	}
	err := s.transaction(func(tx *sql.Tx) error {
		if _, err := getStrategy(tx, strategyID); err != nil {
			return err
		}
		cur, err := currentVersion(tx, strategyID)
		if err != nil {
			return err
		}
		out, err = insertVersion(tx, Version{StrategyID: strategyID, No: cur.No + 1, VersionInput: v, CreatedAt: now()})
		return err
	})
	return out, err
}
