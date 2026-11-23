# 首页交易时段指示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在“策略面板”顶部显示当前交易时段、流动性分级、北京时间、倒计时和全天时间条。

**Architecture:** `web/app.js` 增加一段不依赖 DOM 的纯函数 `marketSession(now)`，用标记注释包住，供 Node 脚本单独取出验证。`renderHome` 挂载指示卡，定时器只更新卡片内容，离开首页时清除。

**Tech Stack:** 原生 JS、CSS、`Intl.DateTimeFormat`，无构建步骤、无新依赖。

**Spec:** `docs/superpowers/specs/2026-11-23-session-indicator-design.md`

## Global Constraints

- 只改 `web/app.js`、`web/app.css`、`README.md`，不改后端和数据库。
- 时区固定使用 `Asia/Tokyo`、`Europe/London`、`America/New_York`，显示固定为 `Asia/Shanghai`。
- 分级文案只有：最佳、良好、一般、偏淡、回避、休市。文案只说流动性，不写买卖建议。
- 颜色只用现有主题变量。手机宽度不得横向溢出。
- 每 30 秒刷新，离开首页清除定时器。
- 用户未要求提交，本计划不执行 `git commit`。

## Review Focus

- 夏令时切换当天：边界必须按切换后的偏移计算，Task 1 用 2026-03-08 和 2026-11-01 覆盖。
- 美英切换不同步的几周：欧美重叠起止各自计算，Task 1 用 2026-03-16 和 2026-10-27 覆盖。
- 恰好落在边界的时刻：开始含、结束不含，Task 1 覆盖。
- 周五收盘到周日开盘：显示休市，倒计时指向周日开盘，Task 1 覆盖。
- 电脑休眠或标签页切回：回到页面立即刷新，Task 2 覆盖。

---

### Task 1: 时段计算

**Files:**
- Modify: `web/app.js`（插入到 `renderHome` 之前）
- Test: 会话临时目录下的 `session-check.js`，不进仓库

**Interfaces:**
- Produces: `marketSession(now: Date) -> { key, name, tier, tierName, end: Date, next: string, segments: Array<{ key, name, short, tier, start: Date, end: Date }> }`
- `key` 取值：`overlap`、`europe`、`asia_europe`、`us_late`、`asia`、`none`、`settle`、`closed`。
- `tier` 取值：`best`、`good`、`normal`、`light`、`avoid`、`closed`。

- [ ] **Step 1: 写验证脚本**

脚本读取 `web/app.js` 中 `// <market-session>` 与 `// </market-session>` 之间的代码，用 `new Function` 取出 `marketSession`，断言下列 `[UTC 时刻, key]`：

```js
[["2026-11-23T13:42:00Z","overlap"],["2026-11-23T09:00:00Z","europe"],["2026-11-23T08:30:00Z","asia_europe"],
 ["2026-11-23T18:00:00Z","us_late"],["2026-11-23T22:30:00Z","settle"],["2026-11-23T23:30:00Z","none"],["2026-11-24T01:00:00Z","asia"],
 ["2026-07-15T12:30:00Z","overlap"],["2026-07-15T11:30:00Z","europe"],["2026-07-15T07:30:00Z","asia_europe"],["2026-07-15T06:30:00Z","asia"],
 ["2026-07-15T21:30:00Z","settle"],["2026-07-15T22:30:00Z","none"],["2026-07-15T17:00:00Z","us_late"],
 ["2026-03-16T12:30:00Z","overlap"],["2026-10-27T12:30:00Z","overlap"],
 ["2026-11-23T13:00:00Z","overlap"],["2026-11-23T12:59:59Z","europe"],
 ["2026-11-27T21:59:00Z","us_late"],["2026-11-27T22:00:00Z","closed"],["2026-11-28T12:00:00Z","closed"],["2026-11-29T21:59:00Z","closed"],["2026-11-29T22:00:00Z","settle"],
 ["2026-03-08T20:59:00Z","closed"],["2026-03-08T21:00:00Z","settle"],["2026-11-01T21:30:00Z","closed"],["2026-11-01T22:00:00Z","settle"]]
```

另断言 `end`：`2026-03-16T12:30Z` 与 `2026-10-27T12:30Z` 的 `end` 都是当日 `17:00Z`，`2026-07-15T12:30Z` 的 `end` 是 `16:00Z`，`2026-11-28T12:00Z` 的 `end` 是 `2026-11-29T22:00Z`。

- [ ] **Step 2: 运行，确认失败**

Run: `node session-check.js`
Expected: 因找不到标记而失败。

- [ ] **Step 3: 实现 `marketSession`**

以纽约 17:00 为一个交易日的起点。取纽约当地日期 D，当地时间早于 17:00 时 D 减一天。D 为周五或周六时返回 `closed`，`end` 为下一个周日纽约 17:00。否则按顺序生成边界：

`纽约 D 17:00 → 纽约 D 18:00 → 东京 D+1 09:00 → 伦敦 D+1 08:00 → 东京 D+1 18:00 → 纽约 D+1 08:00 → 伦敦 D+1 17:00 → 纽约 D+1 17:00`

对应时段依次为 `settle, none, asia, asia_europe, europe, overlap, us_late`。当地时间转 UTC 用 `Intl.DateTimeFormat` 求该时区偏移，并复核一次以处理夏令时。休市时 `segments` 返回下一交易日的时段。

- [ ] **Step 4: 运行，确认通过**

Run: `node session-check.js`
Expected: 全部断言通过，退出码 0。

### Task 2: 首页指示卡

**Files:**
- Modify: `web/app.js`（`renderHome`、`route`）、`web/app.css`、`README.md`

**Interfaces:**
- Consumes: `marketSession(now)`
- Produces: `sessionCard() -> HTMLElement`、`stopSessionClock() -> void`

- [ ] **Step 1: 实现 `sessionCard`**

卡片显示状态点、时段名、分级、北京时间、`X 小时 Y 分后进入{next}`（休市时为 `后开盘`，分钟向上取整）和时间条。时间条按时长分配宽度，顺序为 `none, asia, asia_europe, europe, overlap, us_late, settle`，当前段高亮，长段显示短名。每 30 秒和 `visibilitychange` 回到可见时只更新卡片内部。

- [ ] **Step 2: 接入页面**

`renderHome` 把卡片放在 `$("view")` 第一项。`route` 开始时调用 `stopSessionClock()`。

- [ ] **Step 3: 补样式和 README**

分级颜色：`best` 用 `--pos`，`good` 用 `--accent`，`normal` 用 `--idle`，`light` 用 `--warn`，`avoid` 用 `--neg`，`closed` 用 `--faint`。README 功能说明加一句时段指示及其口径。

- [ ] **Step 4: 验证**

Run: `node --check web/app.js && node session-check.js && go test ./...`
Expected: 全部通过。再启动应用，在浅色、护眼、深色和 360px 宽度下检查卡片显示且无横向溢出。
