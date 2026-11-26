"use strict";

// 页面只创建 DOM 节点，接口文本不经过 HTML 解析。
const $ = id => document.getElementById(id);
function el(tag, cls = "", ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children.flat()) {
    if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function stored(key) {
  try { return localStorage.getItem(key) || ""; } catch (_) { return ""; }
}
function remember(key, value) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (_) { /* 禁用存储时仍可在本次页面中使用。 */ }
}
let token = stored("journal-token");
let overview = null;
let routeSequence = 0;
let returnFocus = null;
let fieldSequence = 0;

function parseNum(value) {
  const normalized = String(value).replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,\s]/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return NaN;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}
function numberOf(input, label, optional = false) {
  if (optional && input.value.trim() === "") return null;
  const value = parseNum(input.value);
  if (!Number.isFinite(value)) throw invalid(`${label}必须是有效数字`, input);
  return value;
}
// 带出错位置的错误：弹窗显示错误时会滚动到该字段并聚焦。
function invalid(message, node) {
  return Object.assign(new Error(message), { field: node });
}
// 四舍五入后为零的小数显示为 0，不显示 "-0" 或 "+0"。
function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  const text = n.toLocaleString("en-US", { maximumFractionDigits: digits });
  return text === "-0" ? "0" : text;
}
function rfmt(n) {
  if (!Number.isFinite(n)) return "—";
  const text = fmt(n);
  return `${n > 0 && text !== "0" ? "+" : ""}${text}R`;
}
const ddfmt = n => Number.isFinite(n) ? `${fmt(n)}R` : "—";
const tone = n => Number.isFinite(n) ? (n > 0 ? "pos" : n < 0 ? "neg" : "") : "";
const pct = n => Number.isFinite(n) ? `${fmt(n * 100, 1)}%` : "—";
const date = value => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
const num = (text, cls = "") => el("span", `num ${cls}`, text);
const rnum = n => num(rfmt(n), tone(n));
const empty = text => el("div", "empty sub", text);
// 开仓时判断的趋势阶段；旧交易没有记录，显示"未记录"。
const PHASES = [["early", "前期", "趋势刚启动"], ["mid", "中期", "趋势延续中"], ["late", "后期", "趋势末端"], ["unsure", "不确定", "看不清阶段"]];
const phaseName = p => (PHASES.find(([key]) => key === p) || [, "未记录"])[1];
const SETUPS = [["breakout", "突破前高", "趋势明确、回调小"], ["pullback", "回调高二·低二", "回调到主要高低点"]];
const setupName = k => (SETUPS.find(([key]) => key === k) || [, "—"])[1];
const EXIT_PLANS = [["trail", "移动止损", ""], ["measured_move", "measured move", "测量目标"], ["scale_out", "分仓", ""]];
const exitPlanName = k => (EXIT_PLANS.find(([key]) => key === k) || [, "—"])[1];
const keyLevelLabel = side => side === "short" ? "主要高点" : "主要低点";
// 违规项的中文名：方向不一致单独命名，其余取版本定义中的清单项和偏差。
function violationName(def, key) {
  if (key === "vegas_dir") return "与 1H Vegas 方向相反";
  // 规则项的原文是应做到的事，作为违规名时标明“未满足”，避免读成做了才违规。
  const item = def.items.find(i => i.key === key);
  if (item) return item.kind === "rule" ? `未满足「${item.label}」` : item.label;
  return (def.deviations.find(d => d.key === key) || { label: key }).label;
}
function violationTag(trade, def) {
  if (!trade.violations?.length) return trade.status === "closed" ? el("span", "tag t-pos", "按规则") : null;
  const tag = el("span", "tag t-neg", trade.status === "closed" ? "违规" : "违规开仓");
  tag.title = trade.violations.map(k => violationName(def, k)).join("；");
  tag.tabIndex = 0;
  tag.setAttribute("aria-label", `${tag.textContent}：${tag.title}`);
  return tag;
}
function notice(text, bad = false) {
  $("notice").textContent = text;
  $("notice").className = bad ? "note neg" : "note";
  $("notice").hidden = !text;
}
function showError(target, error) {
  if (error.status === 401) return;
  target.textContent = error.message || "操作失败，请稍后重试";
  target.hidden = false;
  const node = error.field;
  if (!node?.isConnected) return;
  // 提交期间控件被禁用，等恢复后再聚焦。
  requestAnimationFrame(() => {
    const details = node.closest("details");
    if (details) details.open = true;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = node.matches("input,select,textarea") ? node : node.querySelector("input:checked,input,select,textarea");
    focusable?.focus({ preventScroll: true });
  });
}
async function api(method, path, body) {
  const requestToken = token;
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${requestToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });
  } catch (_) { throw new Error("无法连接服务，请检查网络后重试"); }
  if (response.status === 401) {
    if (token === requestToken) {
      token = "";
      remember("journal-token", "");
      overview = null;
      routeSequence++;
      closeModal(true);
      showLogin();
      notice("口令无效或已失效，请重新登录。", true);
    }
    throw Object.assign(new Error("未授权"), { status: 401 });
  }
  if (response.status === 204) return null;
  let data;
  try { data = await response.json(); } catch (_) { throw new Error("服务返回了无法读取的数据"); }
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
function button(text, action, cls = "btn") {
  const b = el("button", cls, text);
  b.type = "button";
  if (action) b.addEventListener("click", action);
  return b;
}
function link(text, href, cls = "") {
  const a = el("a", cls, text);
  a.href = href;
  return a;
}
function field(label, value = "", kind = "text", full = false) {
  const input = el(kind === "textarea" ? "textarea" : "input", kind === "decimal" ? "num" : "");
  input.id = `field-${++fieldSequence}`;
  if (kind === "decimal") { input.type = "text"; input.inputMode = "decimal"; }
  else if (kind !== "textarea") input.type = kind;
  input.value = value ?? "";
  const lab = el("label", "", label);
  lab.htmlFor = input.id;
  return { input, node: el("div", `f${full ? " full" : ""}`, lab, input) };
}
function selectField(label, options, value, full = false) {
  const f = field(label, "", "text", full);
  const select = el("select");
  select.id = f.input.id;
  options.forEach(([key, text]) => { const o = el("option", "", text); o.value = key; select.append(o); });
  select.value = value;
  f.input.replaceWith(select);
  return { node: f.node, input: select };
}
// 单选分段控件；options 为 [值, 名称, 说明]。value() 返回选中的值，未选时为空字符串。
function segPicker(legend, options, value = "") {
  const box = el("fieldset", "f full phase-pick");
  const group = `seg-${++fieldSequence}`;
  box.append(el("legend", "", legend));
  const seg = el("div", "phase-seg");
  seg.style.setProperty("--cols", options.length);
  for (const [key, name, hint] of options) {
    const input = el("input");
    input.type = "radio"; input.name = group; input.value = key; input.checked = key === value;
    seg.append(el("label", "", input, el("b", "", name), hint ? el("small", "", hint) : null));
  }
  box.append(seg);
  return {
    node: box,
    value: () => box.querySelector("input:checked")?.value || "",
    set: v => box.querySelectorAll("input").forEach(i => { i.checked = i.value === v; })
  };
}
const phasePicker = () => segPicker("趋势阶段（必选，开仓后不可修改）", PHASES);
function checkbox(label, checked) {
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  return { input, node: el("label", "chk", input, label) };
}
function bindSubmit(form, target, action) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (form.dataset.busy === "true") return;
    target.hidden = true;
    form.dataset.busy = "true";
    const controls = [...form.querySelectorAll("button,input,select,textarea")].map(node => [node, node.disabled]);
    controls.forEach(([node]) => { node.disabled = true; });
    // 网络慢时让用户知道请求已发出。
    const submit = form.querySelector('button[type="submit"]'), label = submit?.textContent;
    if (submit) submit.textContent = "保存中…";
    try { await action(); } catch (error) { showError(target, error); }
    finally {
      form.dataset.busy = "false";
      controls.forEach(([node, disabled]) => { node.disabled = disabled; });
      if (submit) submit.textContent = label;
    }
  });
}
function closeModal(force = false) {
  if (!force && $("modal").querySelector('[data-busy="true"]')) return;
  $("modal").hidden = true;
  $("modal").replaceChildren();
  document.querySelector("main").inert = false;
  document.querySelector("header").inert = false;
  document.body.classList.remove("modal-open");
  if (returnFocus?.isConnected) returnFocus.focus();
}
function modal(title, submitText, action) {
  closeModal();
  returnFocus = document.activeElement;
  const form = el("form", "sheet");
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-modal", "true");
  form.setAttribute("aria-labelledby", "modal-title");
  const heading = el("h2", "", title);
  heading.id = "modal-title";
  const x = button("×", () => closeModal(), "x");
  x.setAttribute("aria-label", "关闭");
  const body = el("div", "sheet-b");
  const error = el("div", "err modal-error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  const footer = el("div", "sheet-f", button(action ? "取消" : "关闭", () => closeModal()));
  const submit = button(submitText || "关闭", null, "btn btn-primary");
  if (action) { submit.type = "submit"; footer.append(submit); bindSubmit(form, error, () => action(m)); }
  form.append(el("div", "sheet-h", heading, x), body, error, footer);
  $("modal").replaceChildren(form);
  $("modal").hidden = false;
  document.querySelector("main").inert = true;
  document.querySelector("header").inert = true;
  document.body.classList.add("modal-open");
  const m = { form, body, footer, error, submit };
  requestAnimationFrame(() => form.querySelector("input,select,textarea,button")?.focus());
  return m;
}
function section(title, content, action) {
  return el("section", "", el("div", "sec-h", el("h2", "", title), action), content);
}
function kpi(label, value, subtitle, cls = "") {
  return el("div", "panel kpi", el("small", "", label), el("b", `num ${cls}`, value), el("span", "", subtitle));
}
function warnings(stats) {
  return [stats.sides.warn && "收益可能来自单边行情", stats.top_removed.warn && "收益集中在少数几笔"].filter(Boolean);
}
function verdict(stats) {
  const labels = { kill: ["触发停用", "t-kill"], insufficient: ["样本不足", "t-idle"], edge: ["有优势", "t-pos"], promising: ["有苗头", "t-warn"], none: ["暂无优势", "t-neg"] };
  const [text, cls] = labels[stats.verdict] || labels.insufficient;
  const box = el("div", "verdict", el("span", `tag ${cls}`, text));
  if (stats.verdict === "insufficient") box.append(el("div", "sub", `还差 ${Math.max(0, overview.settings.min_sample - stats.summary.n)} 笔开始评估`));
  return box;
}
function flag(stats) {
  const reasons = warnings(stats);
  if (!reasons.length) return el("span");
  const f = el("span", "flag", "!");
  f.title = reasons.join("；");
  f.setAttribute("aria-label", f.title);
  f.tabIndex = 0;
  return f;
}
function interval(summary) {
  const bar = el("div", "ci", el("span", "zero"));
  const scale = n => Math.max(0, Math.min(100, (n + 1) * 50));
  if (summary.ci_ok) {
    const band = el("span", `band${summary.ci_low > 0 ? " ok" : summary.expectancy <= 0 ? " bad" : ""}`);
    band.style.left = `${scale(summary.ci_low)}%`;
    band.style.width = `${scale(summary.ci_high) - scale(summary.ci_low)}%`;
    const point = el("span", "pt");
    point.style.left = `${scale(summary.expectancy)}%`;
    bar.append(band, point);
  }
  return el("div", "interval", bar, el("div", "ci-lbl", el("span", "", "−1R"), el("span", "", "0"), el("span", "", "+1R")),
    el("div", "sub num", ...(summary.ci_ok ? ["95% 区间 ", rnum(summary.ci_low), " ～ ", rnum(summary.ci_high)] : ["暂无置信区间"])));
}
// <market-session>
// 各边界按所属市场的当地时间计算，夏令时和美英切换不同步的日子由时区规则自动处理。
const SESSION_TIERS = { best: "最佳", good: "良好", normal: "一般", light: "偏淡", avoid: "回避", closed: "休市" };
const SESSION_PHASES = [
  { key: "settle", name: "结算", short: "", tier: "avoid" },
  { key: "none", name: "无主要时段", short: "", tier: "light" },
  { key: "asia", name: "亚盘", short: "亚盘", tier: "light" },
  { key: "asia_europe", name: "亚欧重叠", short: "", tier: "good" },
  { key: "europe", name: "欧盘", short: "欧盘", tier: "good" },
  { key: "overlap", name: "欧美重叠", short: "重叠", tier: "best" },
  { key: "us_late", name: "美盘后段", short: "美盘", tier: "normal" },
];
const SESSION_ZONES = { ny: "America/New_York", ldn: "Europe/London", tyo: "Asia/Tokyo" };
const sessionFormats = {};
function zoneParts(when, zone) {
  sessionFormats[zone] ||= new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const parts = {};
  for (const { type, value } of sessionFormats[zone].formatToParts(when)) if (type !== "literal") parts[type] = Number(value);
  return parts;
}
// 把某时区的当地整点换算成 UTC；算两次，让偏移取目标时刻而不是估算时刻的值。
function zoneTime(dayMs, offsetDays, hour, zone) {
  const day = new Date(dayMs), wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + offsetDays, hour);
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = zoneParts(new Date(t), zone);
    t = wall - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t);
  }
  return new Date(t);
}
function sessionSegments(dayMs) {
  const { ny, ldn, tyo } = SESSION_ZONES;
  const bounds = [[0, 17, ny], [0, 18, ny], [1, 9, tyo], [1, 8, ldn], [1, 18, tyo], [1, 8, ny], [1, 17, ldn], [1, 17, ny]]
    .map(([offset, hour, zone]) => zoneTime(dayMs, offset, hour, zone));
  return SESSION_PHASES.map((phase, i) => ({ ...phase, start: bounds[i], end: bounds[i + 1] }));
}
// 交易日从纽约 17:00 开始；周五、周六开始的交易日休市。
function marketSession(now) {
  const p = zoneParts(now, SESSION_ZONES.ny);
  const dayMs = Date.UTC(p.year, p.month - 1, p.day - (p.hour < 17 ? 1 : 0));
  const weekday = new Date(dayMs).getUTCDay();
  if (weekday === 5 || weekday === 6) {
    const segments = sessionSegments(dayMs + (weekday === 5 ? 2 : 1) * 86400000);
    return { key: "closed", name: "休市", tier: "closed", tierName: SESSION_TIERS.closed, end: segments[0].start, next: "开盘", segments };
  }
  const segments = sessionSegments(dayMs);
  const index = segments.findIndex(s => now < s.end), current = segments[index];
  const next = segments[index + 1]?.name ?? (weekday === 4 ? "休市" : "结算");
  return { key: current.key, name: current.name, tier: current.tier, tierName: SESSION_TIERS[current.tier], end: current.end, next, segments };
}
// 分钟向上取整，避免临近切换时显示“0 分”。
function sessionCountdown(ms, next) {
  const total = Math.max(1, Math.ceil(ms / 60000)), hours = Math.floor(total / 60), minutes = total % 60;
  const span = [hours ? `${hours} 小时` : "", minutes ? `${minutes} 分` : ""].filter(Boolean).join(" ");
  return next === "开盘" ? `${span}后开盘` : `${span}后进入${next}`;
}
// </market-session>
const beijingClock = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
let sessionTimer = 0, sessionWake = null;
function stopSessionClock() {
  clearInterval(sessionTimer);
  if (sessionWake) document.removeEventListener("visibilitychange", sessionWake);
  sessionWake = null;
}
function sessionCard() {
  stopSessionClock();
  const card = el("div", "panel session");
  card.setAttribute("aria-label", "当前交易时段");
  const update = () => {
    const now = new Date(), s = marketSession(now);
    card.dataset.tier = s.tier;
    // 时间条把结算放在末尾，从亚洲早盘读到纽约收盘。
    const bar = el("div", "session-bar", [...s.segments.slice(1), s.segments[0]].map(seg => {
      const node = el("div", `session-seg${seg.key === s.key ? " on" : ""}`, el("span", "", seg.short));
      node.dataset.tier = seg.tier;
      node.style.flexGrow = (seg.end - seg.start) / 3600000;
      node.title = `${seg.name} · ${SESSION_TIERS[seg.tier]} · ${beijingClock.format(seg.start)}–${beijingClock.format(seg.end)}`;
      return node;
    }));
    card.replaceChildren(
      el("div", "session-head",
        el("div", "session-now", el("i"), el("b", "", s.name), el("span", "session-tier", s.tier === "closed" ? null : s.tier === "avoid" ? s.tierName : `流动性${s.tierName}`)),
        el("span", "sub num", `北京时间 ${beijingClock.format(now)}`)),
      el("div", "sub", sessionCountdown(s.end - now, s.next)),
      bar);
  };
  update();
  sessionTimer = setInterval(update, 30000);
  sessionWake = () => { if (!document.hidden) update(); };
  document.addEventListener("visibilitychange", sessionWake);
  return card;
}
const CALIBRATION_REASONS = [["cash_flow", "出入金"], ["missed_trade", "漏记交易"], ["fee", "手续费"], ["other", "其他"]];
const calibrationReason = r => r === "initial" ? "初始设置" : (CALIBRATION_REASONS.find(([key]) => key === r) || [, r])[1];
const money = n => Math.round(n * 100) / 100;
function signedU(n) {
  if (!Number.isFinite(n)) return "—";
  const text = fmt(n);
  return `${n > 0 && text !== "0" ? "+" : ""}${text} U`;
}
// 开仓默认权益：优先用推算值；从未设置时沿用最近一笔；推算值不为正时留空。
function openingEquity() {
  if (overview.equity == null) return overview.last_equity;
  return overview.equity > 0 ? money(overview.equity) : "";
}
function equityCard() {
  const e = overview.equity, isSet = e != null;
  return el("div", "panel equity",
    el("div", "", el("small", "", "账户权益"), el("b", `num ${isSet && e <= 0 ? "neg" : ""}`, isSet ? `${fmt(e)} U` : "未设置"),
      el("span", "", isSet ? "平仓后自动增减" : "设置后，开仓自动带入")),
    button(isSet ? "校准" : "设置账户权益", () => equityModal(), "btn btn-sm"));
}
function equityModal() {
  const current = overview.equity, first = current == null;
  const amount = field(first ? "当前账户余额（U）" : "实际余额（U）", !first && current > 0 ? money(current) : "", "decimal", true);
  const reason = first ? null : selectField("原因", [["", "请选择"], ...CALIBRATION_REASONS], "", true);
  const m = modal(first ? "设置账户权益" : "校准账户权益", "保存", async () => {
    const balance = numberOf(amount.input, "余额");
    if (balance <= 0) throw new Error("余额必须大于 0");
    if (!first && !reason.input.value) throw new Error("请选择原因");
    await api("POST", "/api/equity/calibrations", first ? { balance } : { balance, reason: reason.input.value });
    await saved(first ? "账户权益已设置。" : "账户权益已校准。");
  });
  m.body.append(amount.node);
  if (overview.open_trades.length > 0) m.body.append(el("div", "rulebox", "当前有持仓：请填不含浮动盈亏的钱包余额，持仓的盈亏会在平仓时计入。"));
  if (first) return;
  const diff = el("b", "num", "—");
  const update = () => {
    const n = parseNum(amount.input.value) - current;
    diff.textContent = signedU(n);
    diff.className = `num ${tone(Math.abs(n) < 0.005 ? 0 : n)}`;
  };
  amount.input.addEventListener("input", update);
  update();
  const log = el("div", "equity-log");
  m.body.append(reason.node, el("div", "calc calc-two", el("div", "", el("small", "", "推算权益"), el("b", "num", `${fmt(current)} U`)), el("div", "", el("small", "", "差额"), diff)), log);
  api("GET", "/api/equity/calibrations").then(list => {
    log.replaceChildren(el("small", "", "最近校准"), ...list.slice(0, 5).map(c => el("div", "equity-log-row",
      el("span", "sub", date(c.created_at)), el("span", "", calibrationReason(c.reason)),
      num(c.delta == null ? "—" : signedU(c.delta), tone(c.delta)), num(`${fmt(c.balance)} U`))));
  }).catch(error => { if (error.status !== 401) log.replaceChildren(el("div", "sub", "校准记录加载失败")); });
}
function edgeBlock(report, version, href) {
  const e = report.edge, s = e.summary;
  const head = el("div", "edge-head", el("div", "", el("div", "sname", overview.strategy.name, el("em", "", `v${version.no}`)), el("div", "sub", "只统计按规则执行的单子")), el("div", "c-t", verdict(e), flag(e)));
  const body = el("div", "kpis kpis-3",
    kpi("按规则单", `${s.n} 笔`, s.n ? `胜率 ${pct(s.win_rate)}` : "还没有样本"),
    kpi("每笔期望 E", rfmt(s.n ? s.expectancy : null), "按规则单", tone(s.n ? s.expectancy : 0)),
    kpi("累计", rfmt(s.total_r), `最大回撤 ${ddfmt(s.max_drawdown_r)}`, tone(s.total_r)));
  const panel = el("div", "panel edge", head, body, interval(s));
  if (href) panel.append(el("div", "actions", link("查看详情 ›", href, "btn btn-sm")));
  return panel;
}
function executionBlock(report) {
  const x = report.execution, all = report.all, edge = report.edge.summary;
  const loss = all.n && edge.n ? all.expectancy - edge.expectancy : null;
  const kpis = el("div", "kpis",
    kpi("按规则执行率", pct(x.followed_rate), `${x.followed_n} / ${x.closed_n} 笔`),
    kpi("最近违规", x.recent_n ? `${x.recent_violated} 笔` : "—", x.recent_n ? `最近 ${x.recent_n} 笔已平仓中` : "还没有已平仓", x.recent_violated ? "neg" : ""),
    kpi("违规单累计", rfmt(x.violated_n ? x.violated_r : null), `${x.violated_n} 笔`, tone(x.violated_n ? x.violated_r : 0)),
    kpi("执行损耗", rfmt(loss), "全部单 E − 按规则单 E", tone(loss)));
  const rows = el("div", "panel rows");
  rows.append(el("div", "row head cmp-row", ...["", "笔数", "期望 E", "累计"].map(v => el("div", "", v))));
  for (const [name, sum] of [["全部单（实际结果）", all], ["按规则单（策略本身）", edge]]) {
    rows.append(el("div", "row cmp-row", el("div", "sname", name), num(sum.n), rnum(sum.n ? sum.expectancy : null), rnum(sum.n ? sum.total_r : null)));
  }
  return el("div", "exec", kpis, rows);
}
function renderHome() {
  const o = overview;
  const open = el("div", "panel rows");
  open.append(el("div", "row head pos-row", ...["品种", "方向", "入场", "止损", "1R", ""].map(v => el("div", "", v))));
  if (!o.open_trades.length) open.append(empty("暂无持仓。"));
  for (const trade of o.open_trades) {
    open.append(el("div", "row pos-row",
      el("div", "", el("div", "sname num", trade.symbol, " ", violationTag(trade, o.definition)), el("div", "sub", `v${trade.version_no} · ${setupName(trade.setup)} · ${phaseName(trade.phase)}`), el("div", "sub", date(trade.opened_at))),
      el("div", "hide-m", el("span", `side ${trade.side}`, trade.side === "long" ? "多" : "空")),
      el("div", "num hide-m", fmt(trade.entry, 8)), el("div", "num hide-m", fmt(trade.stop, 8)),
      el("div", "num hide-m", `${fmt(trade.risk_amount)} U`),
      button("平仓", async () => tradeModal("close", trade, false, await definitionOf(trade)), "btn btn-sm")));
  }
  $("view").replaceChildren(
    sessionCard(),
    equityCard(),
    section("策略优势", edgeBlock(o.report, o.version, "#strategy"), el("span", "sub", `单笔风险 ${fmt(o.settings.risk_pct)}%`)),
    section("执行情况", executionBlock(o.report), el("span", "sub", "包含违规单")),
    section("持仓中", open));
}
// 交易所属版本的清单定义；当前版本直接用首页数据，旧版本向后端取。
async function definitionOf(trade) {
  if (trade.version_id === overview.version.id) return overview.definition;
  return (await api("GET", `/api/versions/${trade.version_id}/stats`)).definition;
}

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text != null) node.textContent = text;
  return node;
}
// 曲线占满整行：画布宽度等于实际显示宽度，窗口缩放后重画，刻度文字保持原始字号。
function curve(values) {
  const panel = el("div", "panel chart", el("div", "sec-h", el("h2", "", "累计 R"), el("span", "sub", "按平仓时间排序")));
  let drawn = 0;
  const draw = width => {
    const W = Math.round(Math.max(300, width));
    if (Math.abs(W - drawn) < 2) return;
    drawn = W;
    const svg = curveSvg(values, W);
    const old = panel.querySelector("svg");
    if (old) old.replaceWith(svg); else panel.append(svg);
  };
  draw(Math.min(1000, window.innerWidth - 80));
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(([entry]) => {
      if (!panel.isConnected) { observer.disconnect(); return; }
      draw(entry.contentRect.width);
    });
    observer.observe(panel);
  }
  return panel;
}
function curveSvg(values, W) {
  const right = W - 20;
  const svg = svgNode("svg", { viewBox: `0 0 ${W} 240`, role: "img", "aria-label": "按平仓时间排序的累计 R 曲线" });
  const points = values.length ? values : [0];
  let low = 0, high = 0;
  for (const value of points) { low = Math.min(low, value); high = Math.max(high, value); }
  if (low === high) { low = -1; high = 1; }
  const padding = (high - low) * 0.12;
  low -= padding; high += padding;
  const x = i => 54 + i / Math.max(1, points.length - 1) * (right - 54);
  const y = value => 18 + (high - value) / (high - low) * 186;
  for (const value of [low, 0, high]) {
    svg.append(svgNode("line", { x1: 54, x2: right, y1: y(value), y2: y(value), class: value === 0 ? "chart-zero" : "chart-grid" }));
    svg.append(svgNode("text", { x: 47, y: y(value) + 4, "text-anchor": "end", class: "chart-label" }, rfmt(value)));
  }
  for (const i of [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]) {
    svg.append(svgNode("text", { x: x(i), y: 228, "text-anchor": "middle", class: "chart-label" }, `${i} 笔`));
  }
  const path = points.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  svg.append(svgNode("path", { d: `${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, class: "chart-area" }));
  svg.append(svgNode("path", { d: path, class: "chart-line" }));
  const last = points.length - 1;
  svg.append(svgNode("circle", { cx: x(last), cy: y(points[last]), r: 4, class: "chart-end" }));
  svg.append(svgNode("text", { x: Math.max(100, x(last) - 8), y: Math.max(14, y(points[last]) - 10), "text-anchor": "end", class: `chart-label chart-last ${tone(points[last])}` }, rfmt(points[last])));
  return svg;
}
function checkCard(title, lines, message = "", warn = false) {
  return el("div", "panel check", el("h3", "", title), ...lines.map(([label, value]) => el("div", "line", el("span", "", label), value instanceof Node ? value : num(value))), message ? el("div", warn ? "warnbox" : "okbox", message) : null);
}
function killText(version) {
  return [version.kill_recent_n == null ? "最近 N 笔：未启用" : `最近 ${version.kill_recent_n} 笔平均 R < ${fmt(version.kill_recent_below)}`,
    version.kill_max_dd_r == null ? "最大回撤：未启用" : `最大回撤 > ${fmt(version.kill_max_dd_r)}R`];
}
function groupRows(title, groups, nameOf) {
  // 拆分后样本更小，不足最少笔数的分组整行变淡，只作参考。
  const rows = el("div", "panel rows");
  rows.append(el("div", "row head phase-row", ...[title, "笔数", "胜率", "期望 E", "累计", "平均浮盈 / 浮亏"].map(v => el("div", "", v))));
  for (const p of groups) {
    const thin = p.n < overview.settings.min_sample;
    rows.append(el("div", `row phase-row${thin ? " thin" : ""}`,
      el("div", "", el("div", "sname", nameOf(p.key)), el("div", "sub show-m", `${p.n} 笔 · 胜率 ${p.n ? pct(p.win_rate) : "—"}`)),
      el("div", "num hide-m", p.n), el("div", "num hide-m", p.n ? pct(p.win_rate) : "—"),
      rnum(p.n ? p.expectancy : null), el("div", "hide-m", rnum(p.n ? p.total_r : null)),
      el("div", "num sub hide-m", ...(p.quality_n ? [rnum(p.avg_mfe), " / ", rnum(-p.avg_mae), ` · ${p.quality_n} 笔`] : ["—"]))));
  }
  return rows;
}
function guideGrid(def) {
  return el("div", "guide", ...def.guide.map((g, i) => el("div", `guide-card${g.tone === "warn" ? " warn" : ""}`,
    el("div", "guide-h", el("span", "guide-n", g.tone === "warn" ? "!" : String(i + 1 - def.guide.slice(0, i).filter(x => x.tone === "warn").length)), el("b", "", g.title)),
    el("ul", "", ...g.points.map(p => el("li", "", p))))));
}
function guideBlock(def, v) {
  return el("div", "panel guide-panel", guideGrid(def),
    el("div", "guide-foot sub", `${killText(v).join(" · ")} · 创建于 ${date(v.created_at)}`),
    el("details", "raw", el("summary", "", "规则原文"), el("pre", "", v.rules)));
}
function checklistPanel(def) {
  const cards = sectionsOf(def.items).map(g => el("div", "ck-card",
    el("div", "ck-card-h", el("b", "", g.name), g.setup ? el("span", "tag t-idle", setupName(g.setup)) : null),
    ...g.items.map(it => el("div", `ck-row${it.kind === "attention" ? " ck-attn" : ""}`, el("span", `ck-dot ${it.kind}`), el("span", "ck-text", it.label), it.kind === "attention" ? el("span", "tag t-warn", "注意") : null))));
  cards.push(el("div", "ck-card dev", el("div", "ck-card-h", el("b", "", "平仓偏差"), el("span", "tag t-neg", "发生即违规")),
    ...def.deviations.map(d => el("div", "ck-row", el("span", "ck-dot dev"), el("span", "ck-text", d.label)))));
  return el("div", "panel ck-panel", el("div", "ck-legend sub", el("span", "", el("span", "ck-dot rule"), "规则项：没满足记为违规开仓"), el("span", "", el("span", "ck-dot attention"), "注意项：只记录，不算违规")), el("div", "ck-grid", ...cards));
}
function renderDetail(strategy, detail) {
  const v = detail.version, def = detail.definition, report = detail.report, stats = report.edge, s = stats.summary;
  const current = strategy.versions[strategy.versions.length - 1].version;
  const readonly = v.id !== current.id;
  const versions = el("div", "vpick");
  [...strategy.versions].reverse().forEach(({ version }) => {
    const b = button(`v${version.no}${version.id === current.id ? " · 当前" : " · 只读"}`, () => { location.hash = version.id === current.id ? "strategy" : `strategy-v${version.no}`; }, version.id === v.id ? "on" : "");
    b.setAttribute("aria-pressed", String(version.id === v.id));
    versions.append(b);
  });
  const cards = el("div", "panel stats");
  // 带符号的 R 值：正数绿色、负数红色、零不着色。
  const signed = n => [rfmt(n), tone(n)];
  [["按规则单", `${s.n} 笔`], ["每笔期望 E", ...signed(s.n ? s.expectancy : null)], ["胜率", s.n ? pct(s.win_rate) : "—"], ["累计", ...signed(s.total_r)],
    ["平均盈利", ...signed(s.n && s.win_rate > 0 ? s.avg_win : null)], ["平均亏损", ...signed(s.n && s.win_rate < 1 ? s.avg_loss : null)], ["最大回撤", ddfmt(s.max_drawdown_r)], ["最长连亏", `${s.max_loss_streak} 笔`],
    ["R 标准差", fmt(s.std_dev)], ["95% 区间下限", ...signed(s.ci_ok ? s.ci_low : null)], ["95% 区间上限", ...signed(s.ci_ok ? s.ci_high : null)], ["版本", `v${v.no}`]]
    .forEach(([label, value, cls]) => cards.append(el("div", "stat", el("small", "", label), el("b", `num ${cls || ""}`, value))));
  const checks = el("div", "checks",
    checkCard("多空分开", [[`做多 ${stats.sides.long_n} 笔`, rnum(stats.sides.long_n ? stats.sides.long_e : null)], [`做空 ${stats.sides.short_n} 笔`, rnum(stats.sides.short_n ? stats.sides.short_e : null)]], stats.sides.warn ? "收益可能来自单边行情" : "两边各至少 10 笔时检查单边收益。", stats.sides.warn),
    checkCard("去掉最好的 5 笔", [["原期望", rnum(s.n ? s.expectancy : null)], [`剩余 ${Math.max(0, s.n - 5)} 笔`, rnum(stats.top_removed.computed ? stats.top_removed.e : null)]], !stats.top_removed.computed ? "超过 5 笔后计算。" : stats.top_removed.warn ? "收益集中在少数几笔" : "未触发收益集中警示。", stats.top_removed.warn),
    checkCard("入场 / 出场质量", [["平均最大浮盈", rnum(stats.quality.n ? stats.quality.avg_mfe : null)], ["平均最大浮亏", rnum(stats.quality.n ? -stats.quality.avg_mae : null)], ["平均利润回吐", rnum(stats.quality.n ? -stats.quality.avg_giveback : null)]], `${stats.quality.n} / ${s.n} 笔填写了最高、最低价。`),
    checkCard("停用条件", [["最近均值", rnum(stats.kill.recent_evaluated ? stats.kill.recent_mean : null)], ["最近 N 笔", v.kill_recent_n == null ? "未启用" : !stats.kill.recent_evaluated ? `不足 ${v.kill_recent_n} 笔，未判定` : stats.kill.recent_triggered ? "已触发" : "未触发"], ["最大回撤", ddfmt(s.max_drawdown_r)], ["回撤条件", v.kill_max_dd_r == null ? "未启用" : !stats.kill.dd_evaluated ? "未判定" : stats.kill.dd_triggered ? "已触发" : "未触发"]], killText(v).join("；"), stats.kill.triggered));
  const attention = el("div", "panel rows");
  attention.append(el("div", "row head cmp-row", ...["注意项", "勾了", "没勾", ""].map(t => el("div", "", t))));
  for (const a of report.attention) {
    const cell = g => el("div", "num", `${g.n} 笔 · `, rnum(g.n ? g.expectancy : null));
    attention.append(el("div", `row cmp-row${a.checked.n < overview.settings.min_sample || a.unchecked.n < overview.settings.min_sample ? " thin" : ""}`, el("div", "sub", violationName(def, a.key)), cell(a.checked), cell(a.unchecked), el("div")));
  }
  const violations = el("div", "panel rows");
  violations.append(el("div", "row head viol-row", ...["违规项", "次数", "累计"].map(t => el("div", "", t))));
  if (!report.violations.length) violations.append(empty("还没有违规记录。"));
  for (const x of report.violations) violations.append(el("div", "row viol-row", el("div", "", violationName(def, x.key)), num(`${x.n} 次`), rnum(x.total_r)));
  const history = el("div", "panel rows");
  [...strategy.versions].reverse().forEach(({ version, edge_summary: e, execution }) => {
    const row = link("", version.id === current.id ? "#strategy" : `#strategy-v${version.no}`, "row link history-row");
    row.append(el("b", "num", `v${version.no}`), el("div", "sub", date(version.created_at)), num(`${e.n} / ${execution.closed_n} 笔`), rnum(e.n ? e.expectancy : null), el("div", "sub preserve", version.rules));
    history.append(row);
  });
  const trades = el("div", "panel rows");
  if (!detail.trades.length) trades.append(empty("这个版本还没有交易。"));
  for (const trade of detail.trades) {
    const row = button("", () => tradeModal("edit", trade, readonly, def), "row link trade-row trade-button");
    row.append(el("div", "", el("div", "sname num", trade.symbol), el("div", "sub", date(trade.opened_at), " · ", el("span", "nowrap", `${setupName(trade.setup)} · ${phaseName(trade.phase)}`))),
      el("div", "hide-m", el("span", `side ${trade.side}`, trade.side === "long" ? "多" : "空")),
      el("div", "num hide-m", fmt(trade.entry, 8)), el("div", "num hide-m", fmt(trade.exit, 8)),
      el("div", "", trade.status === "open" ? el("span", "tag t-idle", "持仓中") : rnum(trade.r)),
      el("div", "sub hide-m", { stop: "止损", target: "止盈", manual: "主动离场" }[trade.exit_reason] || "—"),
      el("div", "hide-m", violationTag(trade, def) || "—"), el("span", "faint hide-m", "›"));
    trades.append(row);
  }
  const thinNote = el("span", "sub", `按规则单 · 不足 ${overview.settings.min_sample} 笔的分组变淡，仅供参考`);
  $("view").replaceChildren(link("‹ 首页", "#home", "back"), el("div", "d-head", el("div", "", el("h1", "", strategy.strategy.name, num(`v${v.no}`), verdict(stats)), el("div", "sub", readonly ? "历史版本只读 · 单独统计" : "当前版本 · 优势只统计按规则执行的单子"))), versions,
    cards, curve(s.curve), section("规则", guideBlock(def, v), el("span", "sub", "按主题整理 · 原文可展开")), section("开仓清单", checklistPanel(def)), section("执行情况", executionBlock(report), el("span", "sub", "包含违规单")),
    section("按违规项", violations, el("span", "sub", "全部已平仓 · 按代价排序")),
    section("按 Setup", groupRows("Setup", report.setups, setupName), thinNote),
    section("按趋势阶段", groupRows("阶段", report.phases, phaseName), thinNote.cloneNode(true)),
    section("注意项对照", attention, el("span", "sub", "按规则单 · 每格为笔数与期望 E")),
    section("附加检验", checks, el("span", "sub", "按规则单")), section("版本历史", history, el("span", "sub", "按规则单 / 全部已平仓")),
    section(`v${v.no} 交易`, trades, el("span", "sub", readonly ? "点击查看 · 历史版本只读" : "点击修改或删除")));
}

// 服务器确认保存后立即关闭弹窗，数据在后台刷新，不再多等一个来回。
function saved(message) {
  closeModal(true);
  notice(message);
  void route({ quiet: true });
}
// 按 section 把相邻条目分组；同组条目都属于同一 Setup 时记下该 Setup。
function sectionsOf(items) {
  const groups = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === it.section) last.items.push(it);
    else groups.push({ name: it.section, items: [it] });
  }
  for (const g of groups) g.setup = g.items.every(it => it.setup && it.setup === g.items[0].setup) ? g.items[0].setup : "";
  return groups;
}
// 开仓清单：Vegas 方向、Setup、按环节分组的条目、出场计划，各部分分别放进弹窗的不同步骤。
function checklistForm(def, side) {
  const vegas = segPicker("1H Vegas 方向", [["long", "多", "Vegas 向上"], ["short", "空", "Vegas 向下"]], side());
  let vegasTouched = false;
  vegas.node.addEventListener("change", () => { vegasTouched = true; });
  const setup = segPicker("Setup（必选）", SETUPS);
  const plan = segPicker("选一种（必选）", EXIT_PLANS);
  const boxes = {};
  const groups = sectionsOf(def.items).map(g => {
    const node = el("div", "ck-card", el("div", "ck-card-h", el("b", "", g.name), g.setup ? el("span", "tag t-idle", setupName(g.setup)) : null));
    for (const it of g.items) {
      const box = checkbox("", false);
      box.node.className = `chk ck-item${it.kind === "attention" ? " ck-attn" : ""}`;
      box.node.append(el("span", "ck-text", it.label));
      if (it.kind === "attention") box.node.append(el("span", "tag t-warn", "注意"));
      boxes[it.key] = { ...box, item: it };
      node.append(box.node);
    }
    return { ...g, node };
  });
  const hint = el("div", "sub ck-hint", "先在上一步选择 Setup，这里会显示对应条目。");
  const itemsNode = el("div", "ck-grid", ...groups.map(g => g.node));
  const applies = it => !it.setup || it.setup === setup.value();
  const shown = () => Object.values(boxes).filter(b => applies(b.item) && b.item.kind === "rule");
  function refresh() {
    if (!vegasTouched) vegas.set(side());
    hint.hidden = Boolean(setup.value());
    for (const g of groups) {
      let visible = 0;
      for (const it of g.items) { const on = applies(it); boxes[it.key].node.hidden = !on; visible += on; }
      g.node.hidden = !visible;
    }
    for (const b of Object.values(boxes)) b.node.classList.toggle("on", b.input.checked);
  }
  return {
    vegasNode: vegas.node, setupNode: setup.node, planNode: plan.node, itemsNode: el("div", "ck", hint, itemsNode),
    plan, refresh,
    setup: () => setup.value(),
    // 只提交当前 Setup 适用的条目，切换 Setup 后残留的勾选不会被发送。
    value: () => ({ vegas_dir: vegas.value(), checks: Object.fromEntries(Object.values(boxes).filter(b => applies(b.item)).map(b => [b.item.key, b.input.checked])) }),
    progress: () => { const list = shown(); return [list.filter(b => b.input.checked).length, list.length]; },
    unmet: () => [...(vegas.value() && vegas.value() !== side() ? ["与 1H Vegas 方向相反"] : []), ...shown().filter(b => !b.input.checked).map(b => b.item.label)]
  };
}
function step(n, title, ...children) {
  return el("section", "step", el("div", "step-h", el("span", "step-n", n), el("h3", "", title)), el("div", "step-b", ...children));
}
// 开仓时记录的清单，只读展示。
function checklistSummary(trade, def) {
  const box = el("div", "rulebox ck-summary");
  box.append(el("div", "", `${setupName(trade.setup)} · ${phaseName(trade.phase)} · ${keyLevelLabel(trade.side)} `, num(fmt(trade.key_level, 8)), ` · 出场 ${exitPlanName(trade.exit_plan)}`, trade.target != null ? el("span", "", " · 目标 ", num(fmt(trade.target, 8))) : null),
    el("div", "", `1H Vegas：${trade.checklist.vegas_dir === "long" ? "多" : "空"}`));
  for (const it of def.items) {
    if (!(it.key in trade.checklist.checks)) continue;
    const ok = trade.checklist.checks[it.key];
    box.append(el("div", it.kind === "rule" && !ok ? "neg" : "", ok ? "✓ " : "✗ ", it.label, it.kind === "attention" ? "（注意项）" : ""));
  }
  box.append(el("div", "sub", "开仓时记录，不可修改"));
  return box;
}
function tradeModal(mode, trade = {}, readonly = false, def = overview.definition) {
  const opening = mode === "open", closing = mode === "close";
  const hasClose = closing || trade.status === "closed";
  let deleting = false;
  const f = {};
  const openTitle = opening ? "记一笔 · 开仓" : `${closing ? "平仓" : "编辑交易"} · ${trade.symbol}`;
  const m = modal(readonly ? `查看交易 · ${trade.symbol} · 只读` : openTitle, closing ? "确认平仓" : opening ? "保存" : "保存修改", readonly ? null : async () => {
    if (deleting) {
      deleting = false;
      await api("DELETE", `/api/trades/${trade.id}`);
      await saved("交易已删除。");
      return;
    }
    const body = {};
    if (!closing) {
      body.symbol = f.symbol.input.value.trim();
      body.side = f.side.input.value;
      body.entry_reason = f.entry_reason.input.value.trim();
      if (!body.symbol) throw invalid("品种不能为空", f.symbol.input);
      for (const key of ["entry", "stop", "equity", "risk_pct"]) body[key] = numberOf(f[key].input, f[key].label);
      body.qty = opening && !f.qty.input.value.trim() ? suggested() : numberOf(f.qty.input, "实际数量");
      if (![body.entry, body.stop, body.equity, body.risk_pct, body.qty].every(n => Number.isFinite(n) && n > 0)) throw invalid("价格、权益、风险比例和数量必须大于 0", ["entry", "stop", "equity", "risk_pct", "qty"].map(k => f[k].input).find(i => i.value.trim() && !(parseNum(i.value) > 0)) || f.entry.input);
      if (body.side === "long" ? body.stop >= body.entry : body.stop <= body.entry) throw invalid("止损必须在入场价的亏损一侧", f.stop.input);
      if (opening) {
        body.key_level = numberOf(f.key_level.input, keyLevelLabel(body.side));
        if (!(body.key_level > 0)) throw invalid(`${keyLevelLabel(body.side)}必须大于 0`, f.key_level.input);
        body.phase = f.phase.value();
        if (!body.phase) throw invalid("请选择开仓时的趋势阶段", f.phase.node);
        body.setup = f.checklist.setup();
        if (!body.setup) throw invalid("请选择 Setup", f.checklist.setupNode);
        body.exit_plan = f.checklist.plan.value();
        if (!body.exit_plan) throw invalid("请选择出场计划", f.checklist.planNode);
        if (!f.checklist.value().vegas_dir) throw invalid("请选择 1H Vegas 方向", f.checklist.vegasNode);
        body.checklist = f.checklist.value();
        if (body.exit_plan === "measured_move") body.target = numberOf(f.target.input, "目标价", true);
      }
    }
    if (hasClose) {
      body.exit = numberOf(f.exit.input, "出场价");
      body.exit_reason = f.exit_reason.input.value;
      body.deviations = deviations().filter(k => f.dev[k].input.checked);
      body.review_note = f.review_note.input.value;
      if (!closing) body.clear = [];
      for (const key of ["high", "low", "funding"]) {
        const value = numberOf(f[key].input, f[key].label, true);
        if (value == null && !closing) body.clear.push(key);
        else body[key] = value;
      }
      if (!closing && !body.review_note.trim()) { body.clear.push("review_note"); delete body.review_note; }
      // 持仓期间的最高、最低价必须包住入场价和出场价，否则最大浮盈 / 浮亏会算错。
      const entryPrice = closing ? trade.entry : body.entry;
      if (body.high != null && body.high < Math.max(entryPrice, body.exit)) throw invalid("最高价不应低于入场价和出场价，请检查是否填反或填错", f.high.input);
      if (body.low != null && body.low > Math.min(entryPrice, body.exit)) throw invalid("最低价不应高于入场价和出场价，请检查是否填反或填错", f.low.input);
    }
    await api(opening || closing ? "POST" : "PATCH", opening ? "/api/trades" : `/api/trades/${trade.id}${closing ? "/close" : ""}`, body);
    await saved(opening ? "开仓已记录。" : closing ? "已平仓，统计已更新。" : "交易已更新。");
  });
  const deviations = () => def.deviations.map(d => d.key);
  const addField = (key, label, value, kind = "decimal", full = false) => {
    f[key] = { ...field(label, value, kind, full), label };
    return f[key].node;
  };
  const grid = el("div", "fgrid");
  if (opening) {
    m.form.classList.add("sheet-wide");
    m.body.append(el("details", "rule-peek", el("summary", "", `${overview.strategy.name} · v${overview.version.no} · 下单前再看一遍规则`), guideGrid(def)));
  } else {
    m.body.append(el("div", "sub num", `开仓 ${date(trade.opened_at)}${trade.closed_at ? ` · 平仓 ${date(trade.closed_at)}` : ""}`));
    if (!closing) m.body.append(checklistSummary(trade, def));
  }
  const calc = el("div", "calc");
  const riskValue = el("b", "num", "—"), qtyValue = el("b", "num", "—"), nominalValue = el("b", "num", "—");
  const stopError = el("div", "err");
  stopError.hidden = true;
  const status = el("div", "sheet-status");
  if (!closing) {
    f.side = selectField("方向", [["long", "做多"], ["short", "做空"]], trade.side || "long");
    grid.append(f.side.node, addField("symbol", "品种", trade.symbol, "text"),
      addField("entry", "入场价", trade.entry), addField("stop", "止损价", trade.stop));
    if (opening) grid.append(addField("key_level", keyLevelLabel("long"), ""));
    grid.append(addField("equity", "账户权益（U）", opening ? openingEquity() : trade.equity),
      addField("risk_pct", "单笔风险（%）", opening ? overview.settings.risk_pct : trade.risk_pct),
      addField("qty", opening ? "实际数量（留空用建议值）" : "实际数量", trade.qty));
    calc.append(...[["1R（实际数量）", riskValue], ["建议数量", qtyValue], ["名义价值", nominalValue]].map(([label, value]) => el("div", "", el("small", "", label), value)));
    const equityWarn = opening && overview.equity != null && overview.equity <= 0 ? el("div", "err", "推算权益已不大于 0，请先校准，或在这里手动填写。") : null;
    const note = addField("entry_reason", "备注（选填）", trade.entry_reason, "textarea", true);
    if (opening) {
      f.phase = phasePicker();
      f.checklist = checklistForm(def, () => f.side.input.value);
      f.targetNode = addField("target", "目标价（选填）", "");
      m.body.append(
        step(1, "交易与仓位", grid, equityWarn, calc),
        step(2, "背景与 Setup", f.checklist.vegasNode, f.phase.node, f.checklist.setupNode),
        step(3, "开仓清单", f.checklist.itemsNode),
        step(4, "出场计划", f.checklist.planNode, f.targetNode),
        step(5, "备注", note));
      m.footer.prepend(status);
    } else m.body.append(grid, calc, stopError, note);
  } else {
    m.body.append(el("div", "rulebox num", `${trade.side === "long" ? "做多" : "做空"} · ${setupName(trade.setup)} · ${phaseName(trade.phase)} · 入场 ${fmt(trade.entry, 8)} · 止损 ${fmt(trade.stop, 8)} · 数量 ${fmt(trade.qty, 8)} · 1R ${fmt(trade.qty * Math.abs(trade.entry - trade.stop))} U`));
    if (trade.violations?.length) m.body.append(el("div", "warnbox", "开仓违规：", trade.violations.map(k => violationName(def, k)).join("；")));
  }
  const preview = el("div", "bigR num", "—");
  const verdictPreview = el("div", "sub");
  if (hasClose) {
    const closeGrid = el("div", "fgrid", addField("exit", "出场价", trade.exit), el("div", "f", el("label", "", "这笔的 R"), preview));
    f.exit_reason = selectField("出场原因", [["stop", "止损"], ["target", "止盈"], ["manual", "主动离场"]], trade.exit_reason || "manual", true);
    closeGrid.append(f.exit_reason.node);
    f.dev = {};
    const devBox = el("fieldset", "f full ck", el("legend", "", "执行偏差（实际发生的才勾，勾上即记为违规）"));
    for (const d of def.deviations) {
      f.dev[d.key] = checkbox(d.label, (trade.deviations || []).includes(d.key));
      f.dev[d.key].node.classList.add("ck-item");
      devBox.append(f.dev[d.key].node);
    }
    m.body.append(closeGrid, devBox, verdictPreview, addField("review_note", "复盘（选填）", trade.review_note, "textarea"));
    const more = el("details", "more", el("summary", "", "更多（选填）：持仓期间最高 / 最低价、资金费"),
      el("div", "fgrid", addField("high", "最高价", trade.high), addField("low", "最低价", trade.low), addField("funding", "资金费（U，付出为正、收到为负）", trade.funding, "decimal", true)));
    if (readonly) more.open = true;
    m.body.append(more);
  }
  function suggested() {
    const entry = parseNum(f.entry.input.value), stop = parseNum(f.stop.input.value);
    return parseNum(f.equity.input.value) * parseNum(f.risk_pct.input.value) / 100 / Math.abs(entry - stop);
  }
  function calculate() {
    let entry = trade.entry, stop = trade.stop, qty = trade.qty, side = trade.side;
    if (!closing) {
      entry = parseNum(f.entry.input.value); stop = parseNum(f.stop.input.value); side = f.side.input.value;
      const suggestion = suggested();
      qty = opening && !f.qty.input.value.trim() ? suggestion : parseNum(f.qty.input.value);
      const wrongSide = entry > 0 && stop > 0 && (side === "long" ? stop >= entry : stop <= entry);
      // 开仓弹窗把这条提示放在固定底栏，避免插入表单导致下方内容跳动。
      stopError.hidden = opening || !wrongSide;
      stopError.textContent = "止损必须在入场价的亏损一侧。";
      f.stop.input.setAttribute("aria-invalid", String(wrongSide));
      m.submit.disabled = wrongSide;
      const valid = !wrongSide && entry > 0 && stop > 0 && suggestion > 0 && Number.isFinite(suggestion);
      riskValue.textContent = valid && qty > 0 ? `${fmt(qty * Math.abs(entry - stop))} U` : "—";
      qtyValue.textContent = valid ? fmt(suggestion, 8) : "—";
      nominalValue.textContent = valid && qty > 0 ? `${fmt(qty * entry)} U` : "—";
      if (opening) {
        f.qty.input.placeholder = valid ? fmt(suggestion, 8) : "自动计算";
        f.key_level.node.querySelector("label").textContent = `${keyLevelLabel(side)}（必填，供复盘）`;
        f.checklist.refresh();
        f.targetNode.hidden = f.checklist.plan.value() !== "measured_move";
        // 违规也能保存，底栏和按钮文字提醒这笔会记为违规开仓。
        const missing = f.checklist.setup() ? f.checklist.unmet() : [];
        const [done, total] = f.checklist.progress();
        status.className = `sheet-status ${wrongSide ? "err-text" : !f.checklist.setup() ? "" : missing.length ? "bad" : "good"}`;
        status.replaceChildren(wrongSide ? el("span", "", "止损必须在入场价的亏损一侧")
          : !f.checklist.setup() ? el("span", "", "选择 Setup 后开始勾选清单")
          : missing.length ? el("span", "", el("b", "", `规则 ${done}/${total}`), ` · 未满足：${missing.join("；")}`)
          : el("span", "", el("b", "", `规则 ${done}/${total}`), " · 全部满足"));
        status.title = missing.join("；");
        if (m.form.dataset.busy !== "true") m.submit.textContent = missing.length ? "记为违规开仓" : "保存";
      }
    }
    if (hasClose) {
      const exit = parseNum(f.exit.input.value), funding = f.funding.input.value.trim() ? parseNum(f.funding.input.value) : 0;
      const valid = entry > 0 && stop > 0 && qty > 0 && exit > 0 && (side === "long" ? stop < entry : stop > entry);
      const r = valid ? ((side === "long" ? 1 : -1) * (exit - entry) * qty - funding) / (qty * Math.abs(entry - stop)) : NaN;
      preview.textContent = rfmt(r);
      preview.className = `bigR num ${tone(r)}`;
      // 开仓违规只看开仓清单；改单时后端会按新的方向重新判断。
      const openViolations = (trade.violations || []).filter(k => !deviations().includes(k));
      const devs = deviations().filter(k => f.dev[k].input.checked);
      verdictPreview.textContent = openViolations.length || devs.length ? "这笔将记为：违规" : "这笔将记为：按规则执行";
      verdictPreview.className = openViolations.length || devs.length ? "sub neg" : "sub pos";
    }
  }
  m.form.addEventListener("input", calculate);
  m.form.addEventListener("change", calculate);
  calculate();
  if (readonly) {
    m.body.querySelectorAll("input,select,textarea").forEach(node => { node.disabled = true; });
  } else if (!opening && !closing) {
    const confirmation = el("div", "delete-confirm");
    confirmation.hidden = true;
    const deleteButton = button("删除这笔交易", () => { confirmation.hidden = false; deleteButton.hidden = true; }, "btn btn-danger");
    confirmation.append(el("p", "err", "删除后无法撤销。确定删除这笔交易？"), el("div", "actions",
      button("保留", () => { confirmation.hidden = true; deleteButton.hidden = false; }),
      button("确认删除", () => { deleting = true; m.form.requestSubmit(); }, "btn btn-danger")));
    m.body.append(deleteButton, confirmation);
  }
}

// 月份按浏览器本地时区划分，起止时刻交给后端筛选平仓时间。
function monthOf(hash) {
  const now = new Date(), match = /^#monthly-(\d{4})-(\d{2})$/.exec(hash);
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  const picked = match && parseNum(match[2]) >= 1 && parseNum(match[2]) <= 12 ? new Date(parseNum(match[1]), parseNum(match[2]) - 1, 1) : current;
  return { start: picked > current ? current : picked, current };
}
const monthHash = d => `#monthly-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function renderMonthly(m, start, current) {
  const shift = n => new Date(start.getFullYear(), start.getMonth() + n, 1);
  const isCurrent = start.getTime() === current.getTime();
  const next = button("下月 ›", () => { location.hash = monthHash(shift(1)); });
  next.disabled = isCurrent;
  const actions = el("div", "actions", button("‹ 上月", () => { location.hash = monthHash(shift(-1)); }), next);
  if (!isCurrent) actions.append(button("回到本月", () => { location.hash = "#monthly"; }));
  const has = m.n > 0, followedN = m.n - m.violated_n;
  const cards = el("div", "panel stats");
  [["已平仓", `${m.n} 笔`], ["累计", rfmt(has ? m.total_r : null), has && tone(m.total_r)], ["每笔期望 E", rfmt(has ? m.expectancy : null), has && tone(m.expectancy)], ["胜率", has ? pct(m.win_rate) : "—"],
    ["平均盈利", rfmt(has && m.win_rate > 0 ? m.avg_win : null), has && m.win_rate > 0 && tone(m.avg_win)], ["平均亏损", rfmt(has && m.win_rate < 1 ? m.avg_loss : null), has && m.win_rate < 1 && tone(m.avg_loss)], ["最大回撤", has ? ddfmt(m.max_drawdown_r) : "—"], ["最长连亏", has ? `${m.max_loss_streak} 笔` : "—"],
    ["按规则执行率", has ? pct(m.followed_rate) : "—"], ["按规则累计", rfmt(followedN ? m.total_r - m.violated_r : null), followedN && tone(m.total_r - m.violated_r)], ["违规单", has ? `${m.violated_n} 笔` : "—"], ["违规单累计", rfmt(m.violated_n ? m.violated_r : null), m.violated_n && tone(m.violated_r)]]
    .forEach(([label, value, cls]) => cards.append(el("div", "stat", el("small", "", label), el("b", `num ${cls || ""}`, value))));
  $("view").replaceChildren(
    el("div", "d-head", el("div", "", el("h1", "", `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`), el("div", "sub", `按平仓时间归月 · ${isCurrent ? "本月至今" : "整月"}`)), actions),
    cards, el("div", "note", has ? "一个月的样本太小，这里只看执行与结果，不判断策略有无优势。各版本合并统计。" : "本月无已平仓交易。"));
}
function renderSettings() {
  const form = el("form", "panel settings-panel");
  const risk = field("默认单笔风险（%）", overview.settings.risk_pct, "decimal");
  const minimum = field("开始评估的最少笔数", overview.settings.min_sample, "decimal");
  const error = el("div", "err");
  error.hidden = true;
  error.setAttribute("role", "alert");
  const submit = button("保存设置", null, "btn btn-primary");
  submit.type = "submit";
  form.append(el("h2", "section-title", "设置"), el("div", "fgrid", risk.node, minimum.node), error, el("div", "", submit));
  bindSubmit(form, error, async () => {
    const data = { risk_pct: numberOf(risk.input, "风险比例"), min_sample: numberOf(minimum.input, "最少样本数") };
    if (!Number.isSafeInteger(data.min_sample) || data.min_sample < 2) throw new Error("最少样本数必须是至少为 2 的整数");
    overview.settings = await api("PUT", "/api/settings", data);
    notice("设置已保存。");
  });
  const backupError = el("div", "err");
  backupError.hidden = true;
  backupError.setAttribute("role", "alert");
  const exportButton = button("导出 JSON", async () => {
    exportButton.disabled = true;
    backupError.hidden = true;
    try {
      const dump = await api("GET", "/api/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" }));
      const a = link("", url);
      a.download = `journal-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { showError(backupError, err); }
    finally { exportButton.disabled = false; }
  });
  const file = el("input");
  file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
  file.addEventListener("change", async () => {
    const chosen = file.files[0];
    file.value = "";
    if (!chosen) return;
    backupError.hidden = true;
    try {
      if (chosen.size > 10 * 1024 * 1024) throw new Error("备份超过 10 MiB，无法导入");
      let dump;
      try { dump = JSON.parse(await chosen.text()); } catch (_) { throw new Error("文件不是有效的 JSON 备份"); }
      if (!dump || typeof dump !== "object" || !Array.isArray(dump.strategies) || !Array.isArray(dump.versions) || !Array.isArray(dump.trades)) throw new Error("备份必须包含策略、版本和交易数组");
      if (dump.schema_version !== 4) throw new Error("只接受版本 4 的备份（本版不兼容旧数据）");
      if (!token || !file.isConnected) return;
      const m = modal("导入并替换全部数据", "确认替换全部数据", async () => {
        await api("POST", "/api/import", dump);
        await saved("备份已导入，全部数据已替换。");
      });
      m.submit.className = "btn btn-danger";
      m.body.append(el("p", "", `已选择：${chosen.name}`), el("div", "rulebox", `包含 ${dump.versions.length} 个策略版本、${dump.trades.length} 笔交易。`), el("p", "neg", "此操作将整体替换全部交易、账户权益和设置，无法撤销。请确认已导出现有数据的备份。"));
    } catch (err) { showError(backupError, err); }
  });
  const backup = el("div", "panel settings-panel", el("h2", "section-title", "备份"), el("p", "sub", "导出全部交易、策略版本、账户权益和设置为 JSON。导入为整库替换，需再次确认；只接受本版导出的备份。"), el("div", "actions", exportButton, button("导入并替换…", () => file.click(), "btn btn-danger")), file, backupError);
  $("view").replaceChildren(form, backup, el("div", "", button("退出登录", () => {
    token = ""; overview = null; remember("journal-token", ""); routeSequence++; showLogin(); notice("已退出登录。");
  })));
}
function showLogin() {
  stopSessionClock();
  $("view").inert = false;
  $("view").classList.remove("refreshing");
  $("nav").hidden = true;
  $("new-trade").hidden = true;
  const form = el("form", "panel");
  const password = field("口令", "", "password");
  password.input.autocomplete = "current-password";
  password.input.required = true;
  const error = el("div", "err");
  error.hidden = true;
  error.setAttribute("role", "alert");
  const submit = button("进入", null, "btn btn-primary");
  submit.type = "submit";
  form.append(el("div", "brand", el("i"), "交易日志"), el("h1", "", "输入口令"), password.node, error, submit, el("p", "sub", "口令只保存在这台设备的浏览器里。"));
  bindSubmit(form, error, async () => {
    token = password.input.value;
    try {
      await api("GET", "/api/overview");
      remember("journal-token", token);
      await route();
    } catch (err) { token = ""; throw err; }
  });
  $("view").replaceChildren(el("div", "login", form));
  password.input.focus();
}
// quiet 刷新保留当前页面和提示，刷新期间页面变淡且不可操作，避免基于旧数据开仓或校准。
// hashchange 和按钮会传入事件对象，只有显式传 { quiet: true } 才算后台刷新。
async function route(options) {
  const quiet = options?.quiet === true;
  const sequence = ++routeSequence;
  const view = $("view");
  const settle = () => { if (sequence === routeSequence) { view.inert = false; view.classList.remove("refreshing"); } };
  view.inert = quiet;
  view.classList.toggle("refreshing", quiet);
  stopSessionClock();
  if (!quiet) { closeModal(true); notice(""); }
  if (!token) { settle(); showLogin(); return; }
  if (!quiet) view.replaceChildren(empty("正在加载…"));
  $("new-trade").disabled = true;
  try {
    const o = await api("GET", "/api/overview");
    if (sequence !== routeSequence) return;
    overview = o;
    const hash = location.hash || "#home";
    const match = /^#strategy(?:-v(\d+))?$/.exec(hash);
    if (match) {
      const strategy = await api("GET", "/api/strategy");
      if (sequence !== routeSequence) return;
      const picked = match[1] ? strategy.versions.find(v => v.version.no === parseNum(match[1])) : strategy.versions[strategy.versions.length - 1];
      if (!picked) throw new Error("该策略版本不存在");
      const detail = await api("GET", `/api/versions/${picked.version.id}/stats`);
      if (sequence !== routeSequence) return;
      renderDetail(strategy, detail);
    } else if (hash.startsWith("#monthly")) {
      const { start, current } = monthOf(hash);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const m = await api("GET", `/api/monthly?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`);
      if (sequence !== routeSequence) return;
      renderMonthly(m, start, current);
    } else if (hash === "#settings") renderSettings();
    else renderHome();
    $("nav").hidden = false;
    $("new-trade").hidden = false;
    $("new-trade").disabled = false;
    $("new-trade").title = "记录开仓";
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("on", a.hash === hash || (a.hash === "#monthly" && hash.startsWith("#monthly"))));
    if (!quiet) window.scrollTo(0, 0);
    settle();
  } catch (error) {
    if (sequence !== routeSequence) return;
    settle();
    if (error.status === 401) return;
    $("view").replaceChildren(el("div", "panel empty", el("p", "err", error.message), el("div", "actions", button("重试", route), link("返回首页", "#home"), button("重新登录", () => { token = ""; remember("journal-token", ""); showLogin(); }))));
  }
}
function setTheme(theme) {
  // 浅色为默认，不写 data-theme；护眼与深色各有一组变量。
  theme = ["eye", "dark"].includes(theme) ? theme : "light";
  if (theme === "light") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  remember("journal-theme", theme);
  document.querySelectorAll("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === theme)));
}
document.querySelectorAll("[data-theme-set]").forEach(b => b.addEventListener("click", () => setTheme(b.dataset.themeSet)));
setTheme(stored("journal-theme"));
$("new-trade").addEventListener("click", () => tradeModal("open"));
// 弹窗只能点 × 或"取消"关闭；点外面、按 Esc 都不关，避免误触丢掉已填内容。
document.addEventListener("keydown", event => {
  if ($("modal").hidden) return;
  if (event.key === "Tab") {
    const focusable = [...$("modal").querySelectorAll("button,input,textarea,select,summary,a[href]")].filter(n => !n.disabled && n.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
addEventListener("hashchange", route);
void route();
