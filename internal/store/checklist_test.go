package store

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/liugangdao/journal/internal/rules"
	"github.com/liugangdao/journal/internal/stats"
)

func openAt(t *testing.T, path string, def rules.Definition) *Store {
	t.Helper()
	s, err := Open(path, def)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestOpenFreshSeedsStrategy(t *testing.T) {
	s := newStore(t)
	a, err := s.Strategy()
	if err != nil || a.Name != testDef.Name {
		t.Fatalf("策略 %+v %v", a, err)
	}
	vs, err := s.ListVersions()
	if err != nil || len(vs) != 1 || vs[0].Rules != "规则一" {
		t.Fatalf("版本 %+v %v", vs, err)
	}
	var version int
	if err := s.db.QueryRow("SELECT version FROM schema_version").Scan(&version); err != nil || version != 4 {
		t.Fatalf("schema 版本 %d %v", version, err)
	}
}

func TestSyncIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	openAt(t, path, testDef).Close()
	s := openAt(t, path, testDef)
	defer s.Close()
	vs, _ := s.ListVersions()
	strategies, _ := listStrategies(s.db)
	if len(vs) != 1 || len(strategies) != 1 {
		t.Fatalf("重复写入：%d 个版本，%d 个策略", len(vs), len(strategies))
	}
}

func TestSyncAppendsNewVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	s := openAt(t, path, testDef)
	_, v1 := strategy(t, s)
	s.Close()
	s = openAt(t, path, testDef2)
	defer s.Close()
	cur, err := s.CurrentVersion()
	if err != nil || cur.No != 2 || cur.Rules != "规则二" {
		t.Fatalf("当前版本 %+v %v", cur, err)
	}
	vs, _ := s.ListVersions()
	if vs[0].ID != v1.ID {
		t.Fatal("旧版本被改写")
	}
}

func TestSyncRejectsChangedVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	openAt(t, path, testDef).Close()
	changed := rules.Definition{Name: testDef.Name, Versions: []rules.Version{testDef.Versions[0]}}
	changed.Versions[0].Rules = "改过的规则"
	_, err := Open(path, changed)
	if err == nil || !strings.Contains(err.Error(), "不能修改") {
		t.Fatalf("应拒绝：%v", err)
	}
}

func TestSyncRejectsNewerDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	openAt(t, path, testDef2).Close()
	_, err := Open(path, testDef)
	if err == nil || !strings.Contains(err.Error(), "比程序新") {
		t.Fatalf("应拒绝：%v", err)
	}
}

func TestOpenRejectsOldDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{"CREATE TABLE schema_version (version INTEGER NOT NULL)", "INSERT INTO schema_version VALUES(3)", "CREATE TABLE trades (id INTEGER PRIMARY KEY)", "INSERT INTO trades VALUES(1)"} {
		if _, err := raw.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	raw.Close()
	before, _ := os.ReadFile(path)
	_, err = Open(path, testDef)
	if err == nil || !strings.Contains(err.Error(), "不再兼容") {
		t.Fatalf("应拒绝旧库：%v", err)
	}
	after, _ := os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("旧库文件被改写")
	}
	if _, err := os.Stat(path + "-wal"); !os.IsNotExist(err) {
		t.Fatal("旧库旁出现了 WAL 文件")
	}
}

func TestOpenTradeChecklist(t *testing.T) {
	s := newStore(t)
	in := input(0)
	in.Checklist = rules.Checklist{VegasDir: "long", Checks: map[string]bool{"b": true}}
	in.EntryReason = ""
	tr, err := s.OpenTrade(in)
	if err != nil {
		t.Fatal("违规开仓也应能保存：", err)
	}
	want := map[string]bool{"a": false, "b": true, "z": false}
	if !reflect.DeepEqual(tr.Checklist.Checks, want) || tr.FollowedRules != nil || tr.Deviations == nil || len(tr.Deviations) != 0 {
		t.Fatalf("开仓结果 %+v", tr)
	}
	got, _ := getTrade(s.db, tr.ID)
	if !reflect.DeepEqual(got, tr) {
		t.Fatalf("读回不一致：\n%+v\n%+v", got, tr)
	}
	def, _ := s.VersionDef(tr.VersionID)
	if v := Violations(tr, def); !reflect.DeepEqual(v, []string{"a"}) {
		t.Fatal(v)
	}
}

func closeWith(t *testing.T, s *Store, in OpenInput, devs []string) Trade {
	t.Helper()
	tr, err := s.OpenTrade(in)
	if err != nil {
		t.Fatal(err)
	}
	tr, err = s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target", Deviations: devs})
	if err != nil {
		t.Fatal(err)
	}
	return tr
}

func TestCloseComputesFollowed(t *testing.T) {
	s := newStore(t)
	if tr := closeWith(t, s, input(0), nil); !*tr.FollowedRules || len(tr.Deviations) != 0 {
		t.Fatal("全勾无偏差应为按规则")
	}
	if tr := closeWith(t, s, input(0), []string{"early_exit"}); *tr.FollowedRules {
		t.Fatal("有偏差应为违规")
	}
	bad := input(0)
	bad.Checklist.Checks["a"] = false
	if tr := closeWith(t, s, bad, nil); *tr.FollowedRules {
		t.Fatal("开仓违规应为违规")
	}
	tr := openTrade(t, s, 0)
	_, err := s.CloseTrade(tr.ID, CloseInput{Exit: 110, ExitReason: "target", Deviations: []string{"bogus"}})
	invalid(t, err)
}

func TestPatchSideRecomputesFollowed(t *testing.T) {
	s := newStore(t)
	tr := closeWith(t, s, input(0), nil)
	tr, err := s.UpdateTrade(tr.ID, TradePatch{Side: ptr(stats.Short), Stop: ptr(105.0), Exit: ptr(90.0)})
	if err != nil {
		t.Fatal(err)
	}
	if *tr.FollowedRules {
		t.Fatal("方向与 Vegas 相反后应为违规")
	}
}

func TestPatchDeviations(t *testing.T) {
	s := newStore(t)
	tr := closeWith(t, s, input(0), nil)
	tr, err := s.UpdateTrade(tr.ID, TradePatch{Deviations: &[]string{"moved_stop"}})
	if err != nil || *tr.FollowedRules {
		t.Fatalf("%+v %v", tr, err)
	}
	tr, err = s.UpdateTrade(tr.ID, TradePatch{Deviations: &[]string{}})
	if err != nil || !*tr.FollowedRules {
		t.Fatalf("%+v %v", tr, err)
	}
	open := openTrade(t, s, 0)
	_, err = s.UpdateTrade(open.ID, TradePatch{Deviations: &[]string{"moved_stop"}})
	invalid(t, err)
}

func TestChecklistImmutable(t *testing.T) {
	s := newStore(t)
	tr := openTrade(t, s, 0)
	got, err := s.UpdateTrade(tr.ID, TradePatch{Symbol: ptr("eth"), Entry: ptr(101.0)})
	if err != nil {
		t.Fatal(err)
	}
	if got.Setup != tr.Setup || got.KeyLevel != tr.KeyLevel || got.Phase != tr.Phase || !reflect.DeepEqual(got.Checklist, tr.Checklist) || got.ExitPlan != tr.ExitPlan {
		t.Fatalf("清单字段被改：%+v", got)
	}
}

func TestImportRejectsOldOrMismatched(t *testing.T) {
	s := newStore(t)
	openTrade(t, s, 0)
	before := dump(t, s)
	for _, change := range []func(*Dump){
		func(d *Dump) { d.SchemaVersion = 3 },
		func(d *Dump) { b := d.Strategies[0]; b.ID = 99; d.Strategies = append(d.Strategies, b) },
		func(d *Dump) { d.Versions[0].Rules = "别的规则" },
		func(d *Dump) { d.Trades[0].Checklist.Checks["c"] = true },
	} {
		bad := clone(before)
		change(&bad)
		invalid(t, s.Import(bad))
		if !reflect.DeepEqual(before, dump(t, s)) {
			t.Fatal("拒绝导入后原数据改变")
		}
	}
}

func TestImportSyncsVersions(t *testing.T) {
	s := newStore(t)
	openTrade(t, s, 0)
	d := dump(t, s)
	other := openAt(t, filepath.Join(t.TempDir(), "other.db"), testDef2)
	defer other.Close()
	if err := other.Import(d); err != nil {
		t.Fatal(err)
	}
	cur, err := other.CurrentVersion()
	if err != nil || cur.No != 2 {
		t.Fatalf("导入后应补上版本 2：%+v %v", cur, err)
	}
}
