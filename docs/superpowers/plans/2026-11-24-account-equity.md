# 账户权益（校准点）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保存账户权益，平仓后自动增减，并可用“金额 + 原因”校准。

**Architecture:** 新表 `equity_calibrations` 只存校准点。当前权益在读取时计算：最新校准余额 + 其后平仓交易的盈亏，不落库。

**Tech Stack:** Go、SQLite（modernc）、原生 JS。

**Spec:** `docs/superpowers/specs/2026-11-24-account-equity-design.md`

## Global Constraints

- schema 与备份版本升到 3；备份版本 1、2 仍可导入。
- 原因取值：`initial`、`cash_flow`、`missed_trade`、`fee`、`other`；`initial` 只用于首次校准，且仅此时 `delta` 为空。
- 校准不得改变 R 值或策略统计。
- 错误消息用中文。
- 用户未要求提交，执行时不做 git commit。

## Review Focus

- 校准后修改或删除校准前的旧单：权益不变。
- 校准时仍有持仓：持仓平仓后才计入，弹窗提示填写不含浮动盈亏的钱包余额。
- 亏损使推算权益小于等于 0：开仓表单留空并提示，不带入非法默认值。
- 导入旧备份：校准记录被清空，权益回到未设置，开仓回退到最近一笔权益。
- 备份中的校准记录不合法：整体拒绝导入，原数据不变。

---

### Task 1: 存储层

**Files:**
- Create: `internal/store/equity.go`、`internal/store/equity_test.go`
- Modify: `internal/stats/trade.go`、`internal/store/store.go`、`internal/store/dump.go`、`internal/store/store_test.go`

**Interfaces:**
- Produces: `stats.PnL(ClosedTrade) float64`
- Produces: `type Calibration struct { ID int64; Balance float64; Delta *float64; Reason string; CreatedAt time.Time }`
- Produces: `type CalibrationInput struct { Balance float64; Reason string }`
- Produces: `(*Store).Calibrate(CalibrationInput) (Calibration, error)`、`(*Store).ListCalibrations() ([]Calibration, error)`（最新在前）、`(*Store).CurrentEquity() (float64, bool, error)`
- Produces: `store.ComputeEquity([]Calibration, []Trade) (float64, bool)`、`Dump.Calibrations`（JSON `equity_calibrations`）

- [x] **Step 1:** 写 `TestCalibrationFlow`、`TestCalibrateInvalid`、`TestImportCalibrations`，并把现有版本断言改为 3（非法版本改为 4）。
- [x] **Step 2:** 运行 `go test ./internal/store/`，预期编译失败。
- [x] **Step 3:** 实现上述接口、v2→v3 迁移和导入导出。
- [x] **Step 4:** 运行 `go test ./internal/store/ ./internal/stats/`，预期 PASS。

### Task 2: 接口

**Files:**
- Modify: `internal/api/api.go`、`internal/api/handlers.go`、`internal/api/views.go`、`internal/api/api_test.go`

**Interfaces:**
- Consumes: Task 1 的 `Calibrate`、`ListCalibrations`、`ComputeEquity`
- Produces: `overview.equity`（number 或 null）、`POST /api/equity/calibrations`（201）、`GET /api/equity/calibrations`（数组）

- [x] **Step 1:** 写 `TestEquityAPI`：未设置为 null，首次校准后为余额，平仓后增加盈亏，非法请求被拒绝。
- [x] **Step 2:** 运行 `go test ./internal/api/`，预期 FAIL。
- [x] **Step 3:** 实现路由、处理函数和 overview 字段。
- [x] **Step 4:** 运行 `go test ./...`，预期 PASS。

### Task 3: 界面与文档

**Files:**
- Modify: `web/app.js`、`web/app.css`、`README.md`

- [x] **Step 1:** 首页加权益卡片和校准弹窗（金额、原因、实时差额、最近 5 条）。
- [x] **Step 2:** 开仓默认值改为当前权益；未设置时回退 `last_equity`；小于等于 0 时留空并提示。
- [x] **Step 3:** 更新 README 口径说明。
- [x] **Step 4:** 运行 `node --check web/app.js` 和 `go test ./...`，再用临时数据库在浏览器走通：设置、开仓带入、平仓增减、校准。
