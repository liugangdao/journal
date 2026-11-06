# 手动交易日志 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 本仓库约定：代码由 Codex 实现，Claude 审核验收（见 `~/.claude/CLAUDE.md` 的 codex-delegate 约定）。

**Goal：** 在 `journal/` 下实现一个 Go 单文件可执行程序，提供手动交易记录、策略版本管理和按版本的优势统计，前端内嵌。

**Architecture：** 纯函数统计包 `internal/stats` 不依赖数据库和 HTTP；`internal/store` 负责 SQLite 建表、读写、校验、导入导出；`internal/api` 负责鉴权、路由和把 store 数据组装成统计结果；`web/` 是按模板实现的无构建前端，经 `go:embed` 打包；`cmd/journal` 读环境变量启动。

**Tech Stack：** Go 1.22（本机 `go1.22.12`）、标准库 `net/http`、`modernc.org/sqlite`（选与 Go 1.22 兼容的版本，如 `v1.33.1`）、原生 HTML/CSS/JS。

**Spec：** `docs/superpowers/specs/2026-11-06-trade-journal-design.md`；视觉基准 `docs/superpowers/specs/2026-11-06-trade-journal-template.html`。

## Global Constraints

- 独立 Go module：`journal/go.mod`，module 名 `github.com/liugangdao/journal`，`go 1.22`。除 `modernc.org/sqlite` 外只用标准库。
- 注释、日志、错误消息、页面文案使用简体中文。
- 环境变量：`JOURNAL_TOKEN`（必填，未设置则退出码非 0 并打印中文错误）、`JOURNAL_DB`（默认 `./journal.db`）、`JOURNAL_ADDR`（默认 `127.0.0.1:8800`）。
- 所有 `/api/*` 需要 `Authorization: Bearer <token>`，用 `crypto/subtle.ConstantTimeCompare` 比较；失败返回 401。
- 接口 JSON 字段一律 snake_case；错误响应 `{"error":"<中文消息>"}`，状态码：校验失败 400、未授权 401、不存在 404、冲突 409。
- 时间以 UTC RFC3339 存储和传输，前端按本地时区显示。
- 统计常量：`min_sample` 默认 30、`risk_pct` 默认 1.0、bootstrap 2000 次、固定种子 `20261106`、多空提示每边至少 10 笔、去掉最好的 5 笔。
- 前端不加载任何外部资源（CDN、字体），两套主题（护眼默认 / 柔和深色），所有颜色为 CSS 变量。
- 不提交、不推送（仓库约定）；运行 `go build` / `go test` 需用户授权。

## Review Focus

1. **数字带千分位或空格**（用户从交易所复制 `68,420.5`）：前端提交前去掉逗号和空白；后端对 ≤0 或非数字拒绝 400。→ Task 5 前端解析函数、Task 4 `TestOpenTradeRejectsBadNumbers`。
2. **修改已平仓单导致止损在错误一侧或入场 = 止损**（R 除以 0）：`UpdateTrade` 走与开仓相同的校验。→ Task 3 `TestUpdateTradeRevalidates`。
3. **手机和电脑同时平同一笔**：第二次平仓返回 409，不覆盖第一次。→ Task 3 `TestCloseTwiceConflict`、Task 4 流程测试。
4. **改规则后再修改旧版本下的交易**：交易的 `version_id` 永不改变，补丁中带 `version_id` 被忽略。→ Task 3 `TestTradeVersionImmutable`。
5. **导入的 JSON 引用不存在的版本或策略**：整体回滚，原数据不变。→ Task 3 `TestImportRollbackOnBadReference`。

---

### Task 1：单笔交易计算（R、MFE、MAE）

**Files：**
- Create：`journal/go.mod`、`journal/internal/stats/trade.go`
- Test：`journal/internal/stats/trade_test.go`

**Interfaces：**
- Produces：
  ```go
  type Side string            // "long" | "short"
  const (Long Side = "long"; Short Side = "short")
  type ClosedTrade struct {
      ID int64; Side Side
      Entry, Stop, Qty, Exit float64
      Funding float64          // 付出为正，未填为 0
      High, Low *float64       // 选填
      FollowedRules bool
      ClosedAt time.Time
  }
  func RiskPerUnit(t ClosedTrade) float64           // |Entry-Stop|
  func RMultiple(t ClosedTrade) float64             // (d*(Exit-Entry)*Qty - Funding) / (Qty*|Entry-Stop|)
  func Excursions(t ClosedTrade) (mfe, mae float64, ok bool) // 需 High 和 Low 都有值
  func SuggestQty(equity, riskPct, entry, stop float64) float64 // equity*riskPct/100/|entry-stop|
  ```

- [ ] **Step 1：写失败测试**（表驱动，`TestRMultiple`）
  - 多：Entry 100、Stop 95、Qty 2、Exit 110、Funding 0 → `2.0`
  - 空：Entry 100、Stop 105、Qty 2、Exit 90 → `2.0`
  - 多止损：Entry 100、Stop 95、Qty 2、Exit 95 → `-1.0`
  - 资金费：Entry 100、Stop 95、Qty 2、Exit 110、Funding 2 → `1.8`
  - `TestExcursions`：多 Entry 100 Stop 95 High 112 Low 97 → mfe `2.4`、mae `0.6`；空 Entry 100 Stop 105 High 103 Low 88 → mfe `2.4`、mae `0.6`；High 为 nil → `ok=false`。
  - `TestSuggestQty`：`SuggestQty(10000, 1, 68420, 67550)` ≈ `0.114943`（误差 1e-6）。
- [ ] **Step 2：运行确认失败** `cd journal && go test ./internal/stats/ -run 'TestRMultiple|TestExcursions|TestSuggestQty'` → 编译失败（未定义）。
- [ ] **Step 3：实现** `trade.go` 中上述函数。
- [ ] **Step 4：运行确认通过**，同一命令 → `ok`。
- [ ] **Step 5：不提交**（仓库约定），列出改动文件交 Claude 审核。

---

### Task 2：按版本的统计、结论和附加检验

**Files：**
- Create：`journal/internal/stats/compute.go`
- Test：`journal/internal/stats/compute_test.go`

**Interfaces：**
- Consumes：Task 1 的 `ClosedTrade`、`RMultiple`、`Excursions`。
- Produces（全部带 snake_case json tag）：
  ```go
  const (BootstrapIters = 2000; BootstrapSeed = 20261106; SideMinN = 10; TopK = 5)
  type KillRule struct { RecentN *int; RecentBelow *float64; MaxDDR *float64 }
  type Verdict string // "kill" | "insufficient" | "edge" | "promising" | "none"
  type Summary struct {
      N int; WinRate, AvgWin, AvgLoss, Expectancy, StdDev float64
      CIOK bool; CILow, CIHigh float64
      TotalR, MaxDrawdownR float64; MaxLossStreak int
      Curve []float64          // 累计 R，首元素为 0，长度 N+1
  }
  type SideSplit struct { LongN, ShortN int; LongE, ShortE float64; Warn bool }
  type TopRemoved struct { Computed bool; E float64; Warn bool }
  type RuleSplit struct { FollowedN, ViolatedN int; FollowedE, ViolatedE, FollowedR, ViolatedR float64 }
  type Quality struct { N int; AvgMFE, AvgMAE, AvgGiveback float64 }
  type KillStatus struct {
      RecentEvaluated, RecentTriggered bool; RecentMean float64
      DDEvaluated, DDTriggered bool
      Triggered bool
  }
  type VersionStats struct {
      Summary Summary; Sides SideSplit; TopRemoved TopRemoved
      Rules RuleSplit; Quality Quality; Kill KillStatus; Verdict Verdict
  }
  func Bootstrap(rs []float64, iters int, seed int64) (lo, hi float64)
  func Compute(trades []ClosedTrade, rule KillRule, minSample int) VersionStats
  ```
- 口径（来自设计第 5、6 节）：
  - `Compute` 先按 `ClosedAt` 升序排序（相同时按 ID）。
  - 盈利 R>0、亏损 R≤0；`AvgLoss` 是负数；无对应笔数时为 0。
  - `StdDev` 用样本标准差（n−1），n<2 为 0。
  - `MaxDrawdownR` 是累计曲线从峰值回落的最大幅度，取正数。
  - `Bootstrap`：用 `math/rand.New(rand.NewSource(seed))`，每次有放回抽 n 个求均值。排序后 `lo = means[int(0.025*iters)]`，`hi = means[int(0.975*iters)-1]`。n<2 时 `CIOK=false`。
  - 结论优先级：`Kill.Triggered` → kill；`N < minSample` → insufficient；`CIOK && CILow > 0` → edge；`Expectancy > 0` → promising；否则 none。
  - 多空：`Warn = LongN>=10 && ShortN>=10 && ((LongE>0 && ShortE<=0) || (ShortE>0 && LongE<=0))`。
  - 去掉最好 5 笔：`N > 5` 才计算；`Warn = Expectancy>0 && E<=0`。
  - 质量：只算 `Excursions` 为 ok 的交易；`Giveback = MFE − R`。
  - 停用条件：最近 N 笔规则在 `RecentN`、`RecentBelow` 都有值且 `N >= RecentN` 时判定，`RecentMean < RecentBelow` 时触发；回撤规则在 `MaxDDR` 有值时判定，`MaxDrawdownR > MaxDDR` 时触发。

- [ ] **Step 1：写失败测试**
  - `TestSummaryBasic`：R 序列 `[2, -1, -1, 3, -1]`（用 Entry 100/Stop 99/Qty 1 构造）→ N 5、WinRate 0.4、AvgWin 2.5、AvgLoss −1、Expectancy 0.4、TotalR 2、MaxDrawdownR 2、MaxLossStreak 2、Curve `[0,2,1,0,3,2]`。
  - `TestBootstrapDeterministic`：同输入调用两次结果相同；对 50 个 R=1 的序列，lo=hi=1。
  - `TestVerdict`（表驱动）：29 笔 → insufficient；30 笔全为 +1 → edge；30 笔交替 `+3/-2` 且 CI 跨 0 → promising（用断言 CILow<0 确认前提）；30 笔全为 −1 → none；任意序列加上触发的 kill 规则 → kill。
  - `TestSideWarn`：10 多各 +1、10 空各 −1 → Warn true；9 多 + 10 空 → false。
  - `TestTopRemoved`：`[5,5,5,5,5,-1,-1,-1]` → Computed true、E −1、Warn true；5 笔 → Computed false。
  - `TestKillRecentNotEnough`：RecentN 30、只有 29 笔且全为 −1 → RecentEvaluated false、Triggered false。
  - `TestKillDrawdown`：MaxDDR 2、序列 `[-1,-1,-1]` → DDTriggered true。
  - `TestQualityOnlyFilled`：3 笔中 2 笔有高低价 → Quality.N 2。
- [ ] **Step 2：运行确认失败** `cd journal && go test ./internal/stats/` → 编译失败。
- [ ] **Step 3：实现** `compute.go`。
- [ ] **Step 4：运行确认通过**，同一命令 → `ok`。
- [ ] **Step 5：不提交**，交 Claude 审核。

---

### Task 3：SQLite 存储、校验、导入导出

**Files：**
- Create：`journal/internal/store/store.go`（打开、建表、设置）、`journal/internal/store/strategy.go`、`journal/internal/store/trade.go`、`journal/internal/store/dump.go`
- Test：`journal/internal/store/store_test.go`

**Interfaces：**
- Consumes：Task 1 的 `stats.Side`、`stats.SuggestQty`。
- Produces：
  ```go
  var (ErrNotFound, ErrConflict = errors.New(...), errors.New(...))
  type InvalidError struct{ Msg string }   // 校验失败，Msg 为中文，API 原样返回
  type Settings struct { RiskPct float64 `json:"risk_pct"`; MinSample int `json:"min_sample"` }
  type Strategy struct { ID int64; Name string; Archived bool; CreatedAt time.Time }
  type VersionInput struct { Rules string; KillRecentN *int; KillRecentBelow *float64; KillMaxDDR *float64 }
  type Version struct { ID, StrategyID int64; No int; VersionInput; CreatedAt time.Time }
  type OpenInput struct { StrategyID int64; Symbol string; Side stats.Side; Entry, Stop, Equity, RiskPct, Qty float64; EntryReason string }
  type CloseInput struct { Exit float64; ExitReason string; FollowedRules bool; ReviewNote string; High, Low, Funding *float64 }
  type TradePatch struct { /* 开仓与平仓字段的指针版本；不含 VersionID、Status */ }
  type Trade struct { ID, VersionID int64; Symbol string; Side stats.Side; Entry, Stop, Equity, RiskPct, Qty float64
      EntryReason string; OpenedAt time.Time; Status string /* "open"|"closed" */
      Exit *float64; ExitReason *string; FollowedRules *bool; ReviewNote string
      High, Low, Funding *float64; ClosedAt *time.Time }
  type TradeFilter struct { VersionID *int64; Status string }
  type Dump struct { Settings Settings; Strategies []Strategy; Versions []Version; Trades []Trade } // 含 schema_version 字段
  func Open(path string) (*Store, error)           // 建表、WAL、默认设置
  func (s *Store) Close() error
  func (s *Store) GetSettings() (Settings, error); PutSettings(Settings) error
  func (s *Store) CreateStrategy(name string, v VersionInput) (Strategy, Version, error) // 同时建 v1
  func (s *Store) ListStrategies(includeArchived bool) ([]Strategy, error)
  func (s *Store) UpdateStrategy(id int64, name *string, archived *bool) (Strategy, error)
  func (s *Store) CreateVersion(strategyID int64, v VersionInput) (Version, error) // No = 当前最大 + 1
  func (s *Store) ListVersions(strategyID int64) ([]Version, error)  // 按 No 升序
  func (s *Store) GetVersion(id int64) (Version, error)
  func (s *Store) CurrentVersion(strategyID int64) (Version, error)
  func (s *Store) OpenTrade(in OpenInput) (Trade, error)   // 记在当前版本；Qty==0 时用 SuggestQty
  func (s *Store) CloseTrade(id int64, in CloseInput) (Trade, error)
  func (s *Store) UpdateTrade(id int64, p TradePatch) (Trade, error)
  func (s *Store) DeleteTrade(id int64) error
  func (s *Store) ListTrades(f TradeFilter) ([]Trade, error) // 按 OpenedAt 降序
  func (s *Store) LastEquity() (float64, bool, error)
  func (s *Store) Export() (Dump, error)
  func (s *Store) Import(d Dump) error                       // 单事务整体替换，保留原 ID
  ```
- 校验（`InvalidError`）：
  - 价格、权益、风险比例、数量必须 > 0。
  - 做多 Stop < Entry，做空 Stop > Entry。
  - `EntryReason`、`Symbol` 去空白后非空，Symbol 转大写。
  - `ExitReason` 只能是 `stop`/`target`/`manual`。
  - 平仓时 High 和 Low 若都填，须 High ≥ Low。
  - 策略名唯一，重复返回 `ErrConflict`。
  - 已归档策略不能开新仓。
  - `Settings.RiskPct` 在 (0, 100]，`MinSample` ≥ 2。
- 平仓已平仓的单返回 `ErrConflict`；`UpdateTrade` 合并后重新跑开仓校验（平仓单还要跑平仓校验）。

- [ ] **Step 1：写失败测试**（每个测试用 `t.TempDir()` 下的新库）
  - `TestStrategyVersions`：建策略得 v1 → `CreateVersion` 得 No 2 → `CurrentVersion` 为 v2 → v1 仍可 `GetVersion`。
  - `TestDuplicateNameConflict`：同名第二次 → `errors.Is(err, ErrConflict)`。
  - `TestOpenTradeDefaults`：Qty 0、Equity 10000、RiskPct 1、Entry 68420、Stop 67550 → Qty ≈ 0.114943，VersionID 为当前版本。
  - `TestOpenTradeValidation`（表驱动）：做多 Stop ≥ Entry、做空 Stop ≤ Entry、Entry ≤ 0、空理由、已归档策略 → 都是 `*InvalidError`。
  - `TestCloseTwiceConflict`：第二次平仓 → `ErrConflict`，第一次的 Exit 不变。
  - `TestUpdateTradeRevalidates`：把已平仓单 Stop 改到 Entry 上 → `*InvalidError`，库中不变。
  - `TestTradeVersionImmutable`：开仓后 `CreateVersion`，再 `UpdateTrade` 改 Symbol → VersionID 仍是旧版本。
  - `TestExportImportRoundTrip`：导出 → 新库导入 → 再导出，两份 Dump 深度相等。
  - `TestImportRollbackOnBadReference`：Dump 中一笔交易引用不存在的版本 → 返回错误，原库数据不变。
- [ ] **Step 2：运行确认失败** `cd journal && go test ./internal/store/` → 编译失败。
- [ ] **Step 3：实现**。用 `database/sql` + `modernc.org/sqlite`（驱动名 `sqlite`），连接串开启外键和 WAL（`_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)`）；首次启动建表并写入默认设置；`schema_version` 表记 1。
- [ ] **Step 4：运行确认通过**，同一命令 → `ok`。
- [ ] **Step 5：不提交**，交 Claude 审核。

---

### Task 4：HTTP 接口与鉴权

**Files：**
- Create：`journal/internal/api/api.go`（`New`、路由、鉴权中间件、JSON 与错误工具）、`journal/internal/api/handlers.go`、`journal/internal/api/views.go`（把 store 数据组装成响应）
- Test：`journal/internal/api/api_test.go`

**Interfaces：**
- Consumes：Task 2 的 `stats.Compute`、`stats.VersionStats`；Task 3 的 `*store.Store` 及类型。
- Produces：`func New(s *store.Store, token string, web fs.FS) http.Handler`。`web` 为 nil 时只提供 `/api/*`。非 `/api/` 路径从 `web` 提供，找不到的路径返回 `index.html`。
- 路由（Go 1.22 `mux.HandleFunc("GET /api/overview", ...)` 写法）：
  - `GET /api/overview`：返回 `settings`、`last_equity`（可为 null）、`totals{closed_n, open_n, total_r, followed_rate, violated_n, violated_r, strategies_n, versions_n}`、`open_trades[]`（交易 + `strategy_name`、`version_no`、`risk_amount`）、`strategies[]`（未归档的：`id, name, current_version{id,no,rules,...}, stats`）、`archived_n`。
    - `totals` 包含已归档策略和旧版本的全部已平仓交易。
    - `followed_rate` 在没有已平仓交易时为 null。
  - `GET /api/strategies?archived=1`、`POST /api/strategies`（`{name, rules, kill_recent_n, kill_recent_below, kill_max_dd_r}`）、`PATCH /api/strategies/{id}`（`{name?, archived?}`）。
  - `GET /api/strategies/{id}`：策略 + `versions[]`（每个带 `stats`）。
  - `POST /api/strategies/{id}/versions`：新版本。
  - `GET /api/versions/{id}/stats`：`version`、`strategy`、`stats`、`trades[]`（已平仓的附 `r`、`mfe`、`mae`；持仓中的也列出）。
  - `POST /api/trades`、`POST /api/trades/{id}/close`、`PATCH /api/trades/{id}`、`DELETE /api/trades/{id}`。
  - `GET /api/settings`、`PUT /api/settings`。
  - `GET /api/export`（附 `Content-Disposition: attachment; filename="journal-YYYYMMDD.json"`）、`POST /api/import`。
- 错误映射：`*store.InvalidError` → 400、`ErrNotFound` → 404、`ErrConflict` → 409、JSON 解析失败 → 400 `请求格式不正确`。请求体限制 10 MiB。

- [ ] **Step 1：写失败测试**（`httptest.NewServer(New(store, "t0ken", nil))`）
  - `TestAuthRequired`：不带头 / 错误口令 → 401；正确口令 → 200。
  - `TestFullFlow`，依次断言：
    1. 建策略 → 201，返回 `current_version.no == 1`。
    2. 开仓（Entry 100、Stop 95、Equity 10000、RiskPct 1、Qty 0）→ overview `open_n == 1`。
    3. 平仓 Exit 110 → 返回交易 `r == 2`。
    4. 再平一次 → 409。
    5. `POST versions` 得 v2，overview 中该策略 `stats.summary.n == 0`。
    6. `GET /api/versions/{v1}/stats` 中 `n == 1`。
    7. 导出 → 导入 → overview 的 `totals.total_r` 不变。
  - `TestOpenTradeRejectsBadNumbers`：`entry: 0`、`entry: "abc"` → 400 且 `error` 非空。
  - `TestImportInvalid`：`{"trades":[{"version_id":999,...}]}` → 400，导入前的数据仍在。
- [ ] **Step 2：运行确认失败** `cd journal && go test ./internal/api/` → 编译失败。
- [ ] **Step 3：实现**。统计结果不落库，每次请求现算（数据量小）。
- [ ] **Step 4：运行确认通过**，`cd journal && go test ./...` → 全部 `ok`。
- [ ] **Step 5：不提交**，交 Claude 审核。

---

### Task 5：前端与启动入口

**Files：**
- Create：`journal/web/index.html`、`journal/web/app.css`、`journal/web/app.js`、`journal/web/embed.go`（`package web`；`//go:embed index.html app.css app.js`；`var FS embed.FS`）、`journal/cmd/journal/main.go`
- 参照：`docs/superpowers/specs/2026-11-06-trade-journal-template.html`（布局、配色变量、两套主题、组件样式直接沿用）

**Interfaces：**
- Consumes：Task 4 的接口和 JSON 字段；`api.New`。
- `main.go`：读三个环境变量，`JOURNAL_TOKEN` 为空时 `log.Fatal("未设置 JOURNAL_TOKEN，拒绝启动")`；`store.Open`；`http.Server{Addr, Handler: api.New(st, token, web.FS), ReadHeaderTimeout: 10s}`；收到 SIGINT/SIGTERM 时优雅关闭并关闭数据库。
- 前端要求：
  - **路由**（hash）：`#home`、`#strategy-<id>`、`#strategy-<id>-v<no>`、`#settings`。没有口令或任一接口返回 401 时显示登录页，口令存在 `localStorage` 的 `journal-token`。
  - **首页**：与模板相同的汇总、持仓中、策略列表。区间条刻度 −1R…+1R，超出范围的截到边缘。结论标签文案：
    - kill → 触发停用
    - insufficient → 样本不足（副标题"还差 N 笔开始评估"）
    - edge → 有优势
    - promising → 有苗头
    - none → 暂无优势
  - **已归档策略**：首页列表下方显示"已归档 N 个"，点开后调用 `GET /api/strategies?archived=1` 列出；详情页提供归档 / 取消归档按钮。
  - **警示图标**：`sides.warn` 或 `top_removed.warn` 为真时显示 "!"，鼠标悬停显示原因。
  - **详情页**：统计卡片、累计 R 曲线（SVG，用 CSS 变量着色）、规则与停用条件、五张检验卡、版本切换（旧版本只读，不显示"编辑规则"按钮）、交易列表。点交易打开编辑弹层，可修改或删除，删除需在弹层内再点一次确认。
  - **记一笔**：
    - 策略下拉只列未归档策略，选中后显示当前版本规则摘要。
    - 权益默认填 `last_equity`，风险比例默认填设置值。
    - 实时计算 1R、建议数量、名义价值，止损在错误一侧时禁用保存并显示提示。
  - **平仓**：实时显示 R；最高价、最低价、资金费收在"更多"里。
  - **新建 / 编辑策略**：编辑时提示"保存后生成 vN+1，新版本从零开始统计"；只改名称走 `PATCH`，不生成版本。
  - **设置**：风险比例、最少笔数；导出（下载 `/api/export`，带口令请求后用 Blob 链接下载）；导入（选文件 → 弹层内二次确认 → `POST /api/import`）。
  - **主题**：护眼默认 / 柔和深色，存 `localStorage` 的 `journal-theme`，`<head>` 内先应用避免闪烁。
  - **数字解析**：`parseNum(str)` 去掉逗号、空白，并把全角数字和全角小数点转为半角，非法返回 NaN。
  - **接口错误**：把 `error` 字段显示在弹层底部，不用 `alert`。
  - **手机宽度**：与模板相同的断点和卡片化。

- [ ] **Step 1：构建** `cd journal && go build -o /tmp/journal-bin ./cmd/journal` → 无输出、退出码 0。
- [ ] **Step 2：启动冒烟** `JOURNAL_TOKEN=dev JOURNAL_DB=$(mktemp -d)/j.db /tmp/journal-bin &`，然后：
  - `curl -s localhost:8800/` 返回含 `<title>交易日志</title>` 的 HTML。
  - `curl -s -o /dev/null -w '%{http_code}' localhost:8800/api/overview` 返回 `401`。
  - 不设 `JOURNAL_TOKEN` 启动 → 退出码非 0，并输出"未设置 JOURNAL_TOKEN"。
- [ ] **Step 3：浏览器验收（由 Claude 执行）**：
  1. 登录，新建"趋势中高二"。
  2. 开一笔多单，止损放错一侧时看到提示。
  3. 平仓看到 R。
  4. 编辑规则生成 v2，首页显示 v2 / 0 笔。
  5. 切换主题。
  6. 把窗口缩到 400px 宽，确认没有横向滚动。
- [ ] **Step 4：不提交**，交 Claude 审核。

---

### Task 6：部署文件与说明

**Files：**
- Create：`journal/README.md`、`journal/deploy/journal.service`、`journal/deploy/journal.env.example`
- Modify：根目录 `.gitignore`（追加 `journal/*.db*`、`journal/journal`、`.superpowers/`）

- [ ] **Step 1：写 `journal.service`**：
  - `User=journal`、`EnvironmentFile=/etc/journal/journal.env`、`ExecStart=/opt/journal/journal`、`WorkingDirectory=/var/lib/journal`、`Restart=on-failure`。
  - 加固项：`NoNewPrivileges=true`、`ProtectSystem=strict`、`ReadWritePaths=/var/lib/journal`。
- [ ] **Step 2：写 `journal.env.example`**：三个变量，`JOURNAL_DB=/var/lib/journal/journal.db`，口令一行注明用 `openssl rand -hex 24` 生成。
- [ ] **Step 3：写 README**（中文），覆盖设计第 10 节：
  - 本地构建和交叉编译 `GOOS=linux GOARCH=amd64 go build -o journal ./cmd/journal`。
  - 上传、建用户和目录、安装服务的命令。
  - Caddy 最小示例 `journal.example.com { reverse_proxy 127.0.0.1:8800 }` 和 Nginx 最小示例。
  - 备份方法：导出 JSON，或停服后连同 `-wal`、`-shm` 一起复制。
- [ ] **Step 4：检查** `git status --short` 只出现 `journal/`、`.gitignore` 和本计划相关文档的改动。
- [ ] **Step 5：不提交**，交 Claude 审核。
