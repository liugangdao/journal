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

func (a *api) strategies(w http.ResponseWriter, r *http.Request) {
	s, err := loadSnapshot(a.store)
	if err != nil {
		writeError(w, err)
		return
	}
	vs := []strategyView{}
	for _, strategy := range s.dump.Strategies {
		if !strategy.Archived || r.URL.Query().Get("archived") == "1" {
			vs = append(vs, s.strategyView(strategy))
		}
	}
	writeJSON(w, http.StatusOK, vs)
}

func (a *api) createStrategy(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
		store.VersionInput
	}
	if !readJSON(w, r, &in) {
		return
	}
	strategy, v, err := a.store.CreateStrategy(in.Name, in.VersionInput)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		store.Strategy
		CurrentVersion store.Version `json:"current_version"`
	}{strategy, v})
}

func (a *api) strategy(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	s, err := loadSnapshot(a.store)
	if err != nil {
		writeError(w, err)
		return
	}
	strategy, ok := s.strategies[id]
	if !ok {
		writeError(w, store.ErrNotFound)
		return
	}
	out := strategyDetail{Strategy: strategy, Versions: []versionView{}}
	for _, v := range s.dump.Versions {
		if v.StrategyID == id {
			out.Versions = append(out.Versions, versionView{Version: v, Stats: s.compute(v)})
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *api) updateStrategy(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Name     *string `json:"name"`
		Archived *bool   `json:"archived"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	v, err := a.store.UpdateStrategy(id, in.Name, in.Archived)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (a *api) createVersion(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in store.VersionInput
	if !readJSON(w, r, &in) {
		return
	}
	v, err := a.store.CreateVersion(id, in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, v)
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
	out := versionDetail{Version: v, Strategy: s.strategies[v.StrategyID], Stats: s.compute(v), Trades: []tradeView{}}
	for _, t := range s.trades[id] {
		out.Trades = append(out.Trades, viewTrade(t))
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
	writeJSON(w, http.StatusCreated, viewTrade(v))
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
	writeJSON(w, http.StatusOK, viewTrade(v))
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
	writeJSON(w, http.StatusOK, viewTrade(v))
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
