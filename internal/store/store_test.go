package store

import (
	"encoding/json"
	"errors"
	"math"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/liugangdao/journal/internal/rules"
	"github.com/liugangdao/journal/internal/stats"
)

func ptr[T any](v T) *T { return &v }
func item(key string, kind rules.Kind, setup string) rules.Item {
	return rules.Item{Key: key, Section: "背景", Label: key, Kind: kind, Setup: setup}
}

var testItems = []rules.Item{item("a", rules.Rule, ""), item("b", rules.Rule, rules.Breakout), item("c", rules.Rule, rules.Pullback), item("z", rules.Attention, "")}
var testDevs = []rules.Deviation{{Key: "moved_stop", Label: "改止损"}, {Key: "early_exit", Label: "提前离场"}}
var testDef = rules.Definition{Name: "测试策略", Versions: []rules.Version{{No: 1, Rules: "规则一", Items: testItems, Deviations: testDevs}}}
var testDef2 = rules.Definition{Name: "测试策略", Versions: append(append([]rules.Version(nil), testDef.Versions...), rules.Version{No: 2, Rules: "规则二", Items: testItems, Deviations: testDevs})}

func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "journal.db"), testDef)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}
func strategy(t *testing.T, s *Store) (Strategy, Version) {
	t.Helper()
	a, err := s.Strategy()
	if err != nil {
		t.Fatal(err)
	}
	v, err := s.CurrentVersion()
	if err != nil {
		t.Fatal(err)
	}
	return a, v
}

// input 返回一笔全部规则项都满足的突破多单；参数保留旧调用形式，不再使用。
func input(int64) OpenInput {
	return OpenInput{Symbol: " btc ", Side: stats.Long, Entry: 100, Stop: 95, Equity: 10000, RiskPct: 1, EntryReason: " 趋势突破 ", Phase: "mid",
		Setup: rules.Breakout, KeyLevel: 94, ExitPlan: "trail", Checklist: rules.Checklist{VegasDir: "long", Checks: map[string]bool{"a": true, "b": true}}}
}
func openTrade(t *testing.T, s *Store, id int64) Trade {
	t.Helper()
	tr, err := s.OpenTrade(input(id))
	if err != nil {
		t.Fatal(err)
	}
	return tr
}
func invalid(t *testing.T, err error) {
	t.Helper()
	var e *InvalidError
	if !errors.As(err, &e) || e.Msg == "" {
		t.Fatalf("期望校验错误，实际 %v", err)
	}
}
func dump(t *testing.T, s *Store) Dump {
	t.Helper()
	d, err := s.Export()
	if err != nil {
		t.Fatal(err)
	}
	return d
}
func clone(d Dump) Dump {
	b, _ := json.Marshal(d)
	var out Dump
	_ = json.Unmarshal(b, &out)
	return out
}

func TestOpenTradeDefaults(t *testing.T) {
	s := newStore(t)
	a, v := strategy(t, s)
	in := input(a.ID)
	in.Entry = 68420
	in.Stop = 67550
	tr, err := s.OpenTrade(in)
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(tr.Qty-0.114943) > 1e-6 || tr.VersionID != v.ID || tr.Symbol != "BTC" || tr.EntryReason != "趋势突破" {
		t.Fatalf("开仓默认值：%+v", tr)
	}
	e, ok, err := s.LastEquity()
	if err != nil || !ok || e != 10000 {
		t.Fatalf("最近权益 %v %v %v", e, ok, err)
	}
}

func TestOpenTradeValidation(t *testing.T) {
	for _, tc := range []struct {
		name     string
		change   func(*OpenInput)
		archived bool
	}{
		{"多止损相等", func(in *OpenInput) { in.Stop = in.Entry }, false}, {"多止损过高", func(in *OpenInput) { in.Stop = 101 }, false},
		{"空止损过低", func(in *OpenInput) { in.Side = stats.Short }, false}, {"空止损相等", func(in *OpenInput) { in.Side = stats.Short; in.Stop = in.Entry }, false},
		{"零入场", func(in *OpenInput) { in.Entry = 0 }, false}, {"负入场", func(in *OpenInput) { in.Entry = -1 }, false}, {"零止损", func(in *OpenInput) { in.Stop = 0 }, false},
		{"空品种", func(in *OpenInput) { in.Symbol = " " }, false}, {"未知方向", func(in *OpenInput) { in.Side = "other" }, false},
		{"零权益", func(in *OpenInput) { in.Equity = 0 }, false}, {"零风险", func(in *OpenInput) { in.RiskPct = 0 }, false}, {"负数量", func(in *OpenInput) { in.Qty = -1 }, false},
		{"非有限价格", func(in *OpenInput) { in.Entry = math.NaN() }, false}, {"无限数量", func(in *OpenInput) { in.Qty = math.Inf(1) }, false},
		{"无关键价位", func(in *OpenInput) { in.KeyLevel = 0 }, false}, {"未知出场计划", func(in *OpenInput) { in.ExitPlan = "x" }, false},
		{"移动止损配目标价", func(in *OpenInput) { in.Target = ptr(120.0) }, false}, {"未选 Setup", func(in *OpenInput) { in.Setup = "" }, false},
		{"不适用的清单项", func(in *OpenInput) { in.Checklist.Checks["c"] = true }, false}, {"无 Vegas 方向", func(in *OpenInput) { in.Checklist.VegasDir = "" }, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := newStore(t)
			a, _ := strategy(t, s)
			in := input(a.ID)
			tc.change(&in)
			_, err := s.OpenTrade(in)
			invalid(t, err)
			trs, _ := s.ListTrades(TradeFilter{})
			if len(trs) != 0 {
				t.Fatal("非法交易写入")
			}
		})
	}
}

func TestCloseTwiceConflict(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	tr := openTrade(t, s, a.ID)
	first, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.CloseTrade(tr.ID, CloseInput{Exit: 90, ExitReason: "stop"})
	if !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "已经平仓") {
		t.Fatal(err)
	}
	trs, _ := s.ListTrades(TradeFilter{})
	if !reflect.DeepEqual(trs[0], first) {
		t.Fatal("重复平仓覆盖原值")
	}
}

func TestConcurrentClose(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	tr := openTrade(t, s, a.ID)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, exit := range []float64{110, 90} {
		wg.Add(1)
		go func(exit float64) {
			defer wg.Done()
			_, err := s.CloseTrade(tr.ID, CloseInput{Exit: exit, ExitReason: "manual"})
			errs <- err
		}(exit)
	}
	wg.Wait()
	close(errs)
	success, conflict := 0, 0
	for err := range errs {
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("成功 %d，冲突 %d", success, conflict)
	}
}

func TestUpdateTradeRevalidates(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	tr := openTrade(t, s, a.ID)
	_, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target"})
	if err != nil {
		t.Fatal(err)
	}
	before := dump(t, s)
	for _, p := range []TradePatch{{Stop: ptr(100.0)}, {Stop: ptr(105.0)}, {Qty: ptr(0.0)}, {Symbol: ptr(" ")}, {Exit: ptr(-1.0)}, {High: ptr(80.0), Low: ptr(90.0)}} {
		_, err = s.UpdateTrade(tr.ID, p)
		invalid(t, err)
		if !reflect.DeepEqual(before, dump(t, s)) {
			t.Fatal("无效修改改变数据库")
		}
	}
}

func TestTradeVersionImmutable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	s, err := Open(path, testDef)
	if err != nil {
		t.Fatal(err)
	}
	_, v1 := strategy(t, s)
	tr := openTrade(t, s, 0)
	s.Close()
	if s, err = Open(path, testDef2); err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	tr, err = s.UpdateTrade(tr.ID, TradePatch{Symbol: ptr("eth")})
	if err != nil || tr.VersionID != v1.ID || tr.Symbol != "ETH" {
		t.Fatalf("版本或更新不正确：%+v %v", tr, err)
	}
}

func TestUpdateTradeClearOptional(t *testing.T) {
	for _, field := range []string{"high", "low", "funding", "review_note", "全部"} {
		t.Run(field, func(t *testing.T) {
			s := newStore(t)
			a, _ := strategy(t, s)
			tr := openTrade(t, s, a.ID)
			before, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target", High: ptr(112.0), Low: ptr(97.0), Funding: ptr(2.0), ReviewNote: "复盘"})
			if err != nil {
				t.Fatal(err)
			}
			fields := []string{field}
			if field == "全部" {
				fields = []string{"high", "low", "funding", "review_note"}
			}
			want := before
			for _, f := range fields {
				switch f {
				case "high":
					want.High = nil
				case "low":
					want.Low = nil
				case "funding":
					want.Funding = nil
				case "review_note":
					want.ReviewNote = ""
				}
			}
			got, err := s.UpdateTrade(tr.ID, TradePatch{Clear: fields})
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("清空结果不正确：%+v %v", got, err)
			}
			if !reflect.DeepEqual(dump(t, s).Trades[0], want) {
				t.Fatal("清空结果未持久化或改变了其他字段")
			}
		})
	}
	t.Run("非法字段与重新校验保持原数据", func(t *testing.T) {
		s := newStore(t)
		a, _ := strategy(t, s)
		tr := openTrade(t, s, a.ID)
		if _, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target", High: ptr(112.0)}); err != nil {
			t.Fatal(err)
		}
		before := dump(t, s)
		for _, field := range []string{"exit", "entry", "version_id", "unknown", ""} {
			_, err := s.UpdateTrade(tr.ID, TradePatch{Clear: []string{"high", field}})
			invalid(t, err)
			if !reflect.DeepEqual(before, dump(t, s)) {
				t.Fatal("非法清空改变数据库")
			}
		}
		_, err := s.UpdateTrade(tr.ID, TradePatch{Clear: []string{"high"}, Stop: ptr(100.0)})
		invalid(t, err)
		if !reflect.DeepEqual(before, dump(t, s)) {
			t.Fatal("清空后未重新校验")
		}
		got, err := s.UpdateTrade(tr.ID, TradePatch{Clear: []string{"high", "high"}, High: ptr(120.0)})
		if err != nil || got.High != nil {
			t.Fatalf("清空应优先于赋值且允许重复：%+v %v", got, err)
		}
	})
}

func TestCloseValidation(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	tr := openTrade(t, s, a.ID)
	for _, in := range []CloseInput{{Exit: 0, ExitReason: "stop"}, {Exit: 110, ExitReason: "other"}, {Exit: 110, ExitReason: "manual", High: ptr(100.0), Low: ptr(101.0)}, {Exit: 110, ExitReason: "manual", High: ptr(0.0)}, {Exit: 110, ExitReason: "manual", Funding: ptr(math.Inf(-1))}} {
		_, err := s.CloseTrade(tr.ID, in)
		invalid(t, err)
	}
	closed, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "manual", High: ptr(112.0), Low: ptr(97.0), Funding: ptr(-2.0)})
	if err != nil || *closed.Funding != -2 {
		t.Fatalf("负资金费：%+v %v", closed, err)
	}
}

func TestSettingsValidation(t *testing.T) {
	s := newStore(t)
	st, err := s.GetSettings()
	if err != nil || st != (Settings{RiskPct: 1, MinSample: 30}) {
		t.Fatalf("默认设置 %v %v", st, err)
	}
	for _, v := range []Settings{{0, 30}, {101, 30}, {1, 1}, {math.NaN(), 30}} {
		invalid(t, s.PutSettings(v))
	}
	if err = s.PutSettings(Settings{2, 10}); err != nil {
		t.Fatal(err)
	}
}

func TestExportImportRoundTrip(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	tr := openTrade(t, s, a.ID)
	_, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target", High: ptr(112.0), Low: ptr(97.0), Funding: ptr(2.0), Deviations: []string{"early_exit"}})
	if err != nil {
		t.Fatal(err)
	}
	in := input(0)
	in.ExitPlan = "measured_move"
	in.Target = ptr(130.0)
	if _, err = s.OpenTrade(in); err != nil {
		t.Fatal(err)
	}
	d := dump(t, s)
	other := newStore(t)
	if err = other.Import(d); err != nil {
		t.Fatal(err)
	}
	got := dump(t, other)
	if !reflect.DeepEqual(d, got) {
		t.Fatalf("导出导入不一致：\n%+v\n%+v", d, got)
	}
	b1, _ := json.Marshal(d)
	b2, _ := json.Marshal(got)
	if string(b1) != string(b2) {
		t.Fatal("JSON 不一致")
	}
}

func TestImportRollbackOnBadReference(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	openTrade(t, s, a.ID)
	before := dump(t, s)
	for _, change := range []func(*Dump){func(d *Dump) { d.Trades[0].VersionID = 999 }, func(d *Dump) { d.Versions[0].StrategyID = 999 }} {
		bad := clone(before)
		change(&bad)
		invalid(t, s.Import(bad))
		if !reflect.DeepEqual(before, dump(t, s)) {
			t.Fatal("非法引用改变原数据")
		}
	}
}

func TestImportValidationAtomic(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	openTrade(t, s, a.ID)
	before := dump(t, s)
	for _, change := range []func(*Dump){
		func(d *Dump) { d.SchemaVersion = 3 }, func(d *Dump) { d.Settings.MinSample = 1 }, func(d *Dump) { d.Strategies = append(d.Strategies, d.Strategies[0]) },
		func(d *Dump) { d.Versions = append(d.Versions, d.Versions[0]) }, func(d *Dump) { d.Trades = append(d.Trades, d.Trades[0]) }, func(d *Dump) { d.Trades[0].Stop = 100 },
		func(d *Dump) { d.Trades[0].Qty = 0 }, func(d *Dump) { d.Trades[0].Status = "closed" }, func(d *Dump) { d.Trades[0].Status = "unknown" }, func(d *Dump) { d.Trades[0].OpenedAt = time.Time{} },
		func(d *Dump) { d.Trades[0].Exit = ptr(110.0) }, func(d *Dump) { d.Strategies[0].ID = 0 }, func(d *Dump) { d.Versions = nil },
	} {
		bad := clone(before)
		change(&bad)
		invalid(t, s.Import(bad))
		if !reflect.DeepEqual(before, dump(t, s)) {
			t.Fatal("非法导入改变原数据")
		}
	}
}

func TestPersistenceWALAndForeignKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "db.sqlite")
	s, err := Open(path, testDef)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := strategy(t, s)
	openTrade(t, s, a.ID)
	before := dump(t, s)
	var mode string
	var fk int
	if err = s.db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if err = s.db.QueryRow("PRAGMA foreign_keys").Scan(&fk); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" || fk != 1 {
		t.Fatalf("数据库配置 %s %d", mode, fk)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path, testDef)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if !reflect.DeepEqual(before, dump(t, s)) {
		t.Fatal("重新打开数据改变")
	}
}

func TestListsDeleteAndNotFound(t *testing.T) {
	s := newStore(t)
	if _, ok, err := s.LastEquity(); ok || err != nil {
		t.Fatalf("空权益 %v %v", ok, err)
	}
	a, v := strategy(t, s)
	first := openTrade(t, s, a.ID)
	second := openTrade(t, s, a.ID)
	trs, err := s.ListTrades(TradeFilter{VersionID: &v.ID, Status: "open"})
	if err != nil || len(trs) != 2 || trs[0].ID != second.ID {
		t.Fatalf("交易排序 %v %v", trs, err)
	}
	if err = s.DeleteTrade(first.ID); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteTrade(first.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	for _, err := range []error{func() error { _, e := s.GetVersion(999); return e }(), func() error { _, e := s.VersionDef(999); return e }(), func() error { _, e := s.UpdateTrade(999, TradePatch{}); return e }(), func() error { _, e := s.CloseTrade(999, CloseInput{}); return e }()} {
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("不存在映射 %v", err)
		}
	}
}

func TestImportRollsBackDatabaseFailure(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	openTrade(t, s, a.ID)
	before := dump(t, s)
	// 让插入交易时才失败，验证删除旧数据和更新设置也会回滚。
	_, err := s.db.Exec(`CREATE TRIGGER reject_import BEFORE INSERT ON trades BEGIN SELECT RAISE(ABORT, '模拟写入失败'); END`)
	if err != nil {
		t.Fatal(err)
	}
	replacement := clone(before)
	replacement.Settings.RiskPct = 2
	replacement.Strategies[0].Name = "替换名称"
	if err := s.Import(replacement); err == nil {
		t.Fatal("数据库写入失败未向调用方返回错误")
	}
	if !reflect.DeepEqual(before, dump(t, s)) {
		t.Fatal("事务中途失败后没有恢复原数据")
	}
}

func TestImportUTCAndTimeOrdering(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	openTrade(t, s, a.ID)
	openTrade(t, s, a.ID)
	d := dump(t, s)
	zone := time.FixedZone("本地时区", 8*60*60)
	base := time.Date(2026, 11, 6, 12, 0, 0, 0, zone)
	d.Strategies[0].CreatedAt = base
	d.Versions[0].CreatedAt = base
	d.Trades[0].OpenedAt = base
	d.Trades[1].OpenedAt = base.Add(time.Nanosecond)
	laterID := d.Trades[1].ID
	if err := s.Import(d); err != nil {
		t.Fatal(err)
	}
	out := dump(t, s)
	if out.Strategies[0].CreatedAt.Location() != time.UTC || out.Versions[0].CreatedAt.Location() != time.UTC || out.Trades[0].OpenedAt.Location() != time.UTC {
		t.Fatal("导入时间没有转换为 UTC")
	}
	if out.Trades[0].ID != laterID || !out.Trades[0].OpenedAt.Equal(base.Add(time.Nanosecond)) {
		t.Fatal("不同小数秒精度的时间排序错误")
	}
	if d.Trades[0].OpenedAt.Location() != zone {
		t.Fatal("导入修改了调用方的数据")
	}
}

func TestConcurrentCloseAcrossConnections(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	first, err := Open(path, testDef)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := Open(path, testDef)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	a, _ := strategy(t, first)
	tr := openTrade(t, first, a.ID)
	start := make(chan struct{})
	errs := make(chan error, 2)
	for _, s := range []*Store{first, second} {
		go func(s *Store) {
			<-start
			_, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "manual"})
			errs <- err
		}(s)
	}
	close(start)
	success, conflict := 0, 0
	for range 2 {
		err := <-errs
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("跨连接平仓成功 %d，冲突 %d", success, conflict)
	}
}

func TestTradePhase(t *testing.T) {
	s := newStore(t)
	a, _ := strategy(t, s)
	for _, p := range []string{"", "Mid", "begin"} {
		in := input(a.ID)
		in.Phase = p
		_, err := s.OpenTrade(in)
		invalid(t, err)
	}
	for _, p := range Phases {
		in := input(a.ID)
		in.Phase = p
		tr, err := s.OpenTrade(in)
		if err != nil || tr.Phase != p {
			t.Fatalf("阶段 %s：%v %v", p, tr.Phase, err)
		}
	}
	tr := openTrade(t, s, a.ID)
	// 补丁和平仓都不改变开仓时记录的阶段。
	if _, err := s.UpdateTrade(tr.ID, TradePatch{Symbol: ptr("ETH")}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target"}); err != nil {
		t.Fatal(err)
	}
	got, err := getTrade(s.db, tr.ID)
	if err != nil || got.Phase != "mid" || got.Symbol != "ETH" {
		t.Fatalf("%+v %v", got, err)
	}
}
