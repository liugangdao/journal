package stats

import (
	"math"
	"testing"
)

func ptr[T any](v T) *T { return &v }

func near(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.Abs(got-want) > 1e-9 {
		t.Fatalf("实际 %v，期望 %v", got, want)
	}
}

func TestRMultiple(t *testing.T) {
	for _, tc := range []struct {
		name  string
		trade ClosedTrade
		want  float64
	}{
		{"做多", ClosedTrade{Side: Long, Entry: 100, Stop: 95, Qty: 2, Exit: 110}, 2},
		{"做空", ClosedTrade{Side: Short, Entry: 100, Stop: 105, Qty: 2, Exit: 90}, 2},
		{"止损", ClosedTrade{Side: Long, Entry: 100, Stop: 95, Qty: 2, Exit: 95}, -1},
		{"支付资金费", ClosedTrade{Side: Long, Entry: 100, Stop: 95, Qty: 2, Exit: 110, Funding: 2}, 1.8},
		{"收到资金费", ClosedTrade{Side: Short, Entry: 100, Stop: 105, Qty: 2, Exit: 90, Funding: -2}, 2.2},
	} {
		t.Run(tc.name, func(t *testing.T) { near(t, RMultiple(tc.trade), tc.want); near(t, RiskPerUnit(tc.trade), 5) })
	}
}

func TestExcursions(t *testing.T) {
	for _, tc := range []struct {
		name  string
		trade ClosedTrade
		ok    bool
	}{
		{"做多", ClosedTrade{Side: Long, Entry: 100, Stop: 95, High: ptr(112.0), Low: ptr(97.0)}, true},
		{"做空", ClosedTrade{Side: Short, Entry: 100, Stop: 105, High: ptr(103.0), Low: ptr(88.0)}, true},
		{"缺最高价", ClosedTrade{Low: ptr(97.0)}, false},
		{"缺最低价", ClosedTrade{High: ptr(112.0)}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mfe, mae, ok := Excursions(tc.trade)
			if ok != tc.ok {
				t.Fatalf("完整性标志 %v", ok)
			}
			if ok {
				near(t, mfe, 2.4)
				near(t, mae, 0.6)
			}
		})
	}
}

func TestSuggestQty(t *testing.T) {
	if got := SuggestQty(10000, 1, 68420, 67550); math.Abs(got-0.114943) > 1e-6 {
		t.Fatalf("建议数量 %v", got)
	}
}
