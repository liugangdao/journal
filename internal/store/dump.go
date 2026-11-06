package store

import (
	"database/sql"
	"fmt"
	"strings"
)

type Dump struct {
	SchemaVersion int        `json:"schema_version"`
	Settings      Settings   `json:"settings"`
	Strategies    []Strategy `json:"strategies"`
	Versions      []Version  `json:"versions"`
	Trades        []Trade    `json:"trades"`
}

// Export 在同一事务内读取，避免导出期间写入造成跨表不一致。
func (s *Store) Export() (Dump, error) {
	d := Dump{SchemaVersion: 1}
	err := s.transaction(func(tx *sql.Tx) error {
		var err error
		d.Settings, err = getSettings(tx)
		if err != nil {
			return err
		}
		d.Strategies, err = listStrategies(tx, true)
		if err != nil {
			return err
		}
		d.Versions, err = listVersions(tx, nil)
		if err != nil {
			return err
		}
		d.Trades, err = listTrades(tx, TradeFilter{})
		return err
	})
	return d, err
}

func validateDump(d *Dump) error {
	if d.SchemaVersion != 1 {
		return invalidError("不支持此备份版本")
	}
	if err := validateSettings(d.Settings); err != nil {
		return err
	}
	strategies := map[int64]bool{}
	names := map[string]bool{}
	versions := map[int64]bool{}
	numbers := map[string]bool{}
	counts := map[int64]int{}
	trades := map[int64]bool{}
	for i := range d.Strategies {
		a := &d.Strategies[i]
		a.Name = strings.TrimSpace(a.Name)
		if a.ID <= 0 || strategies[a.ID] || a.Name == "" || names[a.Name] || a.CreatedAt.IsZero() {
			return invalidError("备份策略编号、名称或创建时间不合法")
		}
		a.CreatedAt = a.CreatedAt.UTC()
		strategies[a.ID] = true
		names[a.Name] = true
	}
	for i := range d.Versions {
		v := &d.Versions[i]
		key := fmt.Sprintf("%d/%d", v.StrategyID, v.No)
		if v.ID <= 0 || versions[v.ID] || !strategies[v.StrategyID] || v.No <= 0 || numbers[key] || v.CreatedAt.IsZero() {
			return invalidError("备份版本编号、策略引用或创建时间不合法")
		}
		if err := validateVersion(v.VersionInput); err != nil {
			return err
		}
		v.CreatedAt = v.CreatedAt.UTC()
		versions[v.ID] = true
		numbers[key] = true
		counts[v.StrategyID]++
	}
	for id := range strategies {
		if counts[id] == 0 {
			return invalidError("每个策略必须至少有一个版本")
		}
	}
	for i := range d.Trades {
		t := &d.Trades[i]
		if t.ID <= 0 || trades[t.ID] || !versions[t.VersionID] {
			return invalidError("备份交易编号或版本引用不合法")
		}
		if err := validateTrade(t); err != nil {
			return err
		}
		trades[t.ID] = true
	}
	return nil
}

func (s *Store) Import(d Dump) error {
	// 复制切片，校验与规范化不修改调用方持有的数据。
	d.Strategies = append([]Strategy(nil), d.Strategies...)
	d.Versions = append([]Version(nil), d.Versions...)
	d.Trades = append([]Trade(nil), d.Trades...)
	if err := validateDump(&d); err != nil {
		return err
	}
	return s.transaction(func(tx *sql.Tx) error {
		for _, table := range []string{"trades", "strategy_versions", "strategies"} {
			if _, err := tx.Exec("DELETE FROM " + table); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("UPDATE settings SET risk_pct=?,min_sample=? WHERE id=1", d.Settings.RiskPct, d.Settings.MinSample); err != nil {
			return err
		}
		for _, a := range d.Strategies {
			if _, err := tx.Exec("INSERT INTO strategies(id,name,archived,created_at) VALUES(?,?,?,?)", a.ID, a.Name, a.Archived, timestamp(a.CreatedAt)); err != nil {
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
		return nil
	})
}
