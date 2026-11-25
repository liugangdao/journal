package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/liugangdao/journal/internal/store"
)

func (a *api) overview(w http.ResponseWriter, r *http.Request) {
	s, err := loadSnapshot(a.store)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.overview())
}

// monthly 的月份边界由前端按浏览器时区算好传入，服务端只按时间段筛选。
func (a *api) monthly(w http.ResponseWriter, r *http.Request) {
	from, err1 := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	to, err2 := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	if err1 != nil || err2 != nil || !to.After(from) {
		writeError(w, &store.InvalidError{Msg: "统计时间范围不合法"})
		return
	}
	s, err := loadSnapshot(a.store)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.monthly(from.UTC(), to.UTC()))
}

func (a *api) strategy(w http.ResponseWriter, r *http.Request) {
	s, err := loadSnapshot(a.store)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.strategy())
}

func (a *api) versionStats(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	s, err := loadSnapshot(a.store)
	if err != nil {
		writeError(w, err)
		return
	}
	v, ok := s.versions[id]
	if !ok {
		writeError(w, store.ErrNotFound)
		return
	}
	out := versionDetail{Version: v, Definition: s.versionDef(v), Report: s.report(v), Trades: []tradeView{}}
	for _, t := range s.trades[id] {
		out.Trades = append(out.Trades, s.viewTrade(t))
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *api) openTrade(w http.ResponseWriter, r *http.Request) {
	var in store.OpenInput
	if !readJSON(w, r, &in) {
		return
	}
	v, err := a.store.OpenTrade(in)
	if err != nil {
		writeError(w, err)
		return
	}
	a.writeTrade(w, http.StatusCreated, v)
}

func (a *api) closeTrade(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in store.CloseInput
	if !readJSON(w, r, &in) {
		return
	}
	v, err := a.store.CloseTrade(id, in)
	if err != nil {
		writeError(w, err)
		return
	}
	a.writeTrade(w, http.StatusOK, v)
}

func (a *api) updateTrade(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		store.TradePatch
		VersionID json.RawMessage `json:"version_id"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	// 兼容带版本编号的客户端补丁，但永不使用该编号改写交易归属。
	v, err := a.store.UpdateTrade(id, in.TradePatch)
	if err != nil {
		writeError(w, err)
		return
	}
	a.writeTrade(w, http.StatusOK, v)
}

func (a *api) deleteTrade(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := a.store.DeleteTrade(id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) calibrations(w http.ResponseWriter, r *http.Request) {
	v, err := a.store.ListCalibrations()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (a *api) calibrate(w http.ResponseWriter, r *http.Request) {
	var in store.CalibrationInput
	if !readJSON(w, r, &in) {
		return
	}
	v, err := a.store.Calibrate(in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func (a *api) getSettings(w http.ResponseWriter, r *http.Request) {
	v, err := a.store.GetSettings()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}
func (a *api) putSettings(w http.ResponseWriter, r *http.Request) {
	var in store.Settings
	if !readJSON(w, r, &in) {
		return
	}
	if err := a.store.PutSettings(in); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, in)
}

func (a *api) export(w http.ResponseWriter, r *http.Request) {
	v, err := a.store.Export()
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="journal-`+time.Now().UTC().Format("20060102")+`.json"`)
	writeJSON(w, http.StatusOK, v)
}

func (a *api) importDump(w http.ResponseWriter, r *http.Request) {
	var in store.Dump
	if !readJSON(w, r, &in) {
		return
	}
	if in.Strategies == nil || in.Versions == nil || in.Trades == nil {
		writeError(w, &store.InvalidError{Msg: "备份必须包含策略、版本和交易数组"})
		return
	}
	if err := a.store.Import(in); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *api) writeTrade(w http.ResponseWriter, status int, t store.Trade) {
	def, err := a.store.VersionDef(t.VersionID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, status, viewTrade(t, def))
}
