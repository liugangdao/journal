package api

import (
	"math"

	"github.com/liugangdao/journal/internal/stats"
	"github.com/liugangdao/journal/internal/store"
)

type tradeView struct {
	store.Trade
	R   *float64 `json:"r,omitempty"`
	MFE *float64 `json:"mfe,omitempty"`
	MAE *float64 `json:"mae,omitempty"`
}
type openTradeView struct {
	store.Trade
	StrategyName string  `json:"strategy_name"`
	VersionNo    int     `json:"version_no"`
	RiskAmount   float64 `json:"risk_amount"`
}
type strategyView struct {
	store.Strategy
	CurrentVersion store.Version      `json:"current_version"`
	Stats          stats.VersionStats `json:"stats"`
}
type versionView struct {
	store.Version
	Stats stats.VersionStats `json:"stats"`
}
type strategyDetail struct {
	store.Strategy
	Versions []versionView `json:"versions"`
}
type versionDetail struct {
	Version  store.Version      `json:"version"`
	Strategy store.Strategy     `json:"strategy"`
	Stats    stats.VersionStats `json:"stats"`
	Trades   []tradeView        `json:"trades"`
}
type totalsView struct {
	ClosedN      int      `json:"closed_n"`
	OpenN        int      `json:"open_n"`
	TotalR       float64  `json:"total_r"`
	FollowedRate *float64 `json:"followed_rate"`
	ViolatedN    int      `json:"violated_n"`
	ViolatedR    float64  `json:"violated_r"`
	StrategiesN  int      `json:"strategies_n"`
	VersionsN    int      `json:"versions_n"`
}
type overviewView struct {
	Settings   store.Settings  `json:"settings"`
	LastEquity *float64        `json:"last_equity"`
	Totals     totalsView      `json:"totals"`
	OpenTrades []openTradeView `json:"open_trades"`
	Strategies []strategyView  `json:"strategies"`
	ArchivedN  int             `json:"archived_n"`
}

func closedTrade(t store.Trade) stats.ClosedTrade {
	c := stats.ClosedTrade{ID: t.ID, Side: t.Side, Entry: t.Entry, Stop: t.Stop, Qty: t.Qty, Exit: *t.Exit, High: t.High, Low: t.Low, FollowedRules: *t.FollowedRules, ClosedAt: *t.ClosedAt}
	if t.Funding != nil {
		c.Funding = *t.Funding
	}
	return c
}

func viewTrade(t store.Trade) tradeView {
	v := tradeView{Trade: t}
	if t.Status == "closed" {
		c := closedTrade(t)
		r := stats.RMultiple(c)
		v.R = &r
		if mfe, mae, ok := stats.Excursions(c); ok {
			v.MFE = &mfe
			v.MAE = &mae
		}
	}
	return v
}

// 每次请求使用同一数据库快照，统计只在内存中计算。
type snapshot struct {
	dump       store.Dump
	strategies map[int64]store.Strategy
	versions   map[int64]store.Version
	current    map[int64]store.Version
	trades     map[int64][]store.Trade
}

func loadSnapshot(s *store.Store) (snapshot, error) {
	d, err := s.Export()
	if err != nil {
		return snapshot{}, err
	}
	v := snapshot{dump: d, strategies: map[int64]store.Strategy{}, versions: map[int64]store.Version{}, current: map[int64]store.Version{}, trades: map[int64][]store.Trade{}}
	for _, a := range d.Strategies {
		v.strategies[a.ID] = a
	}
	for _, version := range d.Versions {
		v.versions[version.ID] = version
		if version.No > v.current[version.StrategyID].No {
			v.current[version.StrategyID] = version
		}
	}
	for _, tr := range d.Trades {
		v.trades[tr.VersionID] = append(v.trades[tr.VersionID], tr)
	}
	return v, nil
}
func (s snapshot) compute(v store.Version) stats.VersionStats {
	closed := []stats.ClosedTrade{}
	for _, tr := range s.trades[v.ID] {
		if tr.Status == "closed" {
			closed = append(closed, closedTrade(tr))
		}
	}
	return stats.Compute(closed, stats.KillRule{RecentN: v.KillRecentN, RecentBelow: v.KillRecentBelow, MaxDDR: v.KillMaxDDR}, s.dump.Settings.MinSample)
}
func (s snapshot) strategyView(a store.Strategy) strategyView {
	v := s.current[a.ID]
	return strategyView{Strategy: a, CurrentVersion: v, Stats: s.compute(v)}
}

func (s snapshot) overview() overviewView {
	o := overviewView{Settings: s.dump.Settings, OpenTrades: []openTradeView{}, Strategies: []strategyView{}, Totals: totalsView{StrategiesN: len(s.dump.Strategies), VersionsN: len(s.dump.Versions)}}
	if len(s.dump.Trades) > 0 {
		e := s.dump.Trades[0].Equity
		o.LastEquity = &e
	}
	for _, t := range s.dump.Trades {
		if t.Status == "open" {
			o.Totals.OpenN++
			v := s.versions[t.VersionID]
			o.OpenTrades = append(o.OpenTrades, openTradeView{Trade: t, StrategyName: s.strategies[v.StrategyID].Name, VersionNo: v.No, RiskAmount: t.Qty * math.Abs(t.Entry-t.Stop)})
			continue
		}
		o.Totals.ClosedN++
		r := stats.RMultiple(closedTrade(t))
		o.Totals.TotalR += r
		if !*t.FollowedRules {
			o.Totals.ViolatedN++
			o.Totals.ViolatedR += r
		}
	}
	if o.Totals.ClosedN > 0 {
		rate := float64(o.Totals.ClosedN-o.Totals.ViolatedN) / float64(o.Totals.ClosedN)
		o.Totals.FollowedRate = &rate
	}
	for _, a := range s.dump.Strategies {
		if a.Archived {
			o.ArchivedN++
		} else {
			o.Strategies = append(o.Strategies, s.strategyView(a))
		}
	}
	return o
}
