package stats

import (
	"encoding/json"
	"math"
	"math/rand"
	"reflect"
	"sort"
	"testing"
	"time"
)

func trades(rs ...float64) []ClosedTrade {
	out := make([]ClosedTrade, len(rs))
	for i, r := range rs {
		out[i] = ClosedTrade{ID: int64(i + 1), Side: Long, Entry: 100, Stop: 99, Qty: 1, Exit: 100 + r, ClosedAt: time.Unix(int64(i), 0).UTC()}
	}
	return out
}

func repeat(n int, r float64) []ClosedTrade {
	rs := make([]float64, n)
	for i := range rs {
		rs[i] = r
	}
	return trades(rs...)
}

func TestSummaryBasic(t *testing.T) {
	s := Compute(trades(2, -1, -1, 3, -1), KillRule{}, 30).Summary
	if s.N != 5 || s.MaxLossStreak != 2 || !reflect.DeepEqual(s.Curve, []float64{0, 2, 1, 0, 3, 2}) {
		t.Fatalf("汇总不正确：%+v", s)
	}
	near(t, s.WinRate, 0.4)
	near(t, s.AvgWin, 2.5)
	near(t, s.AvgLoss, -1)
	near(t, s.Expectancy, 0.4)
	near(t, s.TotalR, 2)
	near(t, s.MaxDrawdownR, 2)
	near(t, s.StdDev, math.Sqrt(3.8))
}

func TestOrderingAndInputUnchanged(t *testing.T) {
	in := trades(3, -1, 2)
	in[0].ClosedAt = in[1].ClosedAt
	in[0], in[2] = in[2], in[0]
	before := append([]ClosedTrade(nil), in...)
	s := Compute(in, KillRule{}, 2).Summary
	if !reflect.DeepEqual(s.Curve, []float64{0, 3, 2, 4}) || !reflect.DeepEqual(in, before) {
		t.Fatalf("排序或输入发生变化：%+v", s)
	}
}

func TestEmptySingleAndZero(t *testing.T) {
	s := Compute(nil, KillRule{}, 30)
	if s.Summary.CIOK || s.Summary.StdDev != 0 || !reflect.DeepEqual(s.Summary.Curve, []float64{0}) || s.Verdict != "insufficient" {
		t.Fatalf("空样本：%+v", s)
	}
	s = Compute(trades(0), KillRule{}, 30)
	if s.Summary.CIOK || s.Summary.MaxLossStreak != 1 || s.Summary.WinRate != 0 {
		t.Fatalf("零收益：%+v", s)
	}
}

func TestBootstrapDeterministic(t *testing.T) {
	rs := []float64{2, -1, 3, -2, 5}
	lo, hi := Bootstrap(rs, BootstrapIters, BootstrapSeed)
	l2, h2 := Bootstrap(rs, BootstrapIters, BootstrapSeed)
	if lo != l2 || hi != h2 {
		t.Fatal("重抽样结果不稳定")
	}
	rng := rand.New(rand.NewSource(20261106))
	means := make([]float64, 2000)
	for i := range means {
		for range rs {
			means[i] += rs[rng.Intn(len(rs))]
		}
		means[i] /= float64(len(rs))
	}
	sort.Float64s(means)
	near(t, lo, means[50])
	near(t, hi, means[1949])
	ones := make([]float64, 50)
	for i := range ones {
		ones[i] = 1
	}
	lo, hi = Bootstrap(ones, 2000, 20261106)
	near(t, lo, 1)
	near(t, hi, 1)
	lo, hi = Bootstrap(nil, 2000, 20261106)
	near(t, lo, 0)
	near(t, hi, 0)
}

func TestVerdict(t *testing.T) {
	mixed := repeat(30, 3)
	for i := 1; i < 30; i += 2 {
		mixed[i].Exit = 98
	}
	for _, tc := range []struct {
		name string
		in   []ClosedTrade
		rule KillRule
		want Verdict
	}{
		{"不足", repeat(29, 1), KillRule{}, "insufficient"},
		{"优势", repeat(30, 1), KillRule{}, "edge"},
		{"苗头", mixed, KillRule{}, "promising"},
		{"无优势", repeat(30, -1), KillRule{}, "none"},
		{"停用优先于不足", repeat(1, -1), KillRule{MaxDDR: ptr(0.5)}, "kill"},
		{"停用优先于优势", repeat(30, 1), KillRule{RecentN: ptr(1), RecentBelow: ptr(2.0)}, "kill"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := Compute(tc.in, tc.rule, 30)
			if s.Verdict != tc.want {
				t.Fatalf("结论 %s，期望 %s", s.Verdict, tc.want)
			}
			if tc.want == "promising" && !(s.Summary.CILow < 0 && s.Summary.CIHigh > 0) {
				t.Fatal("置信区间未跨零")
			}
		})
	}
}

func TestSideWarn(t *testing.T) {
	for _, tc := range []struct {
		longN, shortN int
		longR, shortR float64
		warn          bool
	}{{10, 10, 1, -1, true}, {9, 10, 1, -1, false}, {10, 10, -1, 1, true}, {10, 10, 1, 0, true}, {10, 10, 1, 1, false}, {10, 10, -1, -1, false}} {
		in := repeat(tc.longN, tc.longR)
		shorts := repeat(tc.shortN, tc.shortR)
		for i := range shorts {
			shorts[i].Side = Short
			shorts[i].Stop = 101
			shorts[i].Exit = 100 - tc.shortR
		}
		in = append(in, shorts...)
		s := Compute(in, KillRule{}, 30).Sides
		if s.Warn != tc.warn || s.LongN != tc.longN || s.ShortN != tc.shortN {
			t.Fatalf("多空分组：%+v", s)
		}
		near(t, s.LongE, tc.longR)
		near(t, s.ShortE, tc.shortR)
	}
}

func TestTopRemoved(t *testing.T) {
	for _, tc := range []struct {
		rs             []float64
		computed, warn bool
		e              float64
	}{{[]float64{5, 5, 5, 5, 5, -1, -1, -1}, true, true, -1}, {[]float64{1, 1, 1, 1, 1}, false, false, 0}, {[]float64{2, 2, 2, 2, 2, 1}, true, false, 1}, {[]float64{-1, -1, -1, -1, -1, -2}, true, false, -2}} {
		s := Compute(trades(tc.rs...), KillRule{}, 30).TopRemoved
		if s.Computed != tc.computed || s.Warn != tc.warn {
			t.Fatalf("剔除结果：%+v", s)
		}
		near(t, s.E, tc.e)
	}
}

func TestKillRecentNotEnough(t *testing.T) {
	s := Compute(repeat(29, -1), KillRule{RecentN: ptr(30), RecentBelow: ptr(0.0)}, 30)
	if s.Kill.RecentEvaluated || s.Kill.Triggered {
		t.Fatal("不足 N 笔不得判定")
	}
}

func TestKillDrawdown(t *testing.T) {
	s := Compute(trades(-1, -1, -1), KillRule{MaxDDR: ptr(2.0)}, 30)
	if !s.Kill.DDEvaluated || !s.Kill.DDTriggered || !s.Kill.Triggered {
		t.Fatal("未触发回撤条件")
	}
}

func TestKillBoundaries(t *testing.T) {
	rule := KillRule{RecentN: ptr(2), RecentBelow: ptr(-1.0), MaxDDR: ptr(2.0)}
	s := Compute(trades(5, -1, -1), rule, 30)
	if !s.Kill.RecentEvaluated || s.Kill.Triggered {
		t.Fatalf("相等不得触发：%+v", s.Kill)
	}
	near(t, s.Kill.RecentMean, -1)
	rule.RecentBelow = ptr(0.0)
	s = Compute(trades(5, -1, -1), rule, 30)
	if !s.Kill.RecentTriggered {
		t.Fatal("最近笔数条件未触发")
	}
	s = Compute(trades(-1), KillRule{RecentN: ptr(1)}, 30)
	if s.Kill.RecentEvaluated {
		t.Fatal("缺阈值不得判定")
	}
}

func TestQualityOnlyFilled(t *testing.T) {
	in := trades(2, -1, 4)
	in[0].High = ptr(104.0)
	in[0].Low = ptr(99.0)
	in[1].High = ptr(102.0)
	in[1].Low = ptr(98.0)
	in[2].High = ptr(105.0)
	in[0].FollowedRules = true
	in[2].FollowedRules = true
	s := Compute(in, KillRule{}, 30)
	if s.Quality.N != 2 || s.Rules.FollowedN != 2 || s.Rules.ViolatedN != 1 {
		t.Fatalf("分组：%+v", s)
	}
	near(t, s.Quality.AvgMFE, 3)
	near(t, s.Quality.AvgMAE, 1.5)
	near(t, s.Quality.AvgGiveback, 2.5)
	near(t, s.Rules.FollowedR, 6)
	near(t, s.Rules.FollowedE, 3)
	near(t, s.Rules.ViolatedR, -1)
	near(t, s.Rules.ViolatedE, -1)
}

func TestStatsJSONContract(t *testing.T) {
	if BootstrapIters != 2000 || BootstrapSeed != 20261106 || SideMinN != 10 || TopK != 5 {
		t.Fatal("统计常量不符")
	}
	types := []any{KillRule{}, Summary{}, SideSplit{}, TopRemoved{}, RuleSplit{}, Quality{}, KillStatus{}, VersionStats{}}
	for _, v := range types {
		typ := reflect.TypeOf(v)
		for i := 0; i < typ.NumField(); i++ {
			tag := typ.Field(i).Tag.Get("json")
			if tag == "" {
				t.Fatalf("%s 缺 json 字段", typ.Field(i).Name)
			}
		}
	}
	b, err := json.Marshal(Compute(nil, KillRule{}, 30))
	if err != nil {
		t.Fatal(err)
	}
	var obj map[string]any
	if err = json.Unmarshal(b, &obj); err != nil {
		t.Fatal(err)
	}
	if _, ok := obj["top_removed"]; !ok {
		t.Fatal("缺 top_removed")
	}
}
