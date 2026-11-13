package api

import (
	"bytes"
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

	"github.com/liugangdao/journal/internal/store"
)

func setup(t *testing.T) (*store.Store, *httptest.Server) {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "journal.db"))
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
func newStrategy(t *testing.T, s *httptest.Server) map[string]any {
	t.Helper()
	return call(t, s, "POST", "/api/strategies", `{"name":"趋势","rules":"突破"}`, 201)
}
func newTrade(t *testing.T, s *httptest.Server, strategy int64) map[string]any {
	t.Helper()
	return call(t, s, "POST", "/api/trades", fmt.Sprintf(`{"strategy_id":%d,"symbol":"btc","side":"long","entry":100,"stop":95,"equity":10000,"risk_pct":1,"qty":0,"entry_reason":"突破","phase":"early"}`, strategy), 201)
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

func TestFullFlow(t *testing.T) {
	_, s := setup(t)
	a := newStrategy(t, s)
	v1 := object(a, "current_version")
	if number(v1, "no") != 1 {
		t.Fatal(a)
	}
	tr := newTrade(t, s, id(a))
	path := fmt.Sprintf("/api/trades/%d", id(tr))
	o := call(t, s, "GET", "/api/overview", "", 200)
	if number(object(o, "totals"), "open_n") != 1 || number(o, "last_equity") != 10000 {
		t.Fatal(o)
	}
	closed := call(t, s, "POST", path+"/close", `{"exit":110,"exit_reason":"target","followed_rules":true,"high":112,"low":97}`, 200)
	if number(closed, "r") != 2 || number(closed, "mfe") != 2.4 || number(closed, "mae") != 0.6 {
		t.Fatal(closed)
	}
	call(t, s, "POST", path+"/close", `{"exit":90,"exit_reason":"stop"}`, 409)
	v2 := call(t, s, "POST", fmt.Sprintf("/api/strategies/%d/versions", id(a)), `{"rules":"新规则"}`, 201)
	if number(v2, "no") != 2 {
		t.Fatal(v2)
	}
	o = call(t, s, "GET", "/api/overview", "", 200)
	current := items(o, "strategies")[0].(map[string]any)
	if number(object(object(current, "stats"), "summary"), "n") != 0 {
		t.Fatal(current)
	}
	v1stats := call(t, s, "GET", fmt.Sprintf("/api/versions/%d/stats", id(v1)), "", 200)
	if number(object(object(v1stats, "stats"), "summary"), "n") != 1 {
		t.Fatal(v1stats)
	}
	_, headers, b := request(t, s, "GET", "/api/export", "", "Bearer t0ken", 200)
	if !strings.HasPrefix(headers.Get("Content-Disposition"), `attachment; filename="journal-`) {
		t.Fatal(headers)
	}
	call(t, s, "POST", "/api/import", string(b), 200)
	after := call(t, s, "GET", "/api/overview", "", 200)
	if !reflect.DeepEqual(o, after) {
		t.Fatalf("导入前后不同：%v %v", o, after)
	}
}

func TestOpenTradeRejectsBadNumbers(t *testing.T) {
	_, s := setup(t)
	a := newStrategy(t, s)
	for _, field := range []string{`"entry":0`, `"entry":-1`, `"entry":"abc"`, `"entry":"68,420.5"`, `"entry":1e999`, `"entry":null`, `"entry":100,"qty":-1`, `"entry":100,"equity":0`, `"entry":100,"stop":100`} {
		body := fmt.Sprintf(`{"strategy_id":%d,"symbol":"BTC","side":"long","stop":95,"equity":10000,"risk_pct":1,"entry_reason":"突破","phase":"early",%s}`, id(a), field)
		call(t, s, "POST", "/api/trades", body, 400)
	}
	o := call(t, s, "GET", "/api/overview", "", 200)
	if number(object(o, "totals"), "open_n") != 0 {
		t.Fatal("非法数字写入")
	}
}

func TestImportInvalid(t *testing.T) {
	st, s := setup(t)
	a := newStrategy(t, s)
	newTrade(t, s, id(a))
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

func TestTradePatchKeepsVersionAndRevalidates(t *testing.T) {
	_, s := setup(t)
	a := newStrategy(t, s)
	tr := newTrade(t, s, id(a))
	path := fmt.Sprintf("/api/trades/%d", id(tr))
	call(t, s, "POST", path+"/close", `{"exit":110,"exit_reason":"target","followed_rules":true}`, 200)
	v2 := call(t, s, "POST", fmt.Sprintf("/api/strategies/%d/versions", id(a)), `{"rules":"新规则"}`, 201)
	patched := call(t, s, "PATCH", path, fmt.Sprintf(`{"version_id":%d,"symbol":"ETH"}`, id(v2)), 200)
	if number(patched, "version_id") != number(tr, "version_id") || patched["symbol"] != "ETH" {
		t.Fatal(patched)
	}
	call(t, s, "PATCH", path, `{"stop":100}`, 400)
	call(t, s, "PATCH", path, `{"stop":105}`, 400)
	result := call(t, s, "GET", fmt.Sprintf("/api/versions/%d/stats", int64(number(tr, "version_id"))), "", 200)
	if number(items(result, "trades")[0].(map[string]any), "stop") != 95 {
		t.Fatal(result)
	}
}

func TestOverviewArchivedOldVersionsAndEmpty(t *testing.T) {
	_, s := setup(t)
	o := call(t, s, "GET", "/api/overview", "", 200)
	if o["last_equity"] != nil || object(o, "totals")["followed_rate"] != nil || len(items(o, "strategies")) != 0 || len(items(o, "open_trades")) != 0 {
		t.Fatal(o)
	}
	if number(object(o, "settings"), "risk_pct") != 1 || number(object(o, "settings"), "min_sample") != 30 {
		t.Fatal(o)
	}
	a := newStrategy(t, s)
	tr := newTrade(t, s, id(a))
	call(t, s, "POST", fmt.Sprintf("/api/trades/%d/close", id(tr)), `{"exit":110,"exit_reason":"target","followed_rules":true}`, 200)
	call(t, s, "POST", fmt.Sprintf("/api/strategies/%d/versions", id(a)), `{"rules":"第二版"}`, 201)
	tr = newTrade(t, s, id(a))
	call(t, s, "POST", fmt.Sprintf("/api/trades/%d/close", id(tr)), `{"exit":95,"exit_reason":"stop","followed_rules":false}`, 200)
	newTrade(t, s, id(a))
	call(t, s, "PATCH", fmt.Sprintf("/api/strategies/%d", id(a)), `{"archived":true}`, 200)
	o = call(t, s, "GET", "/api/overview", "", 200)
	totals := object(o, "totals")
	for key, want := range map[string]float64{"closed_n": 2, "open_n": 1, "total_r": 1, "followed_rate": 0.5, "violated_n": 1, "violated_r": -1, "strategies_n": 1, "versions_n": 2} {
		if number(totals, key) != want {
			t.Fatalf("%s: %v", key, totals)
		}
	}
	if number(o, "archived_n") != 1 || len(items(o, "strategies")) != 0 {
		t.Fatal(o)
	}
	open := items(o, "open_trades")[0].(map[string]any)
	if open["strategy_name"] != "趋势" || number(open, "version_no") != 2 || number(open, "risk_amount") != 100 {
		t.Fatal(open)
	}
	_, _, b := request(t, s, "GET", "/api/strategies", "", "Bearer t0ken", 200)
	if string(bytes.TrimSpace(b)) != "[]" {
		t.Fatalf("归档策略仍显示：%s", b)
	}
	_, _, b = request(t, s, "GET", "/api/strategies?archived=1", "", "Bearer t0ken", 200)
	var list []any
	if err := json.Unmarshal(b, &list); err != nil || len(list) != 1 {
		t.Fatalf("全部策略 %s %v", b, err)
	}
	detail := call(t, s, "GET", fmt.Sprintf("/api/strategies/%d", id(a)), "", 200)
	if len(items(detail, "versions")) != 2 {
		t.Fatal(detail)
	}
	for _, v := range items(detail, "versions") {
		if number(object(object(v.(map[string]any), "stats"), "summary"), "n") != 1 {
			t.Fatal(v)
		}
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
	a := newStrategy(t, s)
	call(t, s, "POST", "/api/strategies", `{"name":"趋势"}`, 409)
	for _, path := range []string{"/api/strategies/999", "/api/versions/999/stats", "/api/missing"} {
		call(t, s, "GET", path, "", 404)
	}
	call(t, s, "GET", "/api/strategies/abc", "", 400)
	tr := newTrade(t, s, id(a))
	path := fmt.Sprintf("/api/trades/%d", id(tr))
	call(t, s, "DELETE", path, "", 204)
	call(t, s, "DELETE", path, "", 404)
	call(t, s, "PATCH", path, `{"symbol":"ETH"}`, 404)
	call(t, s, "POST", path+"/close", `{"exit":110,"exit_reason":"target"}`, 404)
}

func TestJSONBodyAndLimit(t *testing.T) {
	_, s := setup(t)
	for _, body := range []string{"", "null", "[]", `{"name":`, `{"name":"a"} {}`, `{"name":"a","unknown":1}`, `{"name":"` + strings.Repeat("x", 10*1024*1024) + `"}`} {
		v := call(t, s, "POST", "/api/strategies", body, 400)
		if v["error"] != "请求格式不正确" {
			t.Fatal(v)
		}
	}
	body := `{"name":"合法","rules":"` + strings.Repeat("x", 1024) + `"}`
	call(t, s, "POST", "/api/strategies", body, 201)
}

func TestConcurrentHTTPClose(t *testing.T) {
	_, s := setup(t)
	a := newStrategy(t, s)
	tr := newTrade(t, s, id(a))
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

func TestJSONNamesAndUTCTimes(t *testing.T) {
	_, s := setup(t)
	a := newStrategy(t, s)
	tr := newTrade(t, s, id(a))
	for _, v := range []map[string]any{a, object(a, "current_version"), tr} {
		for key := range v {
			if strings.ContainsFunc(key, unicode.IsUpper) {
				t.Fatalf("字段不是 snake_case：%s", key)
			}
		}
	}
	for _, v := range []string{a["created_at"].(string), tr["opened_at"].(string)} {
		at, err := time.Parse(time.RFC3339, v)
		if err != nil || !strings.HasSuffix(v, "Z") || at.Location() != time.UTC {
			t.Fatalf("时间格式 %s %v", v, err)
		}
	}
}

func TestMonthly(t *testing.T) {
	st, s := setup(t)
	a := newStrategy(t, s)
	b := call(t, s, "POST", "/api/strategies", `{"name":"反转","rules":"背离"}`, 201)
	closeAt := func(strategy int64, exit float64, followed bool) int64 {
		tr := newTrade(t, s, strategy)
		call(t, s, "POST", fmt.Sprintf("/api/trades/%d/close", id(tr)), fmt.Sprintf(`{"exit":%v,"exit_reason":"manual","followed_rules":%v}`, exit, followed), 200)
		return id(tr)
	}
	// 入场 100、止损 95：出场 110 为 +2R，95 为 -1R，90 为 -2R。
	win := closeAt(id(a), 110, true)
	loss := closeAt(id(a), 95, true)
	// 旧版本与新版本的交易合并到同一策略。
	call(t, s, "POST", fmt.Sprintf("/api/strategies/%d/versions", id(a)), `{"rules":"新规则"}`, 201)
	win2 := closeAt(id(a), 105, true)
	bad := closeAt(id(b), 90, false)
	edge := closeAt(id(b), 110, true)
	prev := closeAt(id(b), 110, true)
	newTrade(t, s, id(a)) // 持仓中，不计入。
	call(t, s, "PATCH", fmt.Sprintf("/api/strategies/%d", id(b)), `{"archived":true}`, 200)

	d, err := st.Export()
	if err != nil {
		t.Fatal(err)
	}
	from, to := time.Date(2026, 10, 31, 16, 0, 0, 0, time.UTC), time.Date(2026, 11, 30, 16, 0, 0, 0, time.UTC)
	at := map[int64]time.Time{win: from, loss: from.Add(time.Hour), win2: from.Add(2 * time.Hour), bad: from.Add(3 * time.Hour), edge: to, prev: from.Add(-time.Second)}
	for i := range d.Trades {
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
	rows := items(m, "strategies")
	if len(rows) != 2 {
		t.Fatal(rows)
	}
	first, second := rows[0].(map[string]any), rows[1].(map[string]any)
	if first["name"] != "趋势" || number(first, "n") != 3 || number(first, "total_r") != 2 || first["archived"] != false ||
		second["name"] != "反转" || number(second, "n") != 1 || number(second, "total_r") != -2 || second["archived"] != true {
		t.Fatal(rows)
	}
	empty := call(t, s, "GET", "/api/monthly?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z", "", 200)
	if number(empty, "n") != 0 || empty["followed_rate"] != nil || len(items(empty, "strategies")) != 0 {
		t.Fatal(empty)
	}
	for _, q := range []string{"", "?from=2026-11-01T00:00:00Z", "?from=x&to=y", "?from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z"} {
		call(t, s, "GET", "/api/monthly"+q, "", 400)
	}
}

func TestPhaseSplitAndReadonly(t *testing.T) {
	_, s := setup(t)
	a := newStrategy(t, s)
	call(t, s, "POST", "/api/trades", fmt.Sprintf(`{"strategy_id":%d,"symbol":"btc","side":"long","entry":100,"stop":95,"equity":10000,"risk_pct":1,"entry_reason":"突破"}`, id(a)), 400)
	call(t, s, "POST", "/api/trades", fmt.Sprintf(`{"strategy_id":%d,"symbol":"btc","side":"long","entry":100,"stop":95,"equity":10000,"risk_pct":1,"entry_reason":"突破","phase":"top"}`, id(a)), 400)
	early := newTrade(t, s, id(a))
	late := call(t, s, "POST", "/api/trades", fmt.Sprintf(`{"strategy_id":%d,"symbol":"eth","side":"long","entry":100,"stop":95,"equity":10000,"risk_pct":1,"entry_reason":"末端追","phase":"late"}`, id(a)), 201)
	newTrade(t, s, id(a))
	call(t, s, "POST", fmt.Sprintf("/api/trades/%d/close", id(early)), `{"exit":110,"exit_reason":"target","followed_rules":true,"high":112,"low":99}`, 200)
	call(t, s, "POST", fmt.Sprintf("/api/trades/%d/close", id(late)), `{"exit":95,"exit_reason":"stop","followed_rules":true}`, 200)
	// 补丁不接受阶段字段，开仓后阶段只读。
	call(t, s, "PATCH", fmt.Sprintf("/api/trades/%d", id(late)), `{"phase":"early"}`, 400)
	result := call(t, s, "GET", fmt.Sprintf("/api/versions/%d/stats", int64(number(early, "version_id"))), "", 200)
	phases := items(result, "phases")
	if len(phases) != 4 {
		t.Fatal(phases)
	}
	want := []struct {
		phase string
		n     float64
		e     float64
		q     float64
	}{{"early", 1, 2, 1}, {"mid", 0, 0, 0}, {"late", 1, -1, 0}, {"unsure", 0, 0, 0}}
	for i, w := range want {
		p := phases[i].(map[string]any)
		if p["phase"] != w.phase || number(p, "n") != w.n || number(p, "expectancy") != w.e || number(p, "quality_n") != w.q {
			t.Fatalf("%d：%v", i, p)
		}
	}
	if items(result, "trades")[0].(map[string]any)["phase"] == nil {
		t.Fatal("交易缺少阶段")
	}
}
