package api

import (
	"math"
	"sort"
	"time"

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
	Phases   []phaseView        `json:"phases"`
	Trades   []tradeView        `json:"trades"`
}
type phaseView struct {
	Phase      string  `json:"phase"`
	N          int     `json:"n"`
	WinRate    float64 `json:"win_rate"`
	Expectancy float64 `json:"expectancy"`
	TotalR     float64 `json:"total_r"`
	QualityN   int     `json:"quality_n"`
	AvgMFE     float64 `json:"avg_mfe"`
	AvgMAE     float64 `json:"avg_mae"`
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

// phases 按开仓时的趋势阶段拆分已平仓交易。拆分后样本更小，只给描述性数字；
// 四个阶段总是列出，旧交易未记录阶段时追加 phase 为空的一行。
func (s snapshot) phases(v store.Version) []phaseView {
	by := map[string][]stats.ClosedTrade{}
	for _, tr := range s.trades[v.ID] {
		if tr.Status != "closed" {
			continue
		}
		key := ""
		if tr.Phase != nil {
			key = *tr.Phase
		}
		by[key] = append(by[key], closedTrade(tr))
	}
	keys := append([]string(nil), store.Phases...)
	if len(by[""]) > 0 {
		keys = append(keys, "")
	}
	out := make([]phaseView, 0, len(keys))
	for _, key := range keys {
		st := stats.Compute(by[key], stats.KillRule{}, 0)
		out = append(out, phaseView{Phase: key, N: st.Summary.N, WinRate: st.Summary.WinRate, Expectancy: st.Summary.Expectancy, TotalR: st.Summary.TotalR,
			QualityN: st.Quality.N, AvgMFE: st.Quality.AvgMFE, AvgMAE: st.Quality.AvgMAE})
	}
	return out
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

type monthStrategyView struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Archived   bool    `json:"archived"`
	N          int     `json:"n"`
	WinRate    float64 `json:"win_rate"`
	TotalR     float64 `json:"total_r"`
	Expectancy float64 `json:"expectancy"`
}
type monthlyView struct {
	From          time.Time           `json:"from"`
	To            time.Time           `json:"to"`
	N             int                 `json:"n"`
	WinRate       float64             `json:"win_rate"`
	AvgWin        float64             `json:"avg_win"`
	AvgLoss       float64             `json:"avg_loss"`
	Expectancy    float64             `json:"expectancy"`
	TotalR        float64             `json:"total_r"`
	MaxDrawdownR  float64             `json:"max_drawdown_r"`
	MaxLossStreak int                 `json:"max_loss_streak"`
	FollowedRate  *float64            `json:"followed_rate"`
	ViolatedN     int                 `json:"violated_n"`
	ViolatedR     float64             `json:"violated_r"`
	Strategies    []monthStrategyView `json:"strategies"`
}

// monthly 统计平仓时间落在 [from, to) 内的交易；同一策略的各版本合并，归档策略也计入。
func (s snapshot) monthly(from, to time.Time) monthlyView {
	all := []stats.ClosedTrade{}
	by := map[int64][]stats.ClosedTrade{}
	for _, t := range s.dump.Trades {
		if t.Status != "closed" || t.ClosedAt.Before(from) || !t.ClosedAt.Before(to) {
			continue
		}
		c := closedTrade(t)
		all = append(all, c)
		id := s.versions[t.VersionID].StrategyID
		by[id] = append(by[id], c)
	}
	// 月度样本太小，不输出置信区间与结论，只取描述性数字。
	st := stats.Compute(all, stats.KillRule{}, 0)
	m := monthlyView{From: from, To: to, N: st.Summary.N, WinRate: st.Summary.WinRate, AvgWin: st.Summary.AvgWin, AvgLoss: st.Summary.AvgLoss,
		Expectancy: st.Summary.Expectancy, TotalR: st.Summary.TotalR, MaxDrawdownR: st.Summary.MaxDrawdownR, MaxLossStreak: st.Summary.MaxLossStreak,
		ViolatedN: st.Rules.ViolatedN, ViolatedR: st.Rules.ViolatedR, Strategies: []monthStrategyView{}}
	if m.N > 0 {
		rate := float64(st.Rules.FollowedN) / float64(m.N)
		m.FollowedRate = &rate
	}
	for id, trades := range by {
		a, sum := s.strategies[id], stats.Compute(trades, stats.KillRule{}, 0).Summary
		m.Strategies = append(m.Strategies, monthStrategyView{ID: id, Name: a.Name, Archived: a.Archived, N: sum.N, WinRate: sum.WinRate, TotalR: sum.TotalR, Expectancy: sum.Expectancy})
	}
	sort.Slice(m.Strategies, func(i, j int) bool {
		a, b := m.Strategies[i], m.Strategies[j]
		if a.TotalR != b.TotalR {
			return a.TotalR > b.TotalR
		}
		return a.ID < b.ID
	})
	return m
}
