package stats

import (
	"math"
	"math/rand"
	"sort"
)

const (
	BootstrapIters = 2000
	BootstrapSeed  = 20261106
	SideMinN       = 10
	TopK           = 5
)

type KillRule struct {
	RecentN     *int     `json:"recent_n"`
	RecentBelow *float64 `json:"recent_below"`
	MaxDDR      *float64 `json:"max_dd_r"`
}

type Verdict string

type Summary struct {
	N             int       `json:"n"`
	WinRate       float64   `json:"win_rate"`
	AvgWin        float64   `json:"avg_win"`
	AvgLoss       float64   `json:"avg_loss"`
	Expectancy    float64   `json:"expectancy"`
	StdDev        float64   `json:"std_dev"`
	CIOK          bool      `json:"ci_ok"`
	CILow         float64   `json:"ci_low"`
	CIHigh        float64   `json:"ci_high"`
	TotalR        float64   `json:"total_r"`
	MaxDrawdownR  float64   `json:"max_drawdown_r"`
	MaxLossStreak int       `json:"max_loss_streak"`
	Curve         []float64 `json:"curve"`
}

type SideSplit struct {
	LongN  int     `json:"long_n"`
	ShortN int     `json:"short_n"`
	LongE  float64 `json:"long_e"`
	ShortE float64 `json:"short_e"`
	Warn   bool    `json:"warn"`
}

type TopRemoved struct {
	Computed bool    `json:"computed"`
	E        float64 `json:"e"`
	Warn     bool    `json:"warn"`
}

type RuleSplit struct {
	FollowedN int     `json:"followed_n"`
	ViolatedN int     `json:"violated_n"`
	FollowedE float64 `json:"followed_e"`
	ViolatedE float64 `json:"violated_e"`
	FollowedR float64 `json:"followed_r"`
	ViolatedR float64 `json:"violated_r"`
}

type Quality struct {
	N           int     `json:"n"`
	AvgMFE      float64 `json:"avg_mfe"`
	AvgMAE      float64 `json:"avg_mae"`
	AvgGiveback float64 `json:"avg_giveback"`
}

type KillStatus struct {
	RecentEvaluated bool    `json:"recent_evaluated"`
	RecentTriggered bool    `json:"recent_triggered"`
	RecentMean      float64 `json:"recent_mean"`
	DDEvaluated     bool    `json:"dd_evaluated"`
	DDTriggered     bool    `json:"dd_triggered"`
	Triggered       bool    `json:"triggered"`
}

type VersionStats struct {
	Summary    Summary    `json:"summary"`
	Sides      SideSplit  `json:"sides"`
	TopRemoved TopRemoved `json:"top_removed"`
	Rules      RuleSplit  `json:"rules"`
	Quality    Quality    `json:"quality"`
	Kill       KillStatus `json:"kill"`
	Verdict    Verdict    `json:"verdict"`
}

func Bootstrap(rs []float64, iters int, seed int64) (lo, hi float64) {
	if len(rs) == 0 || iters <= 0 {
		return 0, 0
	}
	rng := rand.New(rand.NewSource(seed))
	means := make([]float64, iters)
	for i := range means {
		for range rs {
			means[i] += rs[rng.Intn(len(rs))]
		}
		means[i] /= float64(len(rs))
	}
	sort.Float64s(means)
	// 极少迭代时也保持索引有效，正式统计固定使用 2000 次。
	return means[int(0.025*float64(iters))], means[max(0, int(0.975*float64(iters))-1)]
}

func Compute(trades []ClosedTrade, rule KillRule, minSample int) VersionStats {
	ordered := append([]ClosedTrade(nil), trades...)
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].ClosedAt.Equal(ordered[j].ClosedAt) {
			return ordered[i].ID < ordered[j].ID
		}
		return ordered[i].ClosedAt.Before(ordered[j].ClosedAt)
	})
	out := VersionStats{Summary: Summary{N: len(ordered), Curve: make([]float64, 1, len(ordered)+1)}}
	s := &out.Summary
	rs := make([]float64, len(ordered))
	wins, streak := 0, 0
	peak := 0.0
	for i, t := range ordered {
		r := RMultiple(t)
		rs[i] = r
		s.TotalR += r
		s.Curve = append(s.Curve, s.TotalR)
		peak = math.Max(peak, s.TotalR)
		s.MaxDrawdownR = math.Max(s.MaxDrawdownR, peak-s.TotalR)
		if r > 0 {
			wins++
			s.AvgWin += r
			streak = 0
		} else {
			s.AvgLoss += r
			streak++
			s.MaxLossStreak = max(s.MaxLossStreak, streak)
		}
		if t.Side == Long {
			out.Sides.LongN++
			out.Sides.LongE += r
		} else {
			out.Sides.ShortN++
			out.Sides.ShortE += r
		}
		if t.FollowedRules {
			out.Rules.FollowedN++
			out.Rules.FollowedR += r
		} else {
			out.Rules.ViolatedN++
			out.Rules.ViolatedR += r
		}
		if mfe, mae, ok := Excursions(t); ok {
			out.Quality.N++
			out.Quality.AvgMFE += mfe
			out.Quality.AvgMAE += mae
			out.Quality.AvgGiveback += mfe - r
		}
	}
	s.Expectancy = average(s.TotalR, s.N)
	s.WinRate = average(float64(wins), s.N)
	s.AvgWin = average(s.AvgWin, wins)
	s.AvgLoss = average(s.AvgLoss, s.N-wins)
	if s.N >= 2 {
		for _, r := range rs {
			s.StdDev += (r - s.Expectancy) * (r - s.Expectancy)
		}
		s.StdDev = math.Sqrt(s.StdDev / float64(s.N-1))
		s.CIOK = true
		s.CILow, s.CIHigh = Bootstrap(rs, BootstrapIters, BootstrapSeed)
	}
	a := &out.Sides
	a.LongE = average(a.LongE, a.LongN)
	a.ShortE = average(a.ShortE, a.ShortN)
	a.Warn = a.LongN >= SideMinN && a.ShortN >= SideMinN && ((a.LongE > 0 && a.ShortE <= 0) || (a.ShortE > 0 && a.LongE <= 0))
	if s.N > TopK {
		ranked := append([]float64(nil), rs...)
		sort.Float64s(ranked)
		for _, r := range ranked[:s.N-TopK] {
			out.TopRemoved.E += r
		}
		out.TopRemoved.E /= float64(s.N - TopK)
		out.TopRemoved.Computed = true
		out.TopRemoved.Warn = s.Expectancy > 0 && out.TopRemoved.E <= 0
	}
	out.Rules.FollowedE = average(out.Rules.FollowedR, out.Rules.FollowedN)
	out.Rules.ViolatedE = average(out.Rules.ViolatedR, out.Rules.ViolatedN)
	q := &out.Quality
	q.AvgMFE = average(q.AvgMFE, q.N)
	q.AvgMAE = average(q.AvgMAE, q.N)
	q.AvgGiveback = average(q.AvgGiveback, q.N)
	k := &out.Kill
	if rule.RecentN != nil && rule.RecentBelow != nil && *rule.RecentN > 0 && s.N >= *rule.RecentN {
		k.RecentEvaluated = true
		for _, r := range rs[s.N-*rule.RecentN:] {
			k.RecentMean += r
		}
		k.RecentMean /= float64(*rule.RecentN)
		k.RecentTriggered = k.RecentMean < *rule.RecentBelow
	}
	if rule.MaxDDR != nil {
		k.DDEvaluated = true
		k.DDTriggered = s.MaxDrawdownR > *rule.MaxDDR
	}
	k.Triggered = k.RecentTriggered || k.DDTriggered
	switch {
	case k.Triggered:
		out.Verdict = "kill"
	case s.N < minSample:
		out.Verdict = "insufficient"
	case s.CIOK && s.CILow > 0:
		out.Verdict = "edge"
	case s.Expectancy > 0:
		out.Verdict = "promising"
	default:
		out.Verdict = "none"
	}
	return out
}

func average(total float64, n int) float64 {
	if n == 0 {
		return 0
	}
	return total / float64(n)
}
