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
  if (!Number.isFinite(value)) throw new Error(`${label}必须是有效数字`);
  return value;
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
function notice(text, bad = false) {
  $("notice").textContent = text;
  $("notice").className = bad ? "note neg" : "note";
  $("notice").hidden = !text;
}
function showError(target, error) {
  if (error.status === 401) return;
  target.textContent = error.message || "操作失败，请稍后重试";
  target.hidden = false;
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
    try { await action(); } catch (error) { showError(target, error); }
    finally {
      form.dataset.busy = "false";
      controls.forEach(([node, disabled]) => { node.disabled = disabled; });
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
    el("div", "sub num", summary.ci_ok ? `95% 区间 ${rfmt(summary.ci_low)} ～ ${rfmt(summary.ci_high)}` : "暂无置信区间"));
}
function strategyRows(strategies) {
  const rows = el("div", "panel rows");
  rows.append(el("div", "row head strat-row", ...["策略 / 当前版本", "笔数", "期望 E", "95% 区间", "结论", ""].map(v => el("div", "", v))));
  if (!strategies.length) rows.append(empty("暂无策略，先写下入场、止损与出场规则。"));
  for (const s of strategies) {
    const summary = s.stats.summary;
    const name = el("div", "c-n", el("div", "sname", s.name, el("em", "", `v${s.current_version.no}`)), el("div", "sub", `${summary.n} 笔已平仓`));
    const conclusion = el("div", "c-t", verdict(s.stats), flag(s.stats));
    rows.append(link("", `#strategy-${s.id}`, "row link strat-row"));
    rows.lastChild.append(name, el("div", "c-k num", summary.n), el("div", "c-e", rnum(summary.n ? summary.expectancy : null)), el("div", "c-c", interval(summary)), conclusion, el("div", "c-f faint", "›"));
  }
  return rows;
}
function renderHome() {
  const o = overview, t = o.totals;
  const totals = el("div", "kpis",
    kpi("总计", rfmt(t.total_r), "含已归档与旧版本", tone(t.total_r)),
    kpi("按规则执行率", pct(t.followed_rate), `${t.closed_n - t.violated_n} / ${t.closed_n} 笔`),
    kpi("违规单累计", rfmt(t.violated_r), `${t.violated_n} 笔`, tone(t.violated_r)),
    kpi("已试过", `${t.strategies_n} 策略`, `${t.versions_n} 个版本`));
  const open = el("div", "panel rows");
  open.append(el("div", "row head pos-row", ...["品种 / 策略", "方向", "入场", "止损", "1R", ""].map(v => el("div", "", v))));
  if (!o.open_trades.length) open.append(empty("暂无持仓。记下开仓理由，再开始跟踪。"));
  for (const trade of o.open_trades) {
    open.append(el("div", "row pos-row",
      el("div", "", el("div", "sname num", trade.symbol), el("div", "sub", `${trade.strategy_name} · v${trade.version_no}`), el("div", "sub", date(trade.opened_at))),
      el("div", "hide-m", el("span", `side ${trade.side}`, trade.side === "long" ? "多" : "空")),
      el("div", "num hide-m", fmt(trade.entry, 8)), el("div", "num hide-m", fmt(trade.stop, 8)),
      el("div", "num hide-m", `${fmt(trade.risk_amount)} U`),
      button("平仓", () => tradeModal("close", trade), "btn btn-sm")));
  }
  const archived = el("details", "archived");
  const archivedList = el("div");
  archived.append(el("summary", "sub", `已归档 ${o.archived_n} 个`), archivedList);
  let loaded = false;
  archived.addEventListener("toggle", async () => {
    if (!archived.open || loaded) return;
    archivedList.replaceChildren(empty("正在加载…"));
    try {
      const all = await api("GET", "/api/strategies?archived=1");
      archivedList.replaceChildren(strategyRows(all.filter(s => s.archived)));
      loaded = true;
    } catch (error) { showError(archivedList, error); }
  });
  $("view").replaceChildren(
    section("全部交易", totals, el("span", "sub", `${t.closed_n} 笔已平仓 · ${t.open_n} 笔持仓中 · 单笔风险 ${fmt(o.settings.risk_pct)}%`)),
    el("div", "note", "试过的策略和版本越多，越容易碰巧出现好看的结果。先积累样本，再判断优势。"),
    section("持仓中", open),
    section("策略 · 当前版本", strategyRows(o.strategies), button("＋ 新建策略", () => strategyModal(), "btn btn-sm")), archived);
}

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text != null) node.textContent = text;
  return node;
}
function curve(values) {
  const svg = svgNode("svg", { viewBox: "0 0 640 240", role: "img", "aria-label": "按平仓时间排序的累计 R 曲线" });
  const points = values.length ? values : [0];
  let low = 0, high = 0;
  for (const value of points) { low = Math.min(low, value); high = Math.max(high, value); }
  if (low === high) { low = -1; high = 1; }
  const padding = (high - low) * 0.12;
  low -= padding; high += padding;
  const x = i => 54 + i / Math.max(1, points.length - 1) * 566;
  const y = value => 18 + (high - value) / (high - low) * 186;
  for (const value of [low, 0, high]) {
    svg.append(svgNode("line", { x1: 54, x2: 620, y1: y(value), y2: y(value), class: value === 0 ? "chart-zero" : "chart-grid" }));
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
  svg.append(svgNode("text", { x: Math.max(100, x(last) - 8), y: Math.max(14, y(points[last]) - 10), "text-anchor": "end", class: "chart-label chart-last" }, rfmt(points[last])));
  return el("div", "panel chart", el("div", "sec-h", el("h2", "", "累计 R"), el("span", "sub", "按平仓时间排序")), svg);
}
function checkCard(title, lines, message = "", warn = false) {
  return el("div", "panel check", el("h3", "", title), ...lines.map(([label, value]) => el("div", "line", el("span", "", label), value instanceof Node ? value : num(value))), message ? el("div", warn ? "warnbox" : "okbox", message) : null);
}
function killText(version) {
  return [version.kill_recent_n == null ? "最近 N 笔：未启用" : `最近 ${version.kill_recent_n} 笔平均 R < ${fmt(version.kill_recent_below)}`,
    version.kill_max_dd_r == null ? "最大回撤：未启用" : `最大回撤 > ${fmt(version.kill_max_dd_r)}R`];
}
function renderDetail(strategy, detail, current) {
  const v = detail.version, stats = detail.stats, s = stats.summary;
  const readonly = v.id !== current.id;
  const actions = el("div", "actions");
  if (!readonly) {
    actions.append(button("编辑规则 / 名称", () => strategyModal(strategy, current)), button(strategy.archived ? "取消归档" : "归档策略", async event => {
      const b = event.currentTarget;
      b.disabled = true;
      try { await api("PATCH", `/api/strategies/${strategy.id}`, { archived: !strategy.archived }); await route(); }
      catch (error) { if (error.status !== 401) notice(error.message, true); }
      finally { b.disabled = false; }
    }));
  }
  const versions = el("div", "vpick");
  [...strategy.versions].reverse().forEach(version => {
    const b = button(`v${version.no}${version.id === current.id ? " · 当前" : " · 只读"}`, () => { location.hash = `strategy-${strategy.id}-v${version.no}`; }, version.id === v.id ? "on" : "");
    b.setAttribute("aria-pressed", String(version.id === v.id));
    versions.append(b);
  });
  const cards = el("div", "panel stats");
  [["已平仓", `${s.n} 笔`], ["每笔期望 E", rfmt(s.n ? s.expectancy : null)], ["胜率", s.n ? pct(s.win_rate) : "—"], ["累计", rfmt(s.total_r)],
    ["平均盈利", rfmt(s.n && s.win_rate > 0 ? s.avg_win : null)], ["平均亏损", rfmt(s.n && s.win_rate < 1 ? s.avg_loss : null)], ["最大回撤", ddfmt(s.max_drawdown_r)], ["最长连亏", `${s.max_loss_streak} 笔`],
    ["R 标准差", fmt(s.std_dev)], ["95% 区间下限", rfmt(s.ci_ok ? s.ci_low : null)], ["95% 区间上限", rfmt(s.ci_ok ? s.ci_high : null)], ["版本", `v${v.no}`]]
    .forEach(([label, value]) => cards.append(el("div", "stat", el("small", "", label), el("b", "num", value))));
  const rules = el("div", "panel rules", el("h2", "section-title", "规则与停用条件"), el("pre", "", v.rules || "未填写规则"), ...killText(v).map(text => el("div", "sub", text)), el("div", "sub", `创建于 ${date(v.created_at)}`));
  const checks = el("div", "checks",
    checkCard("多空分开", [[`做多 ${stats.sides.long_n} 笔`, rnum(stats.sides.long_n ? stats.sides.long_e : null)], [`做空 ${stats.sides.short_n} 笔`, rnum(stats.sides.short_n ? stats.sides.short_e : null)]], stats.sides.warn ? "收益可能来自单边行情" : "两边各至少 10 笔时检查单边收益。", stats.sides.warn),
    checkCard("去掉最好的 5 笔", [["原期望", rnum(s.n ? s.expectancy : null)], [`剩余 ${Math.max(0, s.n - 5)} 笔`, rnum(stats.top_removed.computed ? stats.top_removed.e : null)]], !stats.top_removed.computed ? "超过 5 笔后计算。" : stats.top_removed.warn ? "收益集中在少数几笔" : "未触发收益集中警示。", stats.top_removed.warn),
    checkCard("按规则 / 违规", [[`按规则 ${stats.rules.followed_n} 笔 · E`, rnum(stats.rules.followed_n ? stats.rules.followed_e : null)], ["按规则累计", rnum(stats.rules.followed_r)], [`违规 ${stats.rules.violated_n} 笔 · E`, rnum(stats.rules.violated_n ? stats.rules.violated_e : null)], ["违规累计", rnum(stats.rules.violated_r)]]),
    checkCard("入场 / 出场质量", [["平均最大浮盈", rnum(stats.quality.n ? stats.quality.avg_mfe : null)], ["平均最大浮亏", rnum(stats.quality.n ? stats.quality.avg_mae : null)], ["平均利润回吐", rnum(stats.quality.n ? stats.quality.avg_giveback : null)]], `${stats.quality.n} / ${s.n} 笔填写了最高、最低价。`),
    checkCard("停用条件", [["最近均值", rnum(stats.kill.recent_evaluated ? stats.kill.recent_mean : null)], ["最近 N 笔", v.kill_recent_n == null ? "未启用" : !stats.kill.recent_evaluated ? `不足 ${v.kill_recent_n} 笔，未判定` : stats.kill.recent_triggered ? "已触发" : "未触发"], ["最大回撤", ddfmt(s.max_drawdown_r)], ["回撤条件", v.kill_max_dd_r == null ? "未启用" : !stats.kill.dd_evaluated ? "未判定" : stats.kill.dd_triggered ? "已触发" : "未触发"]], killText(v).join("；"), stats.kill.triggered));
  const history = el("div", "panel rows");
  [...strategy.versions].reverse().forEach(version => {
    const row = link("", `#strategy-${strategy.id}-v${version.no}`, "row link history-row");
    row.append(el("b", "num", `v${version.no}`), el("div", "sub", date(version.created_at)), num(`${version.stats.summary.n} 笔`), rnum(version.stats.summary.n ? version.stats.summary.expectancy : null), el("div", "sub preserve", version.rules || "未填写规则"));
    history.append(row);
  });
  const trades = el("div", "panel rows");
  if (!detail.trades.length) trades.append(empty("这个版本还没有交易。"));
  for (const trade of detail.trades) {
    const row = button("", () => tradeModal("edit", trade, readonly), "row link trade-row trade-button");
    row.append(el("div", "", el("div", "sname num", trade.symbol), el("div", "sub", date(trade.opened_at))),
      el("div", "hide-m", el("span", `side ${trade.side}`, trade.side === "long" ? "多" : "空")),
      el("div", "num hide-m", fmt(trade.entry, 8)), el("div", "num hide-m", fmt(trade.exit, 8)),
      el("div", "", trade.status === "open" ? el("span", "tag t-idle", "持仓中") : rnum(trade.r)),
      el("div", "sub hide-m", { stop: "止损", target: "止盈", manual: "主动离场" }[trade.exit_reason] || "—"),
      el("div", "sub hide-m", trade.followed_rules == null ? "—" : trade.followed_rules ? "按规则" : "违规"), el("span", "faint hide-m", "›"));
    trades.append(row);
  }
  $("view").replaceChildren(link("‹ 策略面板", "#home", "back"), el("div", "d-head", el("div", "", el("h1", "", strategy.name, num(`v${v.no}`), verdict(stats)), el("div", "sub", `${readonly ? "历史版本只读 · 单独统计" : "当前版本"}${strategy.archived ? " · 已归档" : ""}`)), actions), versions,
    cards, el("div", "grid2", curve(s.curve), rules), section("附加检验", checks), section("版本历史", history), section(`v${v.no} 交易`, trades, el("span", "sub", readonly ? "点击查看 · 历史版本只读" : "点击修改或删除")));
}

async function saved(message) {
  closeModal(true);
  await route();
  if (token) notice(message);
}
function tradeModal(mode, trade = {}, readonly = false) {
  const opening = mode === "open", closing = mode === "close";
  const hasClose = closing || trade.status === "closed";
  let deleting = false;
  const f = {};
  const m = modal(readonly ? `查看交易 · ${trade.symbol} · 只读` : opening ? "记一笔 · 开仓" : `${closing ? "平仓" : "编辑交易"} · ${trade.symbol}`, closing ? "确认平仓" : opening ? "记下这笔" : "保存修改", readonly ? null : async () => {
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
      if (!body.symbol || !body.entry_reason) throw new Error("品种和入场理由不能为空");
      for (const key of ["entry", "stop", "equity", "risk_pct"]) body[key] = numberOf(f[key].input, f[key].label);
      body.qty = opening && !f.qty.input.value.trim() ? suggested() : numberOf(f.qty.input, "实际数量");
      if (![body.entry, body.stop, body.equity, body.risk_pct, body.qty].every(n => Number.isFinite(n) && n > 0)) throw new Error("价格、权益、风险比例和数量必须大于 0");
      if (body.side === "long" ? body.stop >= body.entry : body.stop <= body.entry) throw new Error("止损必须在入场价的亏损一侧");
      if (opening) body.strategy_id = numberOf(f.strategy.input, "策略");
    }
    if (hasClose) {
      body.exit = numberOf(f.exit.input, "出场价");
      body.exit_reason = f.exit_reason.input.value;
      body.followed_rules = f.followed_rules.input.checked;
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
      if (body.high != null && body.high < Math.max(entryPrice, body.exit)) throw new Error("最高价不应低于入场价和出场价，请检查是否填反或填错");
      if (body.low != null && body.low > Math.min(entryPrice, body.exit)) throw new Error("最低价不应高于入场价和出场价，请检查是否填反或填错");
    }
    await api(opening || closing ? "POST" : "PATCH", opening ? "/api/trades" : `/api/trades/${trade.id}${closing ? "/close" : ""}`, body);
    await saved(opening ? "开仓已记录。" : closing ? "已平仓，统计已更新。" : "交易已更新。");
  });
  const addField = (key, label, value, kind = "decimal", full = false) => {
    f[key] = { ...field(label, value, kind, full), label };
    return f[key].node;
  };
  const grid = el("div", "fgrid");
  if (opening) {
    const strategies = overview.strategies;
    f.strategy = selectField("策略", strategies.map(s => [s.id, `${s.name} · v${s.current_version.no}`]), strategies[0]?.id, true);
    const rule = el("div", "rulebox preserve");
    const updateRule = () => {
      const strategy = strategies.find(s => s.id === parseNum(f.strategy.input.value));
      rule.textContent = strategy ? `v${strategy.current_version.no}：${strategy.current_version.rules || "未填写规则"}` : "请先新建策略。";
    };
    f.strategy.input.addEventListener("change", updateRule);
    updateRule();
    m.body.append(f.strategy.node, rule);
  } else {
    m.body.append(el("div", "sub num", `开仓 ${date(trade.opened_at)}${trade.closed_at ? ` · 平仓 ${date(trade.closed_at)}` : ""}`));
  }
  if (!closing) {
    f.side = selectField("方向", [["long", "做多"], ["short", "做空"]], trade.side || "long");
    grid.append(f.side.node, addField("symbol", "品种", trade.symbol, "text"),
      addField("entry", "入场价", trade.entry), addField("stop", "止损价", trade.stop),
      addField("equity", "账户权益（U）", opening ? overview.last_equity : trade.equity),
      addField("risk_pct", "单笔风险（%）", opening ? overview.settings.risk_pct : trade.risk_pct));
    m.body.append(grid);
  } else {
    m.body.append(el("div", "rulebox num", `${trade.side === "long" ? "做多" : "做空"} · 入场 ${fmt(trade.entry, 8)} · 止损 ${fmt(trade.stop, 8)} · 数量 ${fmt(trade.qty, 8)} · 1R ${fmt(trade.qty * Math.abs(trade.entry - trade.stop))} U`));
  }
  const calc = el("div", "calc");
  const riskValue = el("b", "num", "—"), qtyValue = el("b", "num", "—"), nominalValue = el("b", "num", "—");
  const stopError = el("div", "err");
  stopError.hidden = true;
  if (!closing) {
    calc.append(...[["1R（实际数量）", riskValue], ["建议数量", qtyValue], ["名义价值", nominalValue]].map(([label, value]) => el("div", "", el("small", "", label), value)));
    m.body.append(calc, stopError, addField("qty", opening ? "实际数量（留空使用建议值）" : "实际数量", trade.qty), addField("entry_reason", "入场理由（必填，下单前写）", trade.entry_reason, "textarea"));
  }
  const preview = el("div", "bigR num", "—");
  if (hasClose) {
    const closeGrid = el("div", "fgrid", addField("exit", "出场价", trade.exit), el("div", "f", el("label", "", "这笔的 R"), preview));
    f.exit_reason = selectField("出场原因", [["stop", "止损"], ["target", "止盈"], ["manual", "主动离场"]], trade.exit_reason || "manual", true);
    f.followed_rules = checkbox("这笔按规则执行", trade.followed_rules ?? true);
    closeGrid.append(f.exit_reason.node);
    m.body.append(closeGrid, f.followed_rules.node, addField("review_note", "复盘（选填）", trade.review_note, "textarea"));
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
      stopError.hidden = !wrongSide;
      stopError.textContent = "止损必须在入场价的亏损一侧。";
      m.submit.disabled = wrongSide || (opening && !overview.strategies.length);
      const valid = !wrongSide && entry > 0 && stop > 0 && suggestion > 0 && Number.isFinite(suggestion);
      riskValue.textContent = valid && qty > 0 ? `${fmt(qty * Math.abs(entry - stop))} U` : "—";
      qtyValue.textContent = valid ? fmt(suggestion, 8) : "—";
      nominalValue.textContent = valid && qty > 0 ? `${fmt(qty * entry)} U` : "—";
      if (opening) f.qty.input.placeholder = valid ? fmt(suggestion, 8) : "自动计算";
    }
    if (hasClose) {
      const exit = parseNum(f.exit.input.value), funding = f.funding.input.value.trim() ? parseNum(f.funding.input.value) : 0;
      const valid = entry > 0 && stop > 0 && qty > 0 && exit > 0 && (side === "long" ? stop < entry : stop > entry);
      const r = valid ? ((side === "long" ? 1 : -1) * (exit - entry) * qty - funding) / (qty * Math.abs(entry - stop)) : NaN;
      preview.textContent = rfmt(r);
      preview.className = `bigR num ${tone(r)}`;
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

function strategyModal(strategy, current) {
  const editing = Boolean(strategy);
  const name = field("名称", strategy?.name);
  const rules = field("规则（入场条件、止损、出场）", current?.rules, "textarea");
  const recentN = field("停用：最近 N 笔", current?.kill_recent_n, "decimal");
  const below = field("平均 R 低于", current?.kill_recent_below, "decimal");
  const dd = field("停用：最大回撤超过（R，留空不启用）", current?.kill_max_dd_r, "decimal", true);
  const m = modal(editing ? "编辑策略" : "新建策略", "保存", async () => {
    const newName = name.input.value.trim();
    if (!newName) throw new Error("策略名称不能为空");
    const data = { rules: rules.input.value.trim(), kill_recent_n: numberOf(recentN.input, "最近笔数", true), kill_recent_below: numberOf(below.input, "均值阈值", true), kill_max_dd_r: numberOf(dd.input, "回撤阈值", true) };
    if ((data.kill_recent_n == null) !== (data.kill_recent_below == null)) throw new Error("最近笔数和均值阈值必须一起填写");
    if (data.kill_recent_n != null && (!Number.isSafeInteger(data.kill_recent_n) || data.kill_recent_n <= 0)) throw new Error("最近笔数必须是正整数");
    if (data.kill_max_dd_r != null && data.kill_max_dd_r <= 0) throw new Error("回撤阈值必须大于 0");
    if (!editing) {
      const created = await api("POST", "/api/strategies", { name: newName, ...data });
      closeModal(true);
      location.hash = `strategy-${created.id}`;
      return;
    }
    // 两个接口分别提交；名称成功后更新本地基线，重试不会重复创建版本。
    if (newName !== strategy.name) {
      await api("PATCH", `/api/strategies/${strategy.id}`, { name: newName });
      strategy.name = newName;
    }
    if (Object.keys(data).some(key => data[key] !== (key === "rules" ? (current.rules || "").trim() : current[key]))) {
      const created = await api("POST", `/api/strategies/${strategy.id}/versions`, data);
      closeModal(true);
      location.hash = `strategy-${strategy.id}-v${created.no}`;
    } else await saved("策略名称已保存，版本保持不变。");
  });
  m.body.append(el("div", "rulebox", editing ? `修改规则或停用条件后保存，将创建 v${current.no + 1}，新版本从零开始统计；v${current.no} 保留并单独统计。只改名称不会生成新版本。` : "先写清规则；以后修改规则会创建新版本，分别统计。"), name.node, rules.node, el("div", "fgrid", recentN.node, below.node, dd.node));
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
  [["已平仓", `${m.n} 笔`], ["累计", rfmt(has ? m.total_r : null), has && tone(m.total_r)], ["每笔期望 E", rfmt(has ? m.expectancy : null)], ["胜率", has ? pct(m.win_rate) : "—"],
    ["平均盈利", rfmt(has && m.win_rate > 0 ? m.avg_win : null)], ["平均亏损", rfmt(has && m.win_rate < 1 ? m.avg_loss : null)], ["最大回撤", has ? ddfmt(m.max_drawdown_r) : "—"], ["最长连亏", has ? `${m.max_loss_streak} 笔` : "—"],
    ["按规则执行率", has ? pct(m.followed_rate) : "—"], ["按规则累计", rfmt(followedN ? m.total_r - m.violated_r : null)], ["违规单", has ? `${m.violated_n} 笔` : "—"], ["违规单累计", rfmt(m.violated_n ? m.violated_r : null), m.violated_n && tone(m.violated_r)]]
    .forEach(([label, value, cls]) => cards.append(el("div", "stat", el("small", "", label), el("b", `num ${cls || ""}`, value))));
  const rows = el("div", "panel rows");
  rows.append(el("div", "row head month-row", ...["策略", "累计", "期望 E"].map(v => el("div", "", v))));
  if (!has) rows.append(empty("本月无已平仓交易。"));
  for (const s of m.strategies) {
    const row = link("", `#strategy-${s.id}`, "row link month-row");
    row.append(el("div", "", el("div", "sname", s.name, s.archived ? el("em", "", "已归档") : null), el("div", "sub", `${s.n} 笔 · 胜率 ${pct(s.win_rate)}`)), rnum(s.total_r), el("div", "hide-m", rnum(s.expectancy)));
    rows.append(row);
  }
  $("view").replaceChildren(
    el("div", "d-head", el("div", "", el("h1", "", `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`), el("div", "sub", `按平仓时间归月 · ${isCurrent ? "本月至今" : "整月"}`)), actions),
    cards, el("div", "note", "一个月的样本太小，这里只看执行与结果，不判断策略有无优势。"),
    section("按策略", rows, el("span", "sub", "各版本合并 · 含已归档")));
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
      if (!token || !file.isConnected) return;
      const m = modal("导入并替换全部数据", "确认替换全部数据", async () => {
        await api("POST", "/api/import", dump);
        await saved("备份已导入，全部数据已替换。");
      });
      m.submit.className = "btn btn-danger";
      m.body.append(el("p", "", `已选择：${chosen.name}`), el("div", "rulebox", `包含 ${dump.strategies.length} 个策略、${dump.versions.length} 个版本、${dump.trades.length} 笔交易。`), el("p", "neg", "此操作将整体替换所有策略、版本、交易和设置，无法撤销。请确认已导出现有数据的备份。"));
    } catch (err) { showError(backupError, err); }
  });
  const backup = el("div", "panel settings-panel", el("h2", "section-title", "备份"), el("p", "sub", "导出全部策略、版本、交易和设置为 JSON。导入为整库替换，需再次确认。"), el("div", "actions", exportButton, button("导入并替换…", () => file.click(), "btn btn-danger")), file, backupError);
  $("view").replaceChildren(form, backup, el("div", "", button("退出登录", () => {
    token = ""; overview = null; remember("journal-token", ""); routeSequence++; showLogin(); notice("已退出登录。");
  })));
}
function showLogin() {
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
async function route() {
  const sequence = ++routeSequence;
  closeModal(true);
  notice("");
  if (!token) { showLogin(); return; }
  $("view").replaceChildren(empty("正在加载…"));
  $("new-trade").disabled = true;
  try {
    const o = await api("GET", "/api/overview");
    if (sequence !== routeSequence) return;
    overview = o;
    const hash = location.hash || "#home";
    const match = /^#strategy-(\d+)(?:-v(\d+))?$/.exec(hash);
    if (match) {
      const strategy = await api("GET", `/api/strategies/${match[1]}`);
      if (sequence !== routeSequence) return;
      const current = strategy.versions.reduce((a, b) => a.no > b.no ? a : b);
      const version = match[2] ? strategy.versions.find(v => v.no === parseNum(match[2])) : current;
      if (!version) throw new Error("该策略版本不存在");
      const detail = await api("GET", `/api/versions/${version.id}/stats`);
      if (sequence !== routeSequence) return;
      renderDetail(strategy, detail, current);
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
    $("new-trade").disabled = !o.strategies.length;
    $("new-trade").title = o.strategies.length ? "记录开仓" : "请先新建未归档的策略";
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("on", a.hash === hash || (a.hash === "#monthly" && hash.startsWith("#monthly"))));
    window.scrollTo(0, 0);
  } catch (error) {
    if (sequence !== routeSequence || error.status === 401) return;
    $("view").replaceChildren(el("div", "panel empty", el("p", "err", error.message), el("div", "actions", button("重试", route), link("返回面板", "#home"), button("重新登录", () => { token = ""; remember("journal-token", ""); showLogin(); }))));
  }
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "eye";
  remember("journal-theme", theme);
  document.querySelectorAll("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === theme)));
}
document.querySelectorAll("[data-theme-set]").forEach(b => b.addEventListener("click", () => setTheme(b.dataset.themeSet)));
setTheme(stored("journal-theme") === "dark" ? "dark" : "eye");
$("new-trade").addEventListener("click", () => tradeModal("open"));
$("modal").addEventListener("click", event => { if (event.target === $("modal")) closeModal(); });
document.addEventListener("keydown", event => {
  if ($("modal").hidden) return;
  if (event.key === "Escape") closeModal();
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
