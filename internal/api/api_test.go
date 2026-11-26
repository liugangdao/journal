package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"
	"unicode"

	"github.com/liugangdao/journal/internal/rules"
	"github.com/liugangdao/journal/internal/store"
)

func setup(t *testing.T) (*store.Store, *httptest.Server) {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "journal.db"), rules.Current)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(New(s, "t0ken", nil))
	t.Cleanup(func() { server.Close(); s.Close() })
	return s, server
}
func request(t *testing.T, server *httptest.Server, method, path, body, token string, want int) (map[string]any, http.Header, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != want {
		t.Fatalf("%s %s 返回 %d，期望 %d：%s", method, path, resp.StatusCode, want, b)
	}
	var v map[string]any
	if len(b) > 0 && b[0] == '{' {
		if err = json.Unmarshal(b, &v); err != nil {
			t.Fatal(err)
		}
	}
	if want >= 400 {
		if v["error"] == nil || v["error"] == "" {
			t.Fatalf("缺少错误消息：%s", b)
		}
		if !strings.ContainsFunc(v["error"].(string), func(r rune) bool { return unicode.Is(unicode.Han, r) }) {
			t.Fatalf("错误非中文：%s", b)
		}
	}
	return v, resp.Header, b
}
func call(t *testing.T, s *httptest.Server, method, path, body string, want int) map[string]any {
	t.Helper()
	v, _, _ := request(t, s, method, path, body, "Bearer t0ken", want)
	return v
}
func object(v map[string]any, key string) map[string]any { return v[key].(map[string]any) }
func items(v map[string]any, key string) []any           { return v[key].([]any) }
func number(v map[string]any, key string) float64        { return v[key].(float64) }
func id(v map[string]any) int64                          { return int64(number(v, "id")) }

// tradeBody 返回一笔全部规则项都满足的突破多单请求体，change 可在编码前修改字段。
func tradeBody(change func(map[string]any)) string {
	checks := map[string]any{}
	for _, it := range rules.Current.Versions[0].Items {
		if it.Kind == rules.Rule && it.Setup != rules.Pullback {
			checks[it.Key] = true
		}
	}
	m := map[string]any{"symbol": "btc", "side": "long", "entry": 100, "stop": 95, "equity": 10000, "risk_pct": 1, "qty": 0, "entry_reason": "突破", "phase": "early",
		"setup": "breakout", "key_level": 94, "exit_plan": "trail", "checklist": map[string]any{"vegas_dir": "long", "checks": checks}}
	if change != nil {
		change(m)
	}
	b, _ := json.Marshal(m)
	return string(b)
}
func checks(m map[string]any) map[string]any {
	return m["checklist"].(map[string]any)["checks"].(map[string]any)
}
func newTrade(t *testing.T, s *httptest.Server, change func(map[string]any)) map[string]any {
	t.Helper()
	return call(t, s, "POST", "/api/trades", tradeBody(change), 201)
}

// closed 开仓并平仓，返回平仓后的交易。入场 100、止损 95：出场 110 为 +2R，95 为 -1R。
func closed(t *testing.T, s *httptest.Server, change func(map[string]any), exit float64, deviations string) map[string]any {
	t.Helper()
	tr := newTrade(t, s, change)
	return call(t, s, "POST", fmt.Sprintf("/api/trades/%d/close", id(tr)), fmt.Sprintf(`{"exit":%v,"exit_reason":"manual","deviations":%s}`, exit, deviations), 200)
}
func strs(v any) []string {
	out := []string{}
	for _, x := range v.([]any) {
		out = append(out, x.(string))
	}
	return out
}

func TestFullFlowSingleStrategy(t *testing.T) {
	_, s := setup(t)
	o := call(t, s, "GET", "/api/overview", "", 200)
	if object(o, "strategy")["name"] != "Vegas 顺势" || len(items(object(o, "definition"), "items")) == 0 || o["last_equity"] != nil {
		t.Fatal(o)
	}
	bad := newTrade(t, s, func(m map[string]any) { checks(m)["accept_loss"] = false })
	if !reflect.DeepEqual(strs(bad["violations"]), []string{"accept_loss"}) {
		t.Fatal(bad["violations"])
	}
	o = call(t, s, "GET", "/api/overview", "", 200)
	open := items(o, "open_trades")[0].(map[string]any)
	if number(open, "version_no") != 1 || number(open, "risk_amount") != 100 || len(strs(open["violations"])) != 1 {
		t.Fatal(open)
	}
	path := fmt.Sprintf("/api/trades/%d", id(bad))
	c := call(t, s, "POST", path+"/close", `{"exit":110,"exit_reason":"target","high":112,"low":97,"deviations":[]}`, 200)
	if number(c, "r") != 2 || number(c, "mfe") != 2.4 || number(c, "mae") != 0.6 || c["followed_rules"] != false {
		t.Fatal(c)
	}
	call(t, s, "POST", path+"/close", `{"exit":90,"exit_reason":"stop"}`, 409)
	r := object(call(t, s, "GET", "/api/overview", "", 200), "report")
	if number(object(r, "execution"), "violated_n") != 1 || number(object(object(r, "edge"), "summary"), "n") != 0 || number(object(r, "all"), "n") != 1 {
		t.Fatal(r)
	}
	good := closed(t, s, nil, 95, "[]")
	if good["followed_rules"] != true {
		t.Fatal(good)
	}
	o = call(t, s, "GET", "/api/overview", "", 200)
	r = object(o, "report")
	if number(object(object(r, "edge"), "summary"), "n") != 1 || number(object(r, "execution"), "followed_rate") != 0.5 || number(object(r, "all"), "total_r") != 1 {
		t.Fatal(r)
	}
	_, headers, b := request(t, s, "GET", "/api/export", "", "Bearer t0ken", 200)
	if !strings.HasPrefix(headers.Get("Content-Disposition"), `attachment; filename="journal-`) {
		t.Fatal(headers)
	}
	call(t, s, "POST", "/api/import", string(b), 200)
	if after := call(t, s, "GET", "/api/overview", "", 200); !reflect.DeepEqual(o, after) {
		t.Fatalf("导入前后不同：%v %v", o, after)
	}
}

func TestReportGroups(t *testing.T) {
	_, s := setup(t)
	closed(t, s, nil, 110, "[]")
	closed(t, s, func(m map[string]any) { checks(m)["after_climax"] = true }, 95, "[]")
	closed(t, s, func(m map[string]any) {
		m["setup"] = "pullback"
		c := checks(m)
		delete(c, "bo_trend_clear")
		delete(c, "bo_bars_ok")
		c["pb_key_level"], c["pb_second_entry"], c["pb_signal_bar"] = true, true, true
	}, 110, "[]")
	closed(t, s, func(m map[string]any) { m["phase"] = "late" }, 95, `["moved_stop"]`)
	r := object(call(t, s, "GET", "/api/overview", "", 200), "report")
	setups := items(r, "setups")
	bo, pb := setups[0].(map[string]any), setups[1].(map[string]any)
	if bo["key"] != "breakout" || number(bo, "n") != 2 || pb["key"] != "pullback" || number(pb, "n") != 1 {
		t.Fatal(setups)
	}
	att := items(r, "attention")[0].(map[string]any)
	if att["key"] != "after_climax" || number(object(att, "checked"), "n") != 1 || number(object(att, "unchecked"), "n") != 2 {
		t.Fatal(att)
	}
	vs := items(r, "violations")
	if len(vs) != 1 || vs[0].(map[string]any)["key"] != "moved_stop" || number(vs[0].(map[string]any), "n") != 1 || number(vs[0].(map[string]any), "total_r") != -1 {
		t.Fatal(vs)
	}
	phases := items(r, "phases")
	if len(phases) != 4 || number(phases[0].(map[string]any), "n") != 3 || number(phases[2].(map[string]any), "n") != 0 {
		t.Fatal("违规单不应进入阶段拆分：", phases)
	}
}

func TestViolationOrder(t *testing.T) {
	_, s := setup(t)
	closed(t, s, nil, 110, `["early_exit"]`)
	closed(t, s, func(m map[string]any) { checks(m)["stop_order"] = false }, 95, "[]")
	closed(t, s, func(m map[string]any) { checks(m)["stop_order"] = false }, 95, "[]")
	vs := items(object(call(t, s, "GET", "/api/overview", "", 200), "report"), "violations")
	if len(vs) != 2 || vs[0].(map[string]any)["key"] != "stop_order" || number(vs[0].(map[string]any), "total_r") != -2 {
		t.Fatal("应按累计 R 升序：", vs)
	}
}

func TestRecentViolations(t *testing.T) {
	_, s := setup(t)
	for i := range 12 {
		devs := "[]"
		if i == 0 || i == 1 || i == 5 || i == 8 || i == 11 {
			devs = `["early_exit"]`
		}
		closed(t, s, nil, 110, devs)
	}
	e := object(object(call(t, s, "GET", "/api/overview", "", 200), "report"), "execution")
	if number(e, "recent_n") != 10 || number(e, "recent_violated") != 3 || number(e, "closed_n") != 12 {
		t.Fatal(e)
	}
}

func TestOldStrategyRoutesGone(t *testing.T) {
	_, s := setup(t)
	call(t, s, "POST", "/api/strategies", `{"name":"x"}`, 404)
	call(t, s, "PATCH", "/api/strategies/1", `{"archived":true}`, 404)
	call(t, s, "POST", "/api/strategies/1/versions", `{"rules":"x"}`, 404)
	st := call(t, s, "GET", "/api/strategy", "", 200)
	vs := items(st, "versions")
	if object(st, "strategy")["name"] != "Vegas 顺势" || len(vs) != 1 || object(vs[0].(map[string]any), "definition")["rules"] == "" {
		t.Fatal(st)
	}
}

func TestOpenRejectsBadInput(t *testing.T) {
	_, s := setup(t)
	call(t, s, "POST", "/api/trades", tradeBody(func(m map[string]any) { m["strategy_id"] = 1 }), 400)
	for _, change := range []func(map[string]any){
		func(m map[string]any) { m["entry"] = 0 }, func(m map[string]any) { m["entry"] = "abc" }, func(m map[string]any) { m["entry"] = "68,420.5" },
		func(m map[string]any) { m["entry"] = nil }, func(m map[string]any) { m["qty"] = -1 }, func(m map[string]any) { m["equity"] = 0 },
		func(m map[string]any) { m["stop"] = 100 }, func(m map[string]any) { delete(m, "phase") }, func(m map[string]any) { m["phase"] = "top" },
		func(m map[string]any) { m["key_level"] = 0 }, func(m map[string]any) { m["setup"] = "" }, func(m map[string]any) { checks(m)["pb_signal_bar"] = true },
	} {
		call(t, s, "POST", "/api/trades", tradeBody(change), 400)
	}
	call(t, s, "POST", "/api/trades", strings.Replace(tradeBody(nil), `"entry":100`, `"entry":1e999`, 1), 400)
	if o := call(t, s, "GET", "/api/overview", "", 200); len(items(o, "open_trades")) != 0 {
		t.Fatal("非法开仓写入")
	}
}

func TestPatchRejectsChecklistFields(t *testing.T) {
	_, s := setup(t)
	tr := newTrade(t, s, nil)
	path := fmt.Sprintf("/api/trades/%d", id(tr))
	for _, body := range []string{`{"setup":"pullback"}`, `{"checklist":{}}`, `{"phase":"late"}`, `{"key_level":1}`, `{"followed_rules":true}`} {
		call(t, s, "PATCH", path, body, 400)
	}
	patched := call(t, s, "PATCH", path, `{"version_id":99,"symbol":"ETH"}`, 200)
	if number(patched, "version_id") != number(tr, "version_id") || patched["symbol"] != "ETH" {
		t.Fatal(patched)
	}
	call(t, s, "PATCH", path, `{"stop":100}`, 400)
	call(t, s, "POST", path+"/close", `{"exit":110,"exit_reason":"target"}`, 200)
	after := call(t, s, "PATCH", path, `{"deviations":["moved_stop"]}`, 200)
	if after["followed_rules"] != false || !reflect.DeepEqual(strs(after["violations"]), []string{"moved_stop"}) {
		t.Fatal(after)
	}
	detail := call(t, s, "GET", fmt.Sprintf("/api/versions/%d/stats", int64(number(tr, "version_id"))), "", 200)
	if number(items(detail, "trades")[0].(map[string]any), "stop") != 95 || object(detail, "definition")["no"] != 1.0 {
		t.Fatal(detail)
	}
}

func TestImportInvalid(t *testing.T) {
	st, s := setup(t)
	newTrade(t, s, nil)
	before, err := st.Export()
	if err != nil {
		t.Fatal(err)
	}
	bad := before
	bad.Trades = append([]store.Trade(nil), before.Trades...)
	bad.Trades[0].VersionID = 999
	b, _ := json.Marshal(bad)
	call(t, s, "POST", "/api/import", string(b), 400)
	call(t, s, "POST", "/api/import", `{"trades":[{"version_id":999}]}`, 400)
	after, err := st.Export()
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatalf("非法导入改变数据 %v", err)
	}
}

func TestJSONNamesAndUTCTimes(t *testing.T) {
	_, s := setup(t)
	tr := newTrade(t, s, nil)
	o := call(t, s, "GET", "/api/overview", "", 200)
	for _, v := range []map[string]any{o, object(o, "strategy"), object(o, "report"), object(object(o, "report"), "execution"), tr} {
		for key := range v {
			if strings.ContainsFunc(key, unicode.IsUpper) {
				t.Fatalf("字段不是 snake_case：%s", key)
			}
		}
	}
	for _, v := range []string{object(o, "strategy")["created_at"].(string), tr["opened_at"].(string)} {
		at, err := time.Parse(time.RFC3339, v)
		if err != nil || !strings.HasSuffix(v, "Z") || at.Location() != time.UTC {
			t.Fatalf("时间格式 %s %v", v, err)
		}
	}
}

func TestMonthly(t *testing.T) {
	st, s := setup(t)
	win := id(closed(t, s, nil, 110, "[]"))
	loss := id(closed(t, s, nil, 95, "[]"))
	win2 := id(closed(t, s, nil, 105, "[]"))
	bad := id(closed(t, s, nil, 90, `["early_exit"]`))
	edge := id(closed(t, s, nil, 110, "[]"))
	prev := id(closed(t, s, nil, 110, "[]"))
	open := id(newTrade(t, s, nil))    // 本月开仓、仍持仓：不计入统计，但列在本月交易里。
	oldOpen := id(newTrade(t, s, nil)) // 上月开仓、仍持仓：不属于本月。
	d, err := st.Export()
	if err != nil {
		t.Fatal(err)
	}
	from, to := time.Date(2026, 10, 31, 16, 0, 0, 0, time.UTC), time.Date(2026, 11, 30, 16, 0, 0, 0, time.UTC)
	at := map[int64]time.Time{win: from, loss: from.Add(time.Hour), win2: from.Add(2 * time.Hour), bad: from.Add(3 * time.Hour), edge: to, prev: from.Add(-time.Second)}
	openedAt := map[int64]time.Time{open: from.Add(4 * time.Hour), oldOpen: from.Add(-time.Hour)}
	for i := range d.Trades {
		if o, ok := openedAt[d.Trades[i].ID]; ok {
			d.Trades[i].OpenedAt = o
		}
		if c, ok := at[d.Trades[i].ID]; ok {
			d.Trades[i].OpenedAt = c.Add(-time.Minute)
			d.Trades[i].ClosedAt = &c
		}
	}
	if err = st.Import(d); err != nil {
		t.Fatal(err)
	}
	// 用带偏移的时间传入，等价于东八区的 11 月。
	m := call(t, s, "GET", "/api/monthly?from=2026-11-01T00:00:00%2B08:00&to=2026-12-01T00:00:00%2B08:00", "", 200)
	if number(m, "n") != 4 || number(m, "total_r") != 0 || number(m, "win_rate") != 0.5 || number(m, "avg_win") != 1.5 || number(m, "avg_loss") != -1.5 ||
		number(m, "max_drawdown_r") != 2 || number(m, "max_loss_streak") != 1 || number(m, "followed_rate") != 0.75 || number(m, "violated_n") != 1 || number(m, "violated_r") != -2 {
		t.Fatal(m)
	}
	listed := map[int64]map[string]any{}
	for _, v := range m["trades"].([]any) {
		tr := v.(map[string]any)
		listed[id(tr)] = tr
	}
	if len(listed) != 5 || listed[open] == nil || listed[prev] != nil || listed[edge] != nil || listed[oldOpen] != nil {
		t.Fatalf("本月交易应为 4 笔已平仓加 1 笔本月开仓的持仓：%v", m["trades"])
	}
	if number(listed[win], "r") != 2 || number(listed[win], "version_no") != 1 || len(listed[bad]["violations"].([]any)) != 1 || listed[open]["r"] != nil {
		t.Fatal(listed)
	}
	if _, ok := m["strategies"]; ok {
		t.Fatal("月度不应再按策略分组")
	}
	empty := call(t, s, "GET", "/api/monthly?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z", "", 200)
	if number(empty, "n") != 0 || empty["followed_rate"] != nil || len(empty["trades"].([]any)) != 0 {
		t.Fatal(empty)
	}
	for _, q := range []string{"", "?from=2026-11-01T00:00:00Z", "?from=x&to=y", "?from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z"} {
		call(t, s, "GET", "/api/monthly"+q, "", 400)
	}
}

func TestAuthRequired(t *testing.T) {
	st, s := setup(t)
	for _, token := range []string{"", "Bearer wrong", "bearer t0ken", "Basic t0ken", "Bearer t0ken x"} {
		request(t, s, "GET", "/api/overview", "", token, 401)
	}
	call(t, s, "GET", "/api/overview", "", 200)
	request(t, s, "POST", "/api/import", "{}", "", 401)
	request(t, s, "GET", "/api/missing", "", "", 401)
	// HTTP 传输会清理头部末尾空白，直接调用处理器验证原始字符串比较。
	r := httptest.NewRequest("GET", "/api/overview", nil)
	r.Header.Set("Authorization", "Bearer t0ken ")
	w := httptest.NewRecorder()
	New(st, "t0ken", nil).ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal("口令末尾空白被忽略")
	}
}

func TestSettingsErrorsAndDelete(t *testing.T) {
	_, s := setup(t)
	call(t, s, "PUT", "/api/settings", `{"risk_pct":2,"min_sample":10}`, 200)
	st := call(t, s, "GET", "/api/settings", "", 200)
	if number(st, "risk_pct") != 2 || number(st, "min_sample") != 10 {
		t.Fatal(st)
	}
	call(t, s, "PUT", "/api/settings", `{"risk_pct":101,"min_sample":1}`, 400)
	for _, path := range []string{"/api/versions/999/stats", "/api/missing"} {
		call(t, s, "GET", path, "", 404)
	}
	call(t, s, "GET", "/api/versions/abc/stats", "", 400)
	tr := newTrade(t, s, nil)
	path := fmt.Sprintf("/api/trades/%d", id(tr))
	call(t, s, "DELETE", path, "", 204)
	call(t, s, "DELETE", path, "", 404)
	call(t, s, "PATCH", path, `{"symbol":"ETH"}`, 404)
	call(t, s, "POST", path+"/close", `{"exit":110,"exit_reason":"target"}`, 404)
}

func TestJSONBodyAndLimit(t *testing.T) {
	_, s := setup(t)
	for _, body := range []string{"", "null", "[]", `{"balance":`, `{"balance":1} {}`, `{"balance":1,"unknown":1}`, `{"reason":"` + strings.Repeat("x", 10*1024*1024) + `"}`} {
		v := call(t, s, "POST", "/api/equity/calibrations", body, 400)
		if v["error"] != "请求格式不正确" {
			t.Fatal(v)
		}
	}
	call(t, s, "POST", "/api/equity/calibrations", `{"balance":1,"reason":"`+strings.Repeat("x", 1024)+`"}`, 201)
}

func TestConcurrentHTTPClose(t *testing.T) {
	_, s := setup(t)
	tr := newTrade(t, s, nil)
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	errs := make(chan error, 2)
	for _, exit := range []int{110, 90} {
		wg.Add(1)
		go func(exit int) {
			defer wg.Done()
			req, err := http.NewRequest("POST", fmt.Sprintf("%s/api/trades/%d/close", s.URL, id(tr)), strings.NewReader(fmt.Sprintf(`{"exit":%d,"exit_reason":"manual"}`, exit)))
			if err != nil {
				errs <- err
				return
			}
			req.Header.Set("Authorization", "Bearer t0ken")
			resp, err := s.Client().Do(req)
			if err != nil {
				errs <- err
				return
			}
			defer resp.Body.Close()
			codes <- resp.StatusCode
		}(exit)
	}
	wg.Wait()
	close(codes)
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	seen := map[int]int{}
	for c := range codes {
		seen[c]++
	}
	if seen[200] != 1 || seen[409] != 1 {
		t.Fatal(seen)
	}
}

func TestWebFallbackAndAPIBoundary(t *testing.T) {
	st, _ := setup(t)
	h := New(st, "t0ken", fstest.MapFS{"index.html": {Data: []byte("<title>交易日志</title>")}, "app.css": {Data: []byte("body {}")}})
	for _, path := range []string{"/", "/strategy/1", "/app.css", "/api/nope"} {
		r := httptest.NewRecorder()
		h.ServeHTTP(r, httptest.NewRequest("GET", path, nil))
		if path == "/api/nope" {
			if r.Code != 401 {
				t.Fatal(r.Code)
			}
		} else if r.Code != 200 || r.Body.Len() == 0 {
			t.Fatalf("静态路径 %s: %d %s", path, r.Code, r.Body.String())
		}
	}
	h = New(st, "", nil)
	r := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/overview", nil)
	req.Header.Set("Authorization", "Bearer ")
	h.ServeHTTP(r, req)
	if r.Code != 401 {
		t.Fatal("空口令不能授权")
	}
}

// 内嵌字体必须以 font/woff2 返回，不能依赖服务器上的系统 MIME 表。
func TestFontContentType(t *testing.T) {
	st, _ := setup(t)
	h := New(st, "t0ken", fstest.MapFS{"index.html": {Data: []byte("<title>交易日志</title>")}, "fonts/a.woff2": {Data: []byte("wOF2")}})
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("GET", "/fonts/a.woff2", nil))
	if r.Code != 200 || r.Header().Get("Content-Type") != "font/woff2" || r.Header().Get("ETag") == "" {
		t.Fatal(r.Code, r.Header())
	}
}

// 更新程序后前端要立即生效：静态文件不能被代理或浏览器按默认规则缓存数小时。
func TestStaticRevalidates(t *testing.T) {
	st, _ := setup(t)
	h := New(st, "t0ken", fstest.MapFS{"index.html": {Data: []byte("<title>交易日志</title>")}, "app.js": {Data: []byte("1")}})
	get := func(path, etag string) *httptest.ResponseRecorder {
		r := httptest.NewRecorder()
		req := httptest.NewRequest("GET", path, nil)
		if etag != "" {
			req.Header.Set("If-None-Match", etag)
		}
		h.ServeHTTP(r, req)
		return r
	}
	js, index := get("/app.js", ""), get("/strategy/1", "")
	for _, r := range []*httptest.ResponseRecorder{js, index} {
		if r.Code != 200 || r.Header().Get("Cache-Control") != "no-cache" || r.Header().Get("ETag") == "" {
			t.Fatalf("%d %q %q", r.Code, r.Header().Get("Cache-Control"), r.Header().Get("ETag"))
		}
	}
	if js.Header().Get("ETag") == index.Header().Get("ETag") {
		t.Fatal("不同文件的 ETag 应不同")
	}
	if r := get("/app.js", js.Header().Get("ETag")); r.Code != 304 {
		t.Fatalf("未变化应返回 304，得到 %d", r.Code)
	}
	if r := get("/", index.Header().Get("ETag")); r.Code != 304 {
		t.Fatalf("首页未变化应返回 304，得到 %d", r.Code)
	}
}

func TestEquityAPI(t *testing.T) {
	_, s := setup(t)
	const path = "/api/equity/calibrations"
	if o := call(t, s, "GET", "/api/overview", "", 200); o["equity"] != nil {
		t.Fatal(o["equity"])
	}
	for _, body := range []string{`{"balance":0}`, `{"balance":-1}`, `{"balance":"abc"}`, `{"balance":1e999}`, `{"balance":100,"delta":5}`} {
		wantStatus := 400
		call(t, s, "POST", path, body, wantStatus)
	}
	first := call(t, s, "POST", path, `{"balance":10000}`, 201)
	if first["reason"] != "initial" || first["delta"] != nil {
		t.Fatal(first)
	}
	tr := newTrade(t, s, nil)
	if o := call(t, s, "GET", "/api/overview", "", 200); number(o, "equity") != 10000 {
		t.Fatal(o["equity"])
	}
	call(t, s, "POST", fmt.Sprintf("/api/trades/%d/close", id(tr)), `{"exit":110,"exit_reason":"target"}`, 200)
	if o := call(t, s, "GET", "/api/overview", "", 200); number(o, "equity") != 10200 {
		t.Fatal(o["equity"])
	}
	call(t, s, "POST", path, `{"balance":10100,"reason":"nope"}`, 400)
	second := call(t, s, "POST", path, `{"balance":10100,"reason":"fee"}`, 201)
	if second["reason"] != "fee" || number(second, "delta") != -100 {
		t.Fatal(second)
	}
	_, _, raw := request(t, s, "GET", path, "", "Bearer t0ken", 200)
	var list []store.Calibration
	if err := json.Unmarshal(raw, &list); err != nil || len(list) != 2 || list[0].Reason != "fee" {
		t.Fatalf("%s %v", raw, err)
	}
}
