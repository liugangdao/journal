// Package rules 定义唯一策略的各个版本：规则全文、开仓清单、平仓偏差，以及违规判定。
// 它不依赖数据库和 HTTP，存储层和接口层都按这里的定义校验与统计。
package rules

import (
	"errors"
	"fmt"
	"strings"
)

type Kind string

const (
	Rule      Kind = "rule"      // 未满足即违规开仓
	Attention Kind = "attention" // 只记录、只提示，不算违规
)

const (
	Breakout = "breakout"
	Pullback = "pullback"
)

var Setups = []string{Breakout, Pullback}
var ExitPlans = []string{"trail", "measured_move", "scale_out"}

// VegasDirKey 是 1H Vegas 方向与开仓方向不一致时出现在违规列表里的键。
const VegasDirKey = "vegas_dir"

type Item struct {
	Key     string `json:"key"`
	Section string `json:"section"`
	Label   string `json:"label"`
	Kind    Kind   `json:"kind"`
	Setup   string `json:"setup,omitempty"` // 空表示两类 Setup 都适用
}

type Deviation struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type Version struct {
	No              int         `json:"no"`
	Rules           string      `json:"rules"`
	Items           []Item      `json:"items"`
	Deviations      []Deviation `json:"deviations"`
	KillRecentN     *int        `json:"kill_recent_n"`
	KillRecentBelow *float64    `json:"kill_recent_below"`
	KillMaxDDR      *float64    `json:"kill_max_dd_r"`
}

type Definition struct {
	Name     string
	Versions []Version
}

type Checklist struct {
	VegasDir string          `json:"vegas_dir"`
	Checks   map[string]bool `json:"checks"`
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func (d Definition) Validate() error {
	if strings.TrimSpace(d.Name) == "" {
		return errors.New("策略名称不能为空")
	}
	if len(d.Versions) == 0 {
		return errors.New("策略至少要有一个版本")
	}
	for i, v := range d.Versions {
		if v.No != i+1 {
			return fmt.Errorf("策略版本号必须从 1 连续递增，第 %d 个是 %d", i+1, v.No)
		}
		keys := map[string]bool{VegasDirKey: true}
		for _, it := range v.Items {
			if it.Key == "" || keys[it.Key] {
				return fmt.Errorf("版本 %d 的清单键为空或重复：%q", v.No, it.Key)
			}
			if it.Kind != Rule && it.Kind != Attention {
				return fmt.Errorf("版本 %d 的清单项 %s 类型不对", v.No, it.Key)
			}
			if it.Setup != "" && !contains(Setups, it.Setup) {
				return fmt.Errorf("版本 %d 的清单项 %s 的 Setup 不对", v.No, it.Key)
			}
			keys[it.Key] = true
		}
		for _, dv := range v.Deviations {
			if dv.Key == "" || keys[dv.Key] {
				return fmt.Errorf("版本 %d 的偏差键为空或重复：%q", v.No, dv.Key)
			}
			keys[dv.Key] = true
		}
	}
	return nil
}

func (d Definition) Version(no int) (Version, bool) {
	if no < 1 || no > len(d.Versions) {
		return Version{}, false
	}
	return d.Versions[no-1], true
}

func applies(it Item, setup string) bool { return it.Setup == "" || it.Setup == setup }

// Normalize 校验清单并返回恰好包含所有适用条目的副本，缺的条目视为未勾。
func (v Version) Normalize(setup string, c Checklist) (Checklist, error) {
	if !contains(Setups, setup) {
		return c, errors.New("请选择 Setup：突破前高或回调高二·低二")
	}
	if c.VegasDir != "long" && c.VegasDir != "short" {
		return c, errors.New("请选择 1H Vegas 方向")
	}
	out := Checklist{VegasDir: c.VegasDir, Checks: map[string]bool{}}
	for _, it := range v.Items {
		if applies(it, setup) {
			out.Checks[it.Key] = false
		}
	}
	for k, val := range c.Checks {
		if _, ok := out.Checks[k]; !ok {
			return c, errors.New("清单项不适用：" + k)
		}
		out.Checks[k] = val
	}
	return out, nil
}

// Violations 返回违规项的键：方向不一致、未勾的规则项、发生的偏差，按定义顺序。
func (v Version) Violations(side, setup string, c Checklist, deviations []string) []string {
	out := []string{}
	if c.VegasDir != side {
		out = append(out, VegasDirKey)
	}
	for _, it := range v.Items {
		if it.Kind == Rule && applies(it, setup) && !c.Checks[it.Key] {
			out = append(out, it.Key)
		}
	}
	for _, dv := range v.Deviations {
		if contains(deviations, dv.Key) {
			out = append(out, dv.Key)
		}
	}
	return out
}

func (v Version) ValidDeviations(ds []string) error {
	seen := map[string]bool{}
	for _, d := range ds {
		known := false
		for _, dv := range v.Deviations {
			known = known || dv.Key == d
		}
		if !known || seen[d] {
			return errors.New("执行偏差不合法：" + d)
		}
		seen[d] = true
	}
	return nil
}
