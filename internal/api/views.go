package api

import (
	"math"
	"sort"
	"time"

	"github.com/liugangdao/journal/internal/rules"
	"github.com/liugangdao/journal/internal/stats"
	"github.com/liugangdao/journal/internal/store"
)

type tradeView struct {
	store.Trade
	R          *float64 `json:"r,omitempty"`
	MFE        *float64 `json:"mfe,omitempty"`
	MAE        *float64 `json:"mae,omitempty"`
	Violations []string `json:"violations"`
}
type openTradeView struct {
	tradeView
	VersionNo  int     `json:"version_no"`
	RiskAmount float64 `json:"risk_amount"`
}

// groupView 是拆分后的描述性统计，样本小，不给置信区间和结论。
type groupView struct {
	Key        string  `json:"key"`
	N          int     `json:"n"`
	WinRate    float64 `json:"win_rate"`
	Expectancy float64 `json:"expectancy"`
	TotalR     float64 `json:"total_r"`
	QualityN   int     `json:"quality_n"`
	AvgMFE     float64 `json:"avg_mfe"`
	AvgMAE     float64 `json:"avg_mae"`
}
type violationView struct {
	Key    string  `json:"key"`
	N      int     `json:"n"`
	TotalR float64 `json:"total_r"`
}
type attentionView struct {
	Key       string    `json:"key"`
	Checked   groupView `json:"checked"`
	Unchecked groupView `json:"unchecked"`
}
type executionView struct {
	ClosedN        int      `json:"closed_n"`
	FollowedN      int      `json:"followed_n"`
	ViolatedN      int      `json:"violated_n"`
	FollowedRate   *float64 `json:"followed_rate"`
	ViolatedR      float64  `json:"violated_r"`
	RecentN        int      `json:"recent_n"`
	RecentViolated int      `json:"recent_violated"`
}

// report 同时回答两个问题：Edge 只用按规则执行的单子，回答策略本身有没有优势；
// All 与 Execution 用全部单子，回答执行得怎么样。
type report struct {
	Edge       stats.VersionStats `json:"edge"`
	All        stats.Summary      `json:"all"`
	Execution  executionView      `json:"execution"`
	Setups     []groupView        `json:"setups"`
	Phases     []groupView        `json:"phases"`
	Attention  []attentionView    `json:"attention"`
	Violations []violationView    `json:"violations"`
}
type versionDetail struct {
	Version    store.Version `json:"version"`
	Definition rules.Version `json:"definition"`
	Report     report        `json:"report"`
	Trades     []tradeView   `json:"trades"`
}
type versionBrief struct {
	Version    store.Version `json:"version"`
	Definition rules.Version `json:"definition"`
	Edge       stats.Summary `json:"edge_summary"`
	Verdict    stats.Verdict `json:"verdict"`
	Execution  executionView `json:"execution"`
}
type strategyDetail struct {
	Strategy store.Strategy `json:"strategy"`
	Versions []versionBrief `json:"versions"`
}
type overviewView struct {
	Settings   store.Settings  `json:"settings"`
	Equity     *float64        `json:"equity"`
	LastEquity *float64        `json:"last_equity"`
	Strategy   store.Strategy  `json:"strategy"`
	Version    store.Version   `json:"version"`
	Definition rules.Version   `json:"definition"`
	Report     report          `json:"report"`
	OpenTrades []openTradeView `json:"open_trades"`
}

func closedTrade(t store.Trade) stats.ClosedTrade {
	c := stats.ClosedTrade{ID: t.ID, Side: t.Side, Entry: t.Entry, Stop: t.Stop, Qty: t.Qty, Exit: *t.Exit, High: t.High, Low: t.Low, FollowedRules: *t.FollowedRules, ClosedAt: *t.ClosedAt}
	if t.Funding != nil {
		c.Funding = *t.Funding
	}
	return c
}

func viewTrade(t store.Trade, def rules.Version) tradeView {
	v := tradeView{Trade: t, Violations: store.Violations(t, def)}
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
	dump     store.Dump
	def      rules.Definition
	versions map[int64]store.Version
	current  store.Version
	trades   map[int64][]store.Trade
}

func loadSnapshot(s *store.Store) (snapshot, error) {
	d, err := s.Export()
	if err != nil {
		return snapshot{}, err
	}
	v := snapshot{dump: d, def: s.Definition(), versions: map[int64]store.Version{}, trades: map[int64][]store.Trade{}}
	for _, version := range d.Versions {
		v.versions[version.ID] = version
		if version.No > v.current.No {
			v.current = version
		}
	}
	for _, tr := range d.Trades {
		v.trades[tr.VersionID] = append(v.trades[tr.VersionID], tr)
	}
	return v, nil
}

// versionDef 取版本在代码中的定义；数据库版本总是代码定义的前缀，打开数据库时已校验。
func (s snapshot) versionDef(v store.Version) rules.Version {
	d, _ := s.def.Version(v.No)
	return d
}
func (s snapshot) tradeDef(t store.Trade) rules.Version { return s.versionDef(s.versions[t.VersionID]) }
func (s snapshot) viewTrade(t store.Trade) tradeView    { return viewTrade(t, s.tradeDef(t)) }

func group(key string, trades []store.Trade) groupView {
	closed := make([]stats.ClosedTrade, len(trades))
	for i, t := range trades {
		closed[i] = closedTrade(t)
	}
	st := stats.Compute(closed, stats.KillRule{}, 0)
	return groupView{Key: key, N: st.Summary.N, WinRate: st.Summary.WinRate, Expectancy: st.Summary.Expectancy, TotalR: st.Summary.TotalR,
		QualityN: st.Quality.N, AvgMFE: st.Quality.AvgMFE, AvgMAE: st.Quality.AvgMAE}
}

func byKey(trades []store.Trade, keys []string, key func(store.Trade) string) []groupView {
	by := map[string][]store.Trade{}
	for _, t := range trades {
		by[key(t)] = append(by[key(t)], t)
	}
	out := make([]groupView, len(keys))
	for i, k := range keys {
		out[i] = group(k, by[k])
	}
	return out
}

func compute(trades []store.Trade, v store.Version, minSample int) stats.VersionStats {
	closed := make([]stats.ClosedTrade, len(trades))
	for i, t := range trades {
		closed[i] = closedTrade(t)
	}
	return stats.Compute(closed, stats.KillRule{RecentN: v.KillRecentN, RecentBelow: v.KillRecentBelow, MaxDDR: v.KillMaxDDR}, minSample)
}

const recentN = 10

func (s snapshot) report(v store.Version) report {
	def := s.versionDef(v)
	all, followed := []store.Trade{}, []store.Trade{}
	for _, t := range s.trades[v.ID] {
		if t.Status != "closed" {
			continue
		}
		all = append(all, t)
		if *t.FollowedRules {
			followed = append(followed, t)
		}
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].ClosedAt.Equal(*all[j].ClosedAt) {
			return all[i].ID < all[j].ID
		}
		return all[i].ClosedAt.Before(*all[j].ClosedAt)
	})
	r := report{Edge: compute(followed, v, s.dump.Settings.MinSample), All: compute(all, v, 0).Summary,
		Setups:     byKey(followed, rules.Setups, func(t store.Trade) string { return t.Setup }),
		Phases:     byKey(followed, store.Phases, func(t store.Trade) string { return t.Phase }),
		Attention:  []attentionView{},
		Violations: []violationView{}}
	e := &r.Execution
	e.ClosedN, e.FollowedN = len(all), len(followed)
	e.ViolatedN = e.ClosedN - e.FollowedN
	if e.ClosedN > 0 {
		rate := float64(e.FollowedN) / float64(e.ClosedN)
		e.FollowedRate = &rate
	}
	counts := map[string]*violationView{}
	for i, t := range all {
		rm := stats.RMultiple(closedTrade(t))
		if !*t.FollowedRules {
			e.ViolatedR += rm
			if i >= len(all)-recentN {
				e.RecentViolated++
			}
		}
		for _, k := range store.Violations(t, def) {
			if counts[k] == nil {
				counts[k] = &violationView{Key: k}
			}
			counts[k].N++
			counts[k].TotalR += rm
		}
	}
	e.RecentN = min(len(all), recentN)
	// 按定义顺序收集，再按代价稳定排序，代价相同时保持定义顺序。
	order := []string{rules.VegasDirKey}
	for _, it := range def.Items {
		order = append(order, it.Key)
	}
	for _, dv := range def.Deviations {
		order = append(order, dv.Key)
	}
	for _, k := range order {
		if c := counts[k]; c != nil {
			r.Violations = append(r.Violations, *c)
		}
	}
	sort.SliceStable(r.Violations, func(i, j int) bool { return r.Violations[i].TotalR < r.Violations[j].TotalR })
	for _, it := range def.Items {
		if it.Kind != rules.Attention {
			continue
		}
		var on, off []store.Trade
		for _, t := range followed {
			if t.Checklist.Checks[it.Key] {
				on = append(on, t)
			} else {
				off = append(off, t)
			}
		}
		r.Attention = append(r.Attention, attentionView{Key: it.Key, Checked: group("checked", on), Unchecked: group("unchecked", off)})
	}
	return r
}

func (s snapshot) overview() overviewView {
	o := overviewView{Settings: s.dump.Settings, OpenTrades: []openTradeView{}, Strategy: s.dump.Strategies[0], Version: s.current,
		Definition: s.versionDef(s.current), Report: s.report(s.current)}
	if len(s.dump.Trades) > 0 {
		e := s.dump.Trades[0].Equity
		o.LastEquity = &e
	}
	if e, ok := store.ComputeEquity(s.dump.Calibrations, s.dump.Trades); ok {
		o.Equity = &e
	}
	for _, t := range s.dump.Trades {
		if t.Status == "open" {
			o.OpenTrades = append(o.OpenTrades, openTradeView{tradeView: s.viewTrade(t), VersionNo: s.versions[t.VersionID].No, RiskAmount: t.Qty * math.Abs(t.Entry-t.Stop)})
		}
	}
	return o
}

func (s snapshot) strategy() strategyDetail {
	out := strategyDetail{Strategy: s.dump.Strategies[0], Versions: []versionBrief{}}
	for _, v := range s.dump.Versions {
		r := s.report(v)
		out.Versions = append(out.Versions, versionBrief{Version: v, Definition: s.versionDef(v), Edge: r.Edge.Summary, Verdict: r.Edge.Verdict, Execution: r.Execution})
	}
	return out
}

type monthlyView struct {
	From          time.Time `json:"from"`
	To            time.Time `json:"to"`
	N             int       `json:"n"`
	WinRate       float64   `json:"win_rate"`
	AvgWin        float64   `json:"avg_win"`
	AvgLoss       float64   `json:"avg_loss"`
	Expectancy    float64   `json:"expectancy"`
	TotalR        float64   `json:"total_r"`
	MaxDrawdownR  float64   `json:"max_drawdown_r"`
	MaxLossStreak int       `json:"max_loss_streak"`
	FollowedRate  *float64  `json:"followed_rate"`
	ViolatedN     int       `json:"violated_n"`
	ViolatedR     float64   `json:"violated_r"`
	// Trades 列出本月的交易：已平仓的按平仓时间、持仓中的按开仓时间落在 [from, to) 内。
	Trades []openTradeView `json:"trades"`
}

// monthly 统计平仓时间落在 [from, to) 内的交易，各版本合并。
func (s snapshot) monthly(from, to time.Time) monthlyView {
	all := []stats.ClosedTrade{}
	listed := []openTradeView{}
	in := func(at time.Time) bool { return !at.Before(from) && at.Before(to) }
	for _, t := range s.dump.Trades {
		if t.Status == "open" && in(t.OpenedAt) {
			listed = append(listed, openTradeView{tradeView: s.viewTrade(t), VersionNo: s.versions[t.VersionID].No, RiskAmount: t.Qty * math.Abs(t.Entry-t.Stop)})
		}
		if t.Status != "closed" || !in(*t.ClosedAt) {
			continue
		}
		all = append(all, closedTrade(t))
		listed = append(listed, openTradeView{tradeView: s.viewTrade(t), VersionNo: s.versions[t.VersionID].No, RiskAmount: t.Qty * math.Abs(t.Entry-t.Stop)})
	}
	// 月度样本太小，不输出置信区间与结论，只取描述性数字。
	st := stats.Compute(all, stats.KillRule{}, 0)
	m := monthlyView{From: from, To: to, N: st.Summary.N, WinRate: st.Summary.WinRate, AvgWin: st.Summary.AvgWin, AvgLoss: st.Summary.AvgLoss,
		Expectancy: st.Summary.Expectancy, TotalR: st.Summary.TotalR, MaxDrawdownR: st.Summary.MaxDrawdownR, MaxLossStreak: st.Summary.MaxLossStreak,
		ViolatedN: st.Rules.ViolatedN, ViolatedR: st.Rules.ViolatedR, Trades: listed}
	if m.N > 0 {
		rate := float64(st.Rules.FollowedN) / float64(m.N)
		m.FollowedRate = &rate
	}
	return m
}
