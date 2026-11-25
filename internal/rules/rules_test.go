package rules

import (
	"reflect"
	"strings"
	"testing"
)

func v1() Version { return Current.Versions[0] }

func allChecked(setup string) Checklist {
	c := Checklist{VegasDir: "long", Checks: map[string]bool{}}
	for _, it := range v1().Items {
		if it.Setup == "" || it.Setup == setup {
			c.Checks[it.Key] = true
		}
	}
	return c
}

func TestCurrentValid(t *testing.T) {
	if err := Current.Validate(); err != nil {
		t.Fatal(err)
	}
	if Current.Name != "Vegas 顺势" || v1().No != 1 {
		t.Fatalf("名称或版本号不对：%q %d", Current.Name, v1().No)
	}
	if !strings.HasPrefix(v1().Rules, "看到一个K线图，应该要做什么呢") || !strings.HasSuffix(v1().Rules, "回调的幅度指示") {
		t.Fatal("规则原文首尾不对")
	}
}

func TestNormalizeFillsMissing(t *testing.T) {
	c, err := v1().Normalize(Breakout, Checklist{VegasDir: "long", Checks: map[string]bool{"no_chop": true}})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"no_chop", "after_climax", "lines_drawn", "bo_trend_clear", "bo_bars_ok", "stop_order", "stop_placed", "accept_loss"}
	if len(c.Checks) != len(want) {
		t.Fatalf("键数 %d，期望 %d：%v", len(c.Checks), len(want), c.Checks)
	}
	for _, k := range want {
		if _, ok := c.Checks[k]; !ok {
			t.Fatalf("缺少 %s", k)
		}
	}
	if !c.Checks["no_chop"] || c.Checks["lines_drawn"] {
		t.Fatal("值不对")
	}
	if c, err = v1().Normalize(Pullback, Checklist{VegasDir: "short"}); err != nil || len(c.Checks) != 9 {
		t.Fatalf("nil map 应补齐：%v %v", c, err)
	}
}

func TestNormalizeRejectsOtherSetup(t *testing.T) {
	_, err := v1().Normalize(Breakout, Checklist{VegasDir: "long", Checks: map[string]bool{"pb_second_entry": true}})
	if err == nil || !strings.Contains(err.Error(), "pb_second_entry") {
		t.Fatalf("应拒绝：%v", err)
	}
}

func TestNormalizeRejects(t *testing.T) {
	cases := []struct {
		setup string
		c     Checklist
	}{
		{"x", Checklist{VegasDir: "long"}},
		{Breakout, Checklist{VegasDir: ""}},
		{Breakout, Checklist{VegasDir: "long", Checks: map[string]bool{"foo": true}}},
	}
	for i, tc := range cases {
		if _, err := v1().Normalize(tc.setup, tc.c); err == nil {
			t.Fatalf("case %d 应报错", i)
		}
	}
}

func TestViolations(t *testing.T) {
	climax := allChecked(Breakout)
	climax.Checks["after_climax"] = false
	short := allChecked(Breakout)
	short.VegasDir = "short"
	pb := allChecked(Pullback)
	pb.Checks["pb_signal_bar"] = false
	cases := []struct {
		name  string
		setup string
		c     Checklist
		devs  []string
		want  []string
	}{
		{"全勾", Breakout, allChecked(Breakout), nil, []string{}},
		{"方向相反", Breakout, short, nil, []string{"vegas_dir"}},
		{"注意项不算", Breakout, climax, nil, []string{}},
		{"回调信号K", Pullback, pb, nil, []string{"pb_signal_bar"}},
		{"偏差按定义顺序", Breakout, allChecked(Breakout), []string{"early_exit", "moved_stop"}, []string{"moved_stop", "early_exit"}},
	}
	for _, tc := range cases {
		got := v1().Violations("long", tc.setup, tc.c, tc.devs)
		if got == nil || !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("%s：%v，期望 %v", tc.name, got, tc.want)
		}
	}
	none := Checklist{VegasDir: "short", Checks: map[string]bool{}}
	got := v1().Violations("long", Breakout, none, nil)
	if got[0] != VegasDirKey || len(got) != 8 {
		t.Fatalf("全不勾：%v", got)
	}
}

func TestValidDeviations(t *testing.T) {
	if err := v1().ValidDeviations([]string{"moved_stop"}); err != nil {
		t.Fatal(err)
	}
	if v1().ValidDeviations([]string{"x"}) == nil || v1().ValidDeviations([]string{"moved_stop", "moved_stop"}) == nil {
		t.Fatal("应报错")
	}
}

func TestValidateDefinition(t *testing.T) {
	item := Item{Key: "a", Section: "背景", Label: "A", Kind: Rule}
	ok := Definition{Name: "x", Versions: []Version{{No: 1, Rules: "r", Items: []Item{item}}}}
	if err := ok.Validate(); err != nil {
		t.Fatal(err)
	}
	gap := Definition{Name: "x", Versions: []Version{{No: 1}, {No: 3}}}
	dup := Definition{Name: "x", Versions: []Version{{No: 1, Items: []Item{item, item}}}}
	noName := Definition{Versions: []Version{{No: 1}}}
	badSetup := Definition{Name: "x", Versions: []Version{{No: 1, Items: []Item{{Key: "b", Kind: Rule, Setup: "zz"}}}}}
	empty := Definition{Name: "x"}
	for i, d := range []Definition{gap, dup, noName, badSetup, empty} {
		if d.Validate() == nil {
			t.Fatalf("case %d 应报错", i)
		}
	}
}
