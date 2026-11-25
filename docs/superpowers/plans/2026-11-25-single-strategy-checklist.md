# 单一策略与执行检查清单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把多策略日志改成只有一个写在代码里的策略：开仓按清单勾选、平仓记偏差、按规则执行由后端算出，首页同时回答“策略有没有优势”和“我执行得怎么样”。

**Architecture:** 新增无依赖的 `internal/rules` 包，定义策略各版本的规则全文、开仓清单、平仓偏差和违规判定。`store` 直接按新结构建库（不兼容旧库，遇到旧库拒绝启动），并在 `Open` 时把代码里的版本同步进数据库。`api` 用 `rules` 判定违规，把同一版本的交易分成“按规则单”和“全部单”两套统计。前端清单从接口返回的定义渲染，不在 JS 里重复写条目。

**Tech Stack:** Go 1.22+ 标准库 `net/http`、`modernc.org/sqlite`、原生 HTML/CSS/JS（`go:embed`）。

**Spec:** `docs/superpowers/specs/2026-11-25-single-strategy-checklist-design.md`

## Global Constraints

- 除 SQLite 驱动外只用标准库；前端无构建步骤，不加外部资源。
- 所有面向用户的文字、错误信息用中文；代码标识符英文。
- 不兼容旧数据：新库直接建成 schema 版本 4，不写任何迁移；打开版本低于 4 的数据库时拒绝启动且不改动文件，错误为 `旧版数据库不再兼容，请删除或换一个 JOURNAL_DB 路径`。备份 `schema_version` 为 4，导入只接受 4。
- 已写入数据库的版本不可修改；代码里同号版本的规则全文或停用条件与数据库不一致时拒绝启动。
- 违规开仓仍可保存，不得因清单未勾而拒绝。
- 清单字段（`setup`、`key_level`、`exit_plan`、`target`、`checklist`）和趋势阶段开仓后不可修改。
- `followed_rules` 由后端计算：已平仓且违规项为空时为 true；持仓中为 null。
- 弹窗沿用现有规则：只能点 × 或“取消”关闭。
- 运行 `go test ./...` 前确认已获用户授权（仓库约定）。

## Review Focus

1. **误用旧数据库**：`JOURNAL_DB` 仍指向旧版文件时，程序拒绝启动，旧文件字节不变（不能被建表语句或 WAL 改写）。→ Task 2 `TestOpenRejectsOldDatabase`。
2. **重复启动**：同一数据库连续 `Open` 两次，不重复插入版本。→ Task 2 `TestSyncIdempotent`。
3. **切换 Setup 后残留勾选**：开仓请求带了另一类 Setup 的条目，后端明确拒绝并说明哪个键不适用，前端切换 Setup 时只提交当前类的条目。→ Task 1 `TestNormalizeRejectsOtherSetup`、Task 5 步骤。
4. **改单改了方向**：补丁把 long 改成 short，Vegas 方向不再一致，`followed_rules` 随之变为 false。→ Task 3 `TestPatchSideRecomputesFollowed`。
5. **导入较早的备份**：备份只有 v1 而代码已有 v2，导入后自动补出 v2；备份里 v1 规则与代码不同则整体拒绝。→ Task 3 `TestImportSyncsVersions`。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `internal/rules/rules.go`（新） | 类型、`Definition.Validate`、`Version.Normalize`、`Version.Violations`、`ValidDeviations` |
| `internal/rules/v1.go`（新） | `Current` 定义：策略名、版本 1 规则原文、清单、偏差 |
| `internal/rules/rules_test.go`（新） | 判定与校验测试 |
| `internal/store/store.go` | `Open(path, def)`、新建表结构、拒绝旧库 |
| `internal/store/strategy.go` | 删除建/改/版本接口，新增 `syncStrategy`、`Strategy()` |
| `internal/store/trade.go` | 新字段、校验、违规与 `followed_rules` 计算 |
| `internal/store/dump.go` | 备份版本 4、按定义校验与同步 |
| `internal/api/*.go` | 路由、报告计算、视图 |
| `web/app.js`、`web/app.css`、`web/index.html` | 首页、清单表单、平仓偏差、版本详情 |
| `cmd/journal/main.go`、`README.md` | 传入 `rules.Current`、更新说明 |

---

### Task 1: `internal/rules` 包

**Files:**
- Create: `internal/rules/rules.go`, `internal/rules/v1.go`, `internal/rules/rules_test.go`

**Interfaces:**
- Produces:

```go
package rules

type Kind string
const (Rule Kind = "rule"; Attention Kind = "attention")

const (Breakout = "breakout"; Pullback = "pullback")
var Setups = []string{Breakout, Pullback}
var ExitPlans = []string{"trail", "measured_move", "scale_out"}
const VegasDirKey = "vegas_dir" // 方向不一致时出现在违规列表里的键

type Item struct {
	Key     string `json:"key"`
	Section string `json:"section"` // 背景 画线 突破 回调 入场 止损 心态
	Label   string `json:"label"`
	Kind    Kind   `json:"kind"`
	Setup   string `json:"setup,omitempty"` // 空 = 两类 Setup 都适用
}
type Deviation struct{ Key, Label string } // json: key, label
type Version struct {
	No              int         `json:"no"`
	Rules           string      `json:"rules"`
	Items           []Item      `json:"items"`
	Deviations      []Deviation `json:"deviations"`
	KillRecentN     *int        `json:"kill_recent_n"`
	KillRecentBelow *float64    `json:"kill_recent_below"`
	KillMaxDDR      *float64    `json:"kill_max_dd_r"`
}
type Definition struct { Name string; Versions []Version }
type Checklist struct {
	VegasDir string          `json:"vegas_dir"` // long / short
	Checks   map[string]bool `json:"checks"`
}

var Current Definition // v1.go

func (d Definition) Validate() error                 // 名称非空；No 从 1 连续；每版条目键唯一且非空；Setup 只能为空或 Setups 之一
func (d Definition) Version(no int) (Version, bool)
func (v Version) Normalize(setup string, c Checklist) (Checklist, error)
func (v Version) Violations(side, setup string, c Checklist, deviations []string) []string
func (v Version) ValidDeviations(ds []string) error
```

`Normalize`：`setup` 必须是 `Setups` 之一；`VegasDir` 必须是 `long`/`short`；`Checks` 里出现不存在或不适用于该 Setup 的键时报错 `清单项不适用：<key>`；返回的 `Checks` 恰好包含所有适用条目（缺的补 false），nil map 视为空。
`Violations`：顺序为 `vegas_dir`（`VegasDir != side` 时）→ 按 `Items` 顺序、适用于 `setup` 且 `Kind == Rule` 且未勾的键 → 按 `Deviations` 定义顺序、出现在 `deviations` 中的键。注意项永不出现。返回非 nil 切片。
`ValidDeviations`：键必须已定义且不重复。
错误用 `errors.New`，文字中文，由 store 包成 `InvalidError`。

- [ ] **Step 1: 写测试 `internal/rules/rules_test.go`**

```go
func TestCurrentValid(t *testing.T)            // rules.Current.Validate() == nil；Current.Versions[0].No == 1；Rules 以 "看到一个K线图，应该要做什么呢" 开头
func TestNormalizeFillsMissing(t *testing.T)   // breakout + {vegas_dir:long, checks:{no_chop:true}} → checks 含 no_chop、after_climax、lines_drawn、bo_trend_clear、bo_bars_ok、stop_order、stop_placed、accept_loss 共 8 键，不含 pb_*
func TestNormalizeRejectsOtherSetup(t *testing.T) // breakout + checks{pb_second_entry:true} → 错误信息含 "pb_second_entry"
func TestNormalizeRejects(t *testing.T)         // setup "x"、vegas_dir ""、未知键 "foo" 均报错
func TestViolations(t *testing.T)               // 表驱动：
// 全部规则项勾上、vegas_dir 与 side 同为 long、无偏差 → []
// vegas_dir short、side long → ["vegas_dir", ...] 首项为 vegas_dir
// after_climax=false、其余规则全勾 → []（注意项不算）
// pullback 下 pb_signal_bar=false → ["pb_signal_bar"]
// 全勾 + deviations ["early_exit","moved_stop"] → ["moved_stop","early_exit"]（按定义顺序）
func TestValidDeviations(t *testing.T)          // "moved_stop" ok；"x" 报错；重复报错
func TestValidateDefinition(t *testing.T)       // 版本号 1,3 → 错；重复键 → 错；空名 → 错
```

- [ ] **Step 2: 运行确认失败**

Run: `go test ./internal/rules/`
Expected: FAIL（包或符号未定义）

- [ ] **Step 3: 实现 `rules.go`，并在 `v1.go` 写 `Current`**

`Current.Name = "Vegas 顺势"`。版本 1 的 `Rules` 为用户 2026-11-25 发来的策略原文，用 Go 原始字符串逐字写入（首尾去掉空行，不得改写）。停用条件全为 nil。原文：

```text
看到一个K线图，应该要做什么呢

首先，打开一个K线，永远先判断的是背景，背景决定你做什么，是多还是空；
背景如何判断呢？目前我的做法是看 1小时的Vegas，顺着1小时vegas的方向，并且画出趋势线和通道线，很关键，对于回调的参考，不然你入场的位置很难把握，只有在明确的阻力位和明确的入场信号K才有可观的概率；
Attention：有两个重要地方需要空仓：
1.如果K线不断穿越 vegas，这个时候不要做，耐心等待突破，等待某一方掌控局面；
2.如果刚刚有一波大的跌破，这个时候容易超卖，入场做空容易被埋，耐心等待回调（最好是等待回调到主要高点MH）；

然后是setup；
我的入场一般分为突破前高入场和等回调入场；
突破入场一定得看趋势的强弱和回调的深度；
突破入场只适合趋势明确，前一波或者这一波回调较小的时候，超过20根K线之后要考虑有回调，还有触碰阻力位的反应，如果反弹很大，可能还会继续回调；
回调入场最好要等回调到明确的阻力位（主要高点或主要低点）；等待高二和低二的机会，而且信号K线要比较好才入；
使用stop order入场！

止损设在主要高点之上一点或者主要低点之下一点，如果趋势很强，入场很远，就设为 1/2 处；

使用Vegas参考很容易吃到大头，采用移动止损最好，还可以采用measured move测量止盈，或者分仓；

关于心态：止损和入场，止盈都是入场前要做好的事，这单的亏损要是接受不了，那就不要做了，在K线跳动时就不要操作了。耐心等待止盈或者止损，相信趋势的力量！

要画的线：vegas均线组，通道线，趋势线，主要高点（或主要低点），回调的幅度指示
```

条目（顺序即显示顺序）：

| Key | Section | Label | Kind | Setup |
| --- | --- | --- | --- | --- |
| `no_chop` | 背景 | K 线没有反复穿越 Vegas，已有一方掌控局面 | rule | |
| `after_climax` | 背景 | 刚有一波大的突破或跌破，还没回调（高潮行情反弹会很远） | attention | |
| `lines_drawn` | 画线 | 已画 Vegas、趋势线、通道线、主要高点或主要低点 | rule | |
| `bo_trend_clear` | 突破 | 趋势明确，前一波或这一波回调较小 | rule | breakout |
| `bo_bars_ok` | 突破 | 没超过约 20 根 K 线，或已考虑回调和阻力位的反应 | rule | breakout |
| `pb_key_level` | 回调 | 回调到明确的阻力位（主要高点或主要低点） | rule | pullback |
| `pb_second_entry` | 回调 | 是高二或低二 | rule | pullback |
| `pb_signal_bar` | 回调 | 信号 K 线较好 | rule | pullback |
| `stop_order` | 入场 | 用 stop order 入场 | rule | |
| `stop_placed` | 止损 | 止损在主要高点之上或主要低点之下一点；趋势很强、入场很远时设在 1/2 处 | rule | |
| `accept_loss` | 心态 | 这笔亏损我能接受 | rule | |

偏差：`moved_stop` 持仓中手动改了止损（计划内的移动止损不算）；`early_exit` 提前离场（没到止损、目标，也不是计划内的移动止损出场）；`unplanned_add` 加仓或其他计划外操作。

`v1.go` 顶部注释写明：**改规则或清单时追加新版本，不要修改已有版本**。

- [ ] **Step 4: 运行确认通过**

Run: `go test ./internal/rules/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/rules
git commit -m "新增 rules 包：策略版本 1 的规则原文、开仓清单、平仓偏差与违规判定"
```

---

### Task 2: 新表结构、拒绝旧库与策略同步

**Files:**
- Modify: `internal/store/store.go`（`schema`、`Open`，删除 1→2→3 迁移）、`internal/store/strategy.go`
- Modify: `cmd/journal/main.go`（`store.Open(path, rules.Current)`）
- Test: `internal/store/store_test.go`（新增；删除依赖建策略接口和旧迁移的测试，如 `TestMigrateV1Database`、`TestStrategyVersions`、`TestDuplicateNameConflict`，其余在 Task 3 统一重写）

**Interfaces:**
- Consumes: `rules.Definition`, `Definition.Validate`
- Produces:

```go
func Open(path string, def rules.Definition) (*Store, error)
func (s *Store) Definition() rules.Definition
func (s *Store) Strategy() (Strategy, error)        // 唯一策略
func (s *Store) ListVersions() ([]Version, error)   // 唯一策略的全部版本，No 升序
func (s *Store) CurrentVersion() (Version, error)
```

删除：`CreateStrategy`、`UpdateStrategy`、`CreateVersion`、`ErrNameTaken`、`nameConflict`、`Strategy.Archived`。`Store` 结构体增加 `def rules.Definition` 字段。

`schema` 直接写成最终结构：`schema_version` 初值 4；`strategies(id,name,created_at)`；`strategy_versions` 不变；`equity_calibrations` 并入；`trades` 在现有列基础上 `phase TEXT NOT NULL`，并增加 `setup TEXT NOT NULL`、`key_level REAL NOT NULL`、`exit_plan TEXT NOT NULL`、`target REAL`、`checklist TEXT NOT NULL`、`deviations TEXT NOT NULL`。

`Open` 流程：
1. `def.Validate()`，失败返回 `invalidError`。
2. 在执行任何建表语句之前，查询 `sqlite_master` 是否已有 `schema_version` 表；有则读版本，不等于 4 时关闭连接并返回 `旧版数据库不再兼容，请删除或换一个 JOURNAL_DB 路径`。注意：连接串里的 `journal_mode(WAL)` 会改写旧文件头，判断旧库要先用不带 WAL pragma 的只读连接（`mode=ro`）完成，通过后再用正式连接打开。
3. 正式连接在事务内执行 `schema`，再 `syncStrategy(tx, def)`：没有策略行就插入，有就把名称更新为 `def.Name`；数据库版本数多于定义时报错 `数据库中的策略版本比程序新，请更新程序`；同号版本规则或停用条件不一致时报错 `版本 N 的规则与数据库不一致：已写入的版本不能修改，请在代码中追加新版本`；缺的版本按顺序插入。

- [ ] **Step 1: 写测试**

```go
func TestOpenFreshSeedsStrategy(t *testing.T) // 新库：Strategy().Name == def.Name；ListVersions 长度 == len(def.Versions)；schema_version == 4
func TestSyncIdempotent(t *testing.T)         // 同一文件 Open→Close→Open：版本数不变
func TestSyncAppendsNewVersion(t *testing.T)  // 先用 1 个版本的 def 打开，再用 2 个版本的 def 打开：CurrentVersion().No == 2，v1 的 ID 不变
func TestSyncRejectsChangedVersion(t *testing.T) // 第二次打开时 v1.Rules 改动 → Open 返回错误，含 "不能修改"
func TestSyncRejectsNewerDatabase(t *testing.T)  // 先 2 个版本，再 1 个版本 → 错误含 "比程序新"
func TestOpenRejectsOldDatabase(t *testing.T)
// 用 sql.Open（rollback journal，不开 WAL）建一个 schema_version=3 的小库并关闭，记下文件字节；
// Open(path, testDef) 返回含 "不再兼容" 的错误；文件字节不变，且不存在 path+"-wal"
```

测试里用一个本地 `testDef`（两个小版本，条目可少），不要依赖 `rules.Current` 的具体条目。

- [ ] **Step 2: 运行确认失败**

Run: `go test ./internal/store/ -run 'TestOpen|TestSync'`
Expected: FAIL（`Open` 参数不匹配）

- [ ] **Step 3: 按上述流程实现，并改 `main.go`**

- [ ] **Step 4: 运行确认通过**

Run: `go test ./internal/store/ -run 'TestOpen|TestSync'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/store cmd/journal
git commit -m "数据库改为新结构，不再兼容旧库；策略版本由代码同步"
```

---

### Task 3: 交易字段、按规则执行计算、备份版本 4

**Files:**
- Modify: `internal/store/trade.go`, `internal/store/dump.go`, `internal/store/equity.go`（如受影响）
- Test: `internal/store/store_test.go`（重写剩余旧测试：去掉建策略调用，改用新 `OpenInput`；保留并发平仓、补丁清空、WAL、UTC 排序等测试的原意）

**Interfaces:**
- Consumes: Task 1 全部、Task 2 `CurrentVersion`
- Produces:

```go
type OpenInput struct {
	Symbol, EntryReason, Phase, Setup, ExitPlan string
	Side                                     stats.Side
	Entry, Stop, Equity, RiskPct, Qty, KeyLevel float64
	Target                                   *float64
	Checklist                                rules.Checklist
}   // json: symbol side entry stop equity risk_pct qty entry_reason phase setup key_level exit_plan target checklist；无 strategy_id
type CloseInput struct {
	Exit float64; ExitReason, ReviewNote string
	High, Low, Funding *float64
	Deviations []string                      // json: deviations；无 followed_rules
}
// TradePatch：删除 FollowedRules，新增 Deviations *[]string `json:"deviations"`；不含任何清单字段
// Trade 新增：Setup string, KeyLevel float64, ExitPlan string, Target *float64,
//   Checklist rules.Checklist, Deviations []string（持仓中为 []，JSON 不为 null）
// Trade.Phase 由 *string 改为 string（必填）；KeyLevel 做空为主要高点、做多为主要低点，后端不按方向校验位置
func (s *Store) OpenTrade(in OpenInput) (Trade, error) // 归入当前版本
func (s *Store) VersionDef(versionID int64) (rules.Version, error)
```

校验（`validateTrade(t *Trade, v rules.Version)`）：
- `EntryReason` 改为选填（仍 trim）；`Symbol` 必填，错误 `品种不能为空`。
- `Checklist` 经 `v.Normalize(t.Setup, ...)` 规范化后保存；`KeyLevel` 必须是大于 0 的有限数，错误 `请填写主要高点或主要低点的价格`；`ExitPlan` 必须是 `rules.ExitPlans` 之一；`Target` 非空时必须大于 0，且只有 `measured_move` 允许填，否则 `只有 measured move 出场才填写目标价`。
- 持仓中 `Deviations` 必须为空；已平仓时 `v.ValidDeviations`。
- 已平仓：`FollowedRules = len(v.Violations(side, setup, checklist, deviations)) == 0`；持仓中：nil。用户传入的值一律被覆盖。
- `checklist`、`deviations` 以 JSON 文本存列；`saveTrade` 不更新 `setup/key_level/exit_plan/target/checklist/phase`。

备份：`Dump.SchemaVersion = 4`；导入只接受 4；`Strategies` 必须恰好 1 个；`Versions` 必须是 `s.def` 的前缀（No 从 1 连续，规则与停用条件与定义一致），否则 `备份中的策略版本与程序不一致`；每笔交易按所属版本的定义校验。导入事务末尾调用 `syncStrategy` 补齐缺失版本，并把策略名更新为 `def.Name`。

- [ ] **Step 1: 写测试**

```go
func TestOpenTradeChecklist(t *testing.T)
// 违规开仓（accept_loss=false）能保存；返回的 Checklist.Checks 含全部适用键；FollowedRules == nil；Deviations 为 []
func TestOpenTradeValidationNew(t *testing.T) // 表驱动：KeyLevel 0、ExitPlan "x"、target 配 trail、setup ""、checklist 带不适用键 → 均为 InvalidError；EntryReason "" 合法
func TestCloseComputesFollowed(t *testing.T)
// 全勾开仓 + 平仓无偏差 → *FollowedRules == true
// 全勾开仓 + 平仓 deviations ["early_exit"] → false
// 违规开仓 + 无偏差 → false
// 平仓 deviations ["bogus"] → InvalidError
func TestPatchSideRecomputesFollowed(t *testing.T) // 已平仓、按规则的多单，补丁 side=short 且 stop/exit 调成合法空单 → FollowedRules 变 false
func TestPatchDeviations(t *testing.T)             // 补丁 deviations ["moved_stop"] → false；再补丁 [] → true
func TestChecklistImmutable(t *testing.T)          // UpdateTrade 后 setup、key_level、checklist、phase 与开仓时一致
func TestExportImportRoundTripV4(t *testing.T)     // 导出 → 导入 → 再导出，JSON 完全相同
func TestImportRejectsOldOrMismatched(t *testing.T) // schema_version 3 → 拒绝；两个策略 → 拒绝；v1 规则不同 → 拒绝；拒绝后原数据不变
func TestImportSyncsVersions(t *testing.T)          // 用 1 版本 def 的库导出，再用 2 版本 def 打开另一个库导入 → CurrentVersion().No == 2
```

- [ ] **Step 2: 运行确认失败**

Run: `go test ./internal/store/`
Expected: FAIL

- [ ] **Step 3: 实现，并重写其余旧测试**

- [ ] **Step 4: 运行确认通过**

Run: `go test ./internal/store/ ./internal/rules/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/store
git commit -m "交易记录开仓清单与平仓偏差，按规则执行由后端计算；备份升级到版本 4"
```

---

### Task 4: 接口与报告统计

**Files:**
- Modify: `internal/api/api.go`, `internal/api/views.go`, `internal/api/handlers.go`
- Test: `internal/api/api_test.go`（重写依赖建策略的测试）

**Interfaces:**
- Consumes: Task 1–3
- Produces（JSON 契约，前端依赖）:

路由：删除 `GET/POST /api/strategies`、`GET/PATCH /api/strategies/{id}`、`POST /api/strategies/{id}/versions`；新增 `GET /api/strategy`；其余保留。

```go
type groupView struct { Key string; N int; WinRate, Expectancy, TotalR float64; QualityN int; AvgMFE, AvgMAE float64 }
// json: key n win_rate expectancy total_r quality_n avg_mfe avg_mae
type violationView struct { Key string; N int; TotalR float64 }           // key n total_r
type attentionView struct { Key string; Checked, Unchecked groupView }    // key checked unchecked
type executionView struct {
	ClosedN, FollowedN, ViolatedN int; FollowedRate *float64; ViolatedR float64
	RecentN, RecentViolated int // 最近至多 10 笔已平仓（按 closed_at）中违规笔数
}   // closed_n followed_n violated_n followed_rate violated_r recent_n recent_violated
type report struct {
	Edge       stats.VersionStats `json:"edge"`       // 只用按规则单，含停用条件与结论
	All        stats.Summary      `json:"all"`        // 全部已平仓单
	Execution  executionView      `json:"execution"`
	Setups     []groupView        `json:"setups"`     // breakout、pullback 两行，按规则单
	Phases     []groupView        `json:"phases"`     // early mid late unsure 四行，按规则单
	Attention  []attentionView    `json:"attention"`  // 每个注意项一行，按规则单
	Violations []violationView    `json:"violations"` // 全部已平仓单；只列 N>0 的键；按 TotalR 升序，相同按定义顺序（vegas_dir 最前）
}
type tradeView struct { store.Trade; R, MFE, MAE *float64; Violations []string `json:"violations"` } // 持仓中只含开仓违规
type openTradeView struct { tradeView; VersionNo int `json:"version_no"`; RiskAmount float64 `json:"risk_amount"` }
type overviewView struct {
	Settings store.Settings; Equity, LastEquity *float64
	Strategy store.Strategy; Version store.Version; Definition rules.Version
	Report report; OpenTrades []openTradeView
}   // json: settings equity last_equity strategy version definition report open_trades
// GET /api/strategy → {strategy, versions: [{version, definition, edge_summary: stats.Summary, verdict, execution}]}
// GET /api/versions/{id}/stats → {version, definition, report, trades: []tradeView}
```

`monthlyView` 删除 `Strategies` 字段，其余不变（含违规单）。`phases()` 改为生成 `groupView`，与 Setups、Attention 共用一个分组函数。

- [ ] **Step 1: 写测试**

```go
func TestFullFlowSingleStrategy(t *testing.T)
// 无口令 401 → GET /api/overview 有 strategy.name、definition.items 非空 → POST /api/trades（无 strategy_id，违规开仓）201，返回 violations 含 "accept_loss"
// → 平仓 → overview.report.execution.violated_n == 1、edge.summary.n == 0、all.n == 1
// → 再开一笔全勾、平仓 → edge.summary.n == 1、execution.followed_rate == 0.5
func TestReportGroups(t *testing.T)
// 3 笔按规则单（2 breakout、1 pullback；1 笔勾 after_climax），1 笔违规单（moved_stop）
// setups: breakout n=2、pullback n=1；attention[0].checked.n == 1、unchecked.n == 2
// violations == [{key:"moved_stop", n:1, ...}]；违规单不进 phases
func TestOldStrategyRoutesGone(t *testing.T) // POST /api/strategies、PATCH /api/strategies/1、POST /api/strategies/1/versions → 404
func TestOpenRejectsStrategyID(t *testing.T) // 请求体含 strategy_id → 400 "请求格式不正确"
func TestPatchRejectsChecklistFields(t *testing.T) // PATCH 带 setup 或 checklist → 400
func TestRecentViolations(t *testing.T) // 12 笔已平仓，最后 10 笔中 3 笔违规 → recent_n 10、recent_violated 3
```

保留并改写：鉴权、JSON 限制、静态文件、字体类型、缓存、UTC 时间、月度（去掉策略分组断言）、权益接口、并发平仓。

- [ ] **Step 2: 运行确认失败**

Run: `go test ./internal/api/`
Expected: FAIL

- [ ] **Step 3: 实现**

- [ ] **Step 4: 全部测试通过**

Run: `go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/api
git commit -m "接口改为单一策略：报告同时给出按规则单的优势和全部单的执行情况"
```

---

### Task 5: 前端：记一笔（开仓清单）、平仓偏差、改单

**Files:**
- Modify: `web/app.js`（`tradeModal`、`checkbox` 等辅助函数）、`web/app.css`

**Interfaces:**
- Consumes: `overview.definition`（`items`、`deviations`）、Task 4 的交易 JSON；打开详情里的旧版本交易时用该版本的 `definition`。

开仓弹窗（自上而下）：品种、方向、入场价、止损价、关键价位（必填；做空时标签为“主要高点”，做多时为“主要低点”，随方向即时切换）、权益、风险比例、数量、实时 1R/建议数量/名义价值（沿用）→ 趋势阶段（沿用 `phasePicker`）→ Setup 二选一（突破前高 / 回调高二·低二，无默认，未选不能保存）→ 清单：按 `section` 分组显示适用条目，`attention` 条目用注意色并标“注意”；“1H Vegas 方向”单选（多/空）放在“背景”组首行，默认跟随方向，用户改过后不再跟随 → 出场计划三选一，选 measured move 时出现目标价输入 → 备注（原入场理由，选填）。

- 切换 Setup 时隐藏另一类条目，提交时只发送当前 Setup 的适用条目。
- 未满足的规则项实时汇总在保存按钮上方（如“未满足 2 项：信号 K 线较好、这笔亏损我能接受”）；有违规时保存按钮文字为“记为违规开仓”，否则“保存”。
- 平仓弹窗：去掉“是否按规则”勾选，换成偏差复选框（来自 `definition.deviations`）；保存前实时显示 R（沿用）和“将记为按规则 / 违规”的预判（开仓违规或勾了偏差即违规）。
- 改单：清单字段与趋势阶段只读展示；已平仓单可改偏差，补丁中偏差全不勾时发送 `deviations: []`。
- 交易列表与持仓列表：`violations` 非空时显示“违规”标签，悬停/点开显示违规项中文名（`vegas_dir` 显示为“与 1H Vegas 方向相反”）。

- [ ] **Step 1: 实现上述界面**
- [ ] **Step 2: 本地运行验证**

Run: `go build -o journal ./cmd/journal && JOURNAL_TOKEN=dev JOURNAL_DB=$SCRATCH/dev.db ./journal`（`$SCRATCH` 为会话临时目录）
在浏览器中：开一笔全勾单、一笔漏勾单（按钮文字变化）、切换 Setup 后只提交当前条目（看网络请求体）、平仓勾一个偏差、改单改偏差；手机宽度（约 400px）下清单一屏内可操作。
Expected: 全部符合；控制台无错误。

- [ ] **Step 3: Commit**

```bash
git add web
git commit -m "记一笔改为按规则清单勾选，平仓记录执行偏差"
```

---

### Task 6: 前端：首页、版本详情、月度与设置，文档收尾

**Files:**
- Modify: `web/app.js`（`renderHome`、`renderDetail`、`renderMonthly`、`renderSettings`，删除 `strategyRows`、`strategyModal`）、`web/app.css`、`web/index.html`（导航“策略面板”改为“首页”）
- Modify: `README.md`

首页从上到下：账户权益与交易时段（不变）→ **策略优势**卡：策略名与版本号、按规则单笔数、E、置信区间条、结论标签、累计 R 曲线，“查看详情”进入当前版本详情 → **执行情况**卡：按规则执行率、最近 10 笔违规数、全部单 vs 按规则单的笔数/E/累计 R 两行对照及 E 差值（标注“执行损耗”）、违规单累计 R → 持仓中列表。去掉策略列表、新建策略、归档区和“试过的策略越多”提示。

版本详情：规则全文（只读）、清单条目列表（只读）、`edge` 全部统计与附加检验（沿用现有卡片）、执行情况、按 Setup、按趋势阶段（沿用样本不足变淡规则）、注意项对照、按违规项（中文名、次数、累计 R）、版本历史切换（`GET /api/strategy`）、交易列表。去掉“编辑规则”“归档”按钮。

月度页：去掉按策略分组的表。设置页：删除与策略相关的入口；导入提示改为“只接受版本 4 的备份”。

README：替换“使用与计算口径”中策略新建、版本编辑、归档、开仓理由必填、手动勾选按规则的描述；新增一节“修改策略规则”：在 `internal/rules` 追加新版本 → 测试 → 部署，启动时自动生成新版本；写明本版不兼容旧数据库：部署前停服、删除或改名旧的 `journal.db`（连同 `-wal`、`-shm`），启动后重新设置账户权益。

- [ ] **Step 1: 实现上述页面与文档**
- [ ] **Step 2: 本地验证**

用 Task 5 的运行方式：首页两张卡数字与 `GET /api/overview` 一致；详情各表显示；月度、设置页无报错；三个主题下标签颜色可读；手机宽度布局正常。另用旧版程序（`git stash` 或 `git worktree` 检出 `44d3da0`）生成一个旧库，用新程序指向它启动，确认拒绝启动并给出提示。
Expected: 全部符合。

- [ ] **Step 3: 全量测试**

Run: `go test ./... && go vet ./...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web README.md
git commit -m "首页改为策略优势与执行情况两块，版本详情增加按 Setup、注意项与违规项拆分"
```
