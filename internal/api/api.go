package api

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/liugangdao/journal/internal/store"
)

type api struct{ store *store.Store }

func New(s *store.Store, token string, web fs.FS) http.Handler {
	a := &api{store: s}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/overview", a.overview)
	mux.HandleFunc("GET /api/strategies", a.strategies)
	mux.HandleFunc("POST /api/strategies", a.createStrategy)
	mux.HandleFunc("GET /api/strategies/{id}", a.strategy)
	mux.HandleFunc("PATCH /api/strategies/{id}", a.updateStrategy)
	mux.HandleFunc("POST /api/strategies/{id}/versions", a.createVersion)
	mux.HandleFunc("GET /api/versions/{id}/stats", a.versionStats)
	mux.HandleFunc("POST /api/trades", a.openTrade)
	mux.HandleFunc("POST /api/trades/{id}/close", a.closeTrade)
	mux.HandleFunc("PATCH /api/trades/{id}", a.updateTrade)
	mux.HandleFunc("DELETE /api/trades/{id}", a.deleteTrade)
	mux.HandleFunc("GET /api/settings", a.getSettings)
	mux.HandleFunc("PUT /api/settings", a.putSettings)
	mux.HandleFunc("GET /api/export", a.export)
	mux.HandleFunc("POST /api/import", a.importDump)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { writeError(w, store.ErrNotFound) })
	var files http.Handler
	var etags map[string]string
	if web != nil {
		files = http.FileServer(http.FS(web))
		etags = contentETags(web)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			provided, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !ok || token == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
				w.Header().Set("WWW-Authenticate", "Bearer")
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "未授权"})
				return
			}
			mux.ServeHTTP(w, r)
			return
		}
		if files == nil {
			writeError(w, store.ErrNotFound)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "请求方法不支持"})
			return
		}
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		info, err := fs.Stat(web, name)
		if err != nil || info.IsDir() {
			// 交给文件服务器发送首页，保留内容类型、HEAD 及缓存语义。
			r = r.Clone(r.Context())
			r.URL.Path = "/"
			name = "index.html"
		}
		// 每次向服务器确认是否有更新，内容未变时只返回 304；
		// 否则 Cloudflare 和浏览器会按默认规则缓存数小时，更新后看不到新前端。
		w.Header().Set("Cache-Control", "no-cache")
		if etag, ok := etags[name]; ok {
			w.Header().Set("ETag", etag)
		}
		files.ServeHTTP(w, r)
	})
}

// contentETags 按文件内容计算 ETag。内嵌文件没有修改时间，只能用内容判断是否变化。
func contentETags(web fs.FS) map[string]string {
	etags := map[string]string{}
	_ = fs.WalkDir(web, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if b, err := fs.ReadFile(web, name); err == nil {
			sum := sha256.Sum256(b)
			etags[name] = `"` + hex.EncodeToString(sum[:8]) + `"`
		}
		return nil
	})
	return etags
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		status = http.StatusInternalServerError
		b = []byte(`{"error":"响应数据无法编码"}`)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(append(b, '\n'))
}

func writeError(w http.ResponseWriter, err error) {
	status, msg := http.StatusInternalServerError, "内部服务错误"
	var invalid *store.InvalidError
	switch {
	case errors.As(err, &invalid):
		status, msg = http.StatusBadRequest, invalid.Msg
	case errors.Is(err, store.ErrNotFound):
		status, msg = http.StatusNotFound, err.Error()
	case errors.Is(err, store.ErrConflict):
		status, msg = http.StatusConflict, err.Error()
	}
	writeJSON(w, status, map[string]string{"error": msg})
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024*1024)
	b, err := io.ReadAll(r.Body)
	b = bytes.TrimSpace(b)
	if err == nil && len(b) > 0 && b[0] == '{' {
		dec := json.NewDecoder(bytes.NewReader(b))
		dec.DisallowUnknownFields()
		if err = dec.Decode(v); err == nil {
			var extra any
			if dec.Decode(&extra) == io.EOF {
				return true
			}
		}
	}
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请求格式不正确"})
	return false
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, &store.InvalidError{Msg: "记录编号必须是正整数"})
		return 0, false
	}
	return id, true
}
