package stats

import (
	"math"
	"time"
)

type Side string

const (
	Long  Side = "long"
	Short Side = "short"
)

// ClosedTrade 是通过存储层校验后的已平仓交易。
type ClosedTrade struct {
	ID                     int64
	Side                   Side
	Entry, Stop, Qty, Exit float64
	Funding                float64
	High, Low              *float64
	FollowedRules          bool
	ClosedAt               time.Time
}

func RiskPerUnit(t ClosedTrade) float64 { return math.Abs(t.Entry - t.Stop) }

func RMultiple(t ClosedTrade) float64 {
	d := 1.0
	if t.Side == Short {
		d = -1
	}
	return (d*(t.Exit-t.Entry)*t.Qty - t.Funding) / (t.Qty * RiskPerUnit(t))
}

func Excursions(t ClosedTrade) (mfe, mae float64, ok bool) {
	if t.High == nil || t.Low == nil {
		return 0, 0, false
	}
	risk := RiskPerUnit(t)
	if t.Side == Short {
		return (t.Entry - *t.Low) / risk, (*t.High - t.Entry) / risk, true
	}
	return (*t.High - t.Entry) / risk, (t.Entry - *t.Low) / risk, true
}

func SuggestQty(equity, riskPct, entry, stop float64) float64 {
	return equity * riskPct / 100 / math.Abs(entry-stop)
}
