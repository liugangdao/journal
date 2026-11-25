package store

import (
	"database/sql"
	"sort"

	"github.com/liugangdao/journal/internal/rules"
)

type Dump struct {
	SchemaVersion int           `json:"schema_version"`
	Settings      Settings      `json:"settings"`
	Strategies    []Strategy    `json:"strategies"`
	Versions      []Version     `json:"versions"`
	Trades        []Trade       `json:"trades"`
	Calibrations  []Calibration `json:"equity_calibrations"`
}

// Export 在同一事务内读取，避免导出期间写入造成跨表不一致。
func (s *Store) Export() (Dump, error) {
	d := Dump{SchemaVersion: schemaVersion}
	err := s.transaction(func(tx *sql.Tx) error {
		var err error
		d.Settings, err = getSettings(tx)
		if err != nil {
			return err
		}
		d.Strategies, err = listStrategies(tx)
		if err != nil {
			return err
		}
		d.Versions, err = listVersions(tx)
		if err != nil {
			return err
		}
		d.Trades, err = listTrades(tx, TradeFilter{})
		if err != nil {
			return err
		}
		d.Calibrations, err = listCalibrations(tx)
		return err
	})
	return d, err
}

// validateDump 只接受当前版本的备份，且备份中的策略版本必须与代码定义一致。
func validateDump(d *Dump, def rules.Definition) error {
	if d.SchemaVersion != schemaVersion {
		return invalidError("只接受版本 4 的备份")
	}
	if err := validateSettings(d.Settings); err != nil {
		return err
	}
	if len(d.Strategies) != 1 {
		return invalidError("备份必须恰好包含一个策略")
	}
	a := &d.Strategies[0]
	if a.ID <= 0 || a.CreatedAt.IsZero() {
		return invalidError("备份策略编号或创建时间不合法")
	}
	a.CreatedAt = a.CreatedAt.UTC()
	versions := map[int64]int{}
	for i := range d.Versions {
		v := &d.Versions[i]
		if v.ID <= 0 || versions[v.ID] != 0 || v.StrategyID != a.ID || v.CreatedAt.IsZero() {
			return invalidError("备份版本编号、策略引用或创建时间不合法")
		}
		v.CreatedAt = v.CreatedAt.UTC()
		versions[v.ID] = v.No
	}
	sort.Slice(d.Versions, func(i, j int) bool { return d.Versions[i].No < d.Versions[j].No })
	if err := checkVersionsAgainst(def, d.Versions); err != nil {
		return invalidError("备份中的策略版本与程序不一致")
	}
	trades := map[int64]bool{}
	for i := range d.Trades {
		t := &d.Trades[i]
		no, ok := versions[t.VersionID]
		if t.ID <= 0 || trades[t.ID] || !ok {
			return invalidError("备份交易编号或版本引用不合法")
		}
		if err := validateTrade(t, def.Versions[no-1]); err != nil {
			return err
		}
		trades[t.ID] = true
	}
	return validateCalibrations(d.Calibrations)
}

func (s *Store) Import(d Dump) error {
	// 复制切片，校验与规范化不修改调用方持有的数据。
	d.Strategies = append([]Strategy(nil), d.Strategies...)
	d.Versions = append([]Version(nil), d.Versions...)
	d.Trades = append([]Trade(nil), d.Trades...)
	d.Calibrations = append([]Calibration(nil), d.Calibrations...)
	if err := validateDump(&d, s.def); err != nil {
		return err
	}
	return s.transaction(func(tx *sql.Tx) error {
		for _, table := range []string{"equity_calibrations", "trades", "strategy_versions", "strategies"} {
			if _, err := tx.Exec("DELETE FROM " + table); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("UPDATE settings SET risk_pct=?,min_sample=? WHERE id=1", d.Settings.RiskPct, d.Settings.MinSample); err != nil {
			return err
		}
		for _, a := range d.Strategies {
			if _, err := tx.Exec("INSERT INTO strategies(id,name,created_at) VALUES(?,?,?)", a.ID, a.Name, timestamp(a.CreatedAt)); err != nil {
				return err
			}
		}
		for _, v := range d.Versions {
			if _, err := tx.Exec("INSERT INTO strategy_versions("+versionColumns+") VALUES(?,?,?,?,?,?,?,?)", v.ID, v.StrategyID, v.No, v.Rules, v.KillRecentN, v.KillRecentBelow, v.KillMaxDDR, timestamp(v.CreatedAt)); err != nil {
				return err
			}
		}
		for _, t := range d.Trades {
			if _, err := tx.Exec("INSERT INTO trades("+tradeColumns+") VALUES("+tradeValues+")", tradeArgs(t)...); err != nil {
				return err
			}
		}
		for _, c := range d.Calibrations {
			if _, err := tx.Exec("INSERT INTO equity_calibrations(id,balance,delta,reason,created_at) VALUES(?,?,?,?,?)", c.ID, c.Balance, c.Delta, c.Reason, timestamp(c.CreatedAt)); err != nil {
				return err
			}
		}
		// 备份可能早于代码中新增的版本，导入后补上。
		return syncStrategy(tx, s.def)
	})
}
