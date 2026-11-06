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
	return call(t, s, "POST", "/api/trades", fmt.Sprintf(`{"strategy_id":%d,"symbol":"btc","side":"long","entry":100,"stop":95,"equity":10000,"risk_pct":1,"qty":0,"entry_reason":"突破"}`, strategy), 201)
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
		body := fmt.Sprintf(`{"strategy_id":%d,"symbol":"BTC","side":"long","stop":95,"equity":10000,"risk_pct":1,"entry_reason":"突破",%s}`, id(a), field)
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
