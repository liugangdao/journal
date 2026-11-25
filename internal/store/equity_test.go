package store

import (
	"math"
	"testing"
	"time"
)

func closeAt(t *testing.T, s *Store, id int64, exit float64) Trade {
	t.Helper()
	tr, err := s.CloseTrade(id, CloseInput{Exit: exit, ExitReason: "manual"})
	if err != nil {
		t.Fatal(err)
	}
	return tr
}
func calibrate(t *testing.T, s *Store, balance float64, reason string) Calibration {
	t.Helper()
	c, err := s.Calibrate(CalibrationInput{Balance: balance, Reason: reason})
	if err != nil {
		t.Fatal(err)
	}
	return c
}
func wantEquity(t *testing.T, s *Store, want float64) {
	t.Helper()
	got, ok, err := s.CurrentEquity()
	if err != nil || !ok || math.Abs(got-want) > 1e-9 {
		t.Fatalf("权益 %v %v %v，期望 %v", got, ok, err, want)
	}
}

func TestCalibrationFlow(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	if _, ok, err := s.CurrentEquity(); ok || err != nil {
		t.Fatalf("未设置时 %v %v", ok, err)
	}

	first := calibrate(t, s, 10000, "fee")
	if first.Reason != "initial" || first.Delta != nil {
		t.Fatalf("首次校准 %+v", first)
	}

	// 持仓不计入，平仓后才计入，资金费从盈亏中扣除。
	old := openTrade(t, s, a.ID)
	wantEquity(t, s, 10000)
	if _, err := s.CloseTrade(old.ID, CloseInput{Exit: 110, ExitReason: "target", Funding: ptr(5.0)}); err != nil {
		t.Fatal(err)
	}
	afterWin := 10000 + 10*old.Qty - 5
	wantEquity(t, s, afterWin)

	second := calibrate(t, s, 9000, "cash_flow")
	if second.Reason != "cash_flow" || second.Delta == nil || math.Abs(*second.Delta-(9000-afterWin)) > 1e-9 {
		t.Fatalf("校准差额 %+v", second)
	}
	wantEquity(t, s, 9000)

	// 校准前的旧单修改或删除后，已核对的余额不变。
	if _, err := s.UpdateTrade(old.ID, TradePatch{Exit: ptr(120.0)}); err != nil {
		t.Fatal(err)
	}
	wantEquity(t, s, 9000)
	if err := s.DeleteTrade(old.ID); err != nil {
		t.Fatal(err)
	}
	wantEquity(t, s, 9000)

	// 校准后的交易，平仓、改单、删单都反映到权益。
	next := openTrade(t, s, a.ID)
	closeAt(t, s, next.ID, 90)
	wantEquity(t, s, 9000-10*next.Qty)
	if _, err := s.UpdateTrade(next.ID, TradePatch{Exit: ptr(105.0)}); err != nil {
		t.Fatal(err)
	}
	wantEquity(t, s, 9000+5*next.Qty)
	if err := s.DeleteTrade(next.ID); err != nil {
		t.Fatal(err)
	}
	wantEquity(t, s, 9000)

	list, err := s.ListCalibrations()
	if err != nil || len(list) != 2 || list[0].ID != second.ID || list[1].ID != first.ID {
		t.Fatalf("校准记录 %+v %v", list, err)
	}
}

func TestCalibrateInvalid(t *testing.T) {
	s := newStore(t)
	for _, balance := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		_, err := s.Calibrate(CalibrationInput{Balance: balance, Reason: "other"})
		invalid(t, err)
	}
	calibrate(t, s, 100, "")
	for _, reason := range []string{"", "initial", "unknown"} {
		_, err := s.Calibrate(CalibrationInput{Balance: 200, Reason: reason})
		invalid(t, err)
	}
	wantEquity(t, s, 100)
}

func TestImportCalibrations(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	openTrade(t, s, a.ID)
	calibrate(t, s, 10000, "")
	calibrate(t, s, 9500, "fee")
	d := dump(t, s)
	if d.SchemaVersion != 4 || len(d.Calibrations) != 2 {
		t.Fatalf("%+v", d)
	}

	for _, change := range []func(*Dump){
		func(d *Dump) { d.Calibrations[0].ID = 0 },
		func(d *Dump) { d.Calibrations[0].ID = d.Calibrations[1].ID },
		func(d *Dump) { d.Calibrations[0].Balance = 0 },
		func(d *Dump) { d.Calibrations[0].Reason = "unknown" },
		func(d *Dump) { d.Calibrations[0].Delta = nil },
		func(d *Dump) { d.Calibrations[1].Delta = ptr(1.0) },
		func(d *Dump) { d.Calibrations[0].CreatedAt = time.Time{} },
	} {
		bad := clone(d)
		change(&bad)
		invalid(t, s.Import(bad))
		wantEquity(t, s, 9500)
	}

	if err := s.Import(clone(d)); err != nil {
		t.Fatal(err)
	}
	wantEquity(t, s, 9500)

	// 不含校准记录的备份导入后回到未设置。
	none := clone(d)
	none.Calibrations = nil
	if err := s.Import(none); err != nil {
		t.Fatal(err)
	}
	if _, ok, err := s.CurrentEquity(); ok || err != nil {
		t.Fatalf("导入无校准备份后 %v %v", ok, err)
	}
}
