package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/liugangdao/journal/internal/rules"
	"github.com/liugangdao/journal/internal/stats"
)

type OpenInput struct {
	Symbol      string          `json:"symbol"`
	Side        stats.Side      `json:"side"`
	Entry       float64         `json:"entry"`
	Stop        float64         `json:"stop"`
	Equity      float64         `json:"equity"`
	RiskPct     float64         `json:"risk_pct"`
	Qty         float64         `json:"qty"`
	EntryReason string          `json:"entry_reason"`
	Phase       string          `json:"phase"`
	Setup       string          `json:"setup"`
	KeyLevel    float64         `json:"key_level"`
	ExitPlan    string          `json:"exit_plan"`
	Target      *float64        `json:"target"`
	Checklist   rules.Checklist `json:"checklist"`
}
type CloseInput struct {
	Exit       float64  `json:"exit"`
	ExitReason string   `json:"exit_reason"`
	ReviewNote string   `json:"review_note"`
	High       *float64 `json:"high"`
	Low        *float64 `json:"low"`
	Funding    *float64 `json:"funding"`
	Deviations []string `json:"deviations"`
}

// TradePatch 不包含清单相关字段和趋势阶段：它们在开仓时定下，之后不可修改。
type TradePatch struct {
	Clear       []string    `json:"clear"`
	Symbol      *string     `json:"symbol"`
	Side        *stats.Side `json:"side"`
	Entry       *float64    `json:"entry"`
	Stop        *float64    `json:"stop"`
	Equity      *float64    `json:"equity"`
	RiskPct     *float64    `json:"risk_pct"`
	Qty         *float64    `json:"qty"`
	EntryReason *string     `json:"entry_reason"`
	Exit        *float64    `json:"exit"`
	ExitReason  *string     `json:"exit_reason"`
	ReviewNote  *string     `json:"review_note"`
	High        *float64    `json:"high"`
	Low         *float64    `json:"low"`
	Funding     *float64    `json:"funding"`
	Deviations  *[]string   `json:"deviations"`
}
type Trade struct {
	ID          int64           `json:"id"`
	VersionID   int64           `json:"version_id"`
	Symbol      string          `json:"symbol"`
	Side        stats.Side      `json:"side"`
	Entry       float64         `json:"entry"`
	Stop        float64         `json:"stop"`
	Equity      float64         `json:"equity"`
	RiskPct     float64         `json:"risk_pct"`
	Qty         float64         `json:"qty"`
	EntryReason string          `json:"entry_reason"`
	Phase       string          `json:"phase"`
	Setup       string          `json:"setup"`
	KeyLevel    float64         `json:"key_level"` // 做空为主要高点，做多为主要低点
	ExitPlan    string          `json:"exit_plan"`
	Target      *float64        `json:"target"`
	Checklist   rules.Checklist `json:"checklist"`
	OpenedAt    time.Time       `json:"opened_at"`
	Status      string          `json:"status"`
	Exit        *float64        `json:"exit"`
	ExitReason  *string         `json:"exit_reason"`
	// FollowedRules 由后端按清单和偏差计算，已平仓时才有值。
	FollowedRules *bool      `json:"followed_rules"`
	ReviewNote    string     `json:"review_note"`
	High          *float64   `json:"high"`
	Low           *float64   `json:"low"`
	Funding       *float64   `json:"funding"`
	Deviations    []string   `json:"deviations"`
	ClosedAt      *time.Time `json:"closed_at"`
}
type TradeFilter struct {
	VersionID *int64 `json:"version_id"`
	Status    string `json:"status"`
}

// 趋势阶段在开仓时选定，之后不可修改，避免按结果回头改判断。
var Phases = []string{"early", "mid", "late", "unsure"}

func oneOf(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func validateOpen(t *Trade, def rules.Version) error {
	t.Symbol = strings.ToUpper(strings.TrimSpace(t.Symbol))
	t.EntryReason = strings.TrimSpace(t.EntryReason)
	if t.Symbol == "" {
		return invalidError("品种不能为空")
	}
	if !oneOf(Phases, t.Phase) {
		return invalidError("请选择开仓时的趋势阶段")
	}
	if !positive(t.Entry) || !positive(t.Stop) || !positive(t.Equity) || !positive(t.RiskPct) || !positive(t.Qty) {
		return invalidError("价格、权益、风险比例和数量必须是大于 0 的有限数字")
	}
	switch t.Side {
	case stats.Long:
		if t.Stop >= t.Entry {
			return invalidError("做多止损必须低于入场价")
		}
	case stats.Short:
		if t.Stop <= t.Entry {
			return invalidError("做空止损必须高于入场价")
		}
	default:
		return invalidError("交易方向只能是 long 或 short")
	}
	if !positive(t.Qty * math.Abs(t.Entry-t.Stop)) {
		return invalidError("风险金额超出可计算范围")
	}
	if !positive(t.KeyLevel) {
		return invalidError("请填写主要高点或主要低点的价格")
	}
	if !oneOf(rules.ExitPlans, t.ExitPlan) {
		return invalidError("请选择出场计划")
	}
	if t.Target != nil {
		if t.ExitPlan != "measured_move" {
			return invalidError("只有 measured move 出场才填写目标价")
		}
		if !positive(*t.Target) {
			return invalidError("目标价必须是大于 0 的有限数字")
		}
	}
	c, err := def.Normalize(t.Setup, t.Checklist)
	if err != nil {
		return invalidError(err.Error())
	}
	t.Checklist = c
	return nil
}

func validateClose(t Trade) error {
	if t.Exit == nil || !positive(*t.Exit) {
		return invalidError("出场价必须是大于 0 的有限数字")
	}
	if t.ExitReason == nil || (*t.ExitReason != "stop" && *t.ExitReason != "target" && *t.ExitReason != "manual") {
		return invalidError("出场原因只能是 stop、target 或 manual")
	}
	if (t.High != nil && !positive(*t.High)) || (t.Low != nil && !positive(*t.Low)) {
		return invalidError("最高价和最低价必须是大于 0 的有限数字")
	}
	if t.High != nil && t.Low != nil && *t.High < *t.Low {
		return invalidError("最高价不得低于最低价")
	}
	if t.Funding != nil && !finite(*t.Funding) {
		return invalidError("资金费必须是有限数字")
	}
	c := stats.ClosedTrade{Side: t.Side, Entry: t.Entry, Stop: t.Stop, Qty: t.Qty, Exit: *t.Exit, High: t.High, Low: t.Low}
	if t.Funding != nil {
		c.Funding = *t.Funding
	}
	if !finite(stats.RMultiple(c)) {
		return invalidError("盈亏超出可计算范围")
	}
	if mfe, mae, ok := stats.Excursions(c); ok && (!finite(mfe) || !finite(mae) || !finite(mfe-stats.RMultiple(c))) {
		return invalidError("浮盈浮亏超出可计算范围")
	}
	return nil
}

// Violations 返回这笔交易的违规项：持仓中只有开仓违规，平仓后还包括执行偏差。
func Violations(t Trade, def rules.Version) []string {
	return def.Violations(string(t.Side), t.Setup, t.Checklist, t.Deviations)
}

// validateTrade 校验并规范化交易，已平仓时重新计算是否按规则执行，忽略调用方给出的值。
func validateTrade(t *Trade, def rules.Version) error {
	if err := validateOpen(t, def); err != nil {
		return err
	}
	if t.OpenedAt.IsZero() {
		return invalidError("开仓时间不能为空")
	}
	t.OpenedAt = t.OpenedAt.UTC()
	if t.Deviations == nil {
		t.Deviations = []string{}
	}
	switch t.Status {
	case "open":
		if t.Exit != nil || t.ExitReason != nil || t.ClosedAt != nil || t.High != nil || t.Low != nil || t.Funding != nil || t.ReviewNote != "" || len(t.Deviations) > 0 {
			return invalidError("持仓中的交易不能包含平仓字段")
		}
		t.FollowedRules = nil
	case "closed":
		if err := validateClose(*t); err != nil {
			return err
		}
		if err := def.ValidDeviations(t.Deviations); err != nil {
			return invalidError(err.Error())
		}
		if t.ClosedAt == nil || t.ClosedAt.IsZero() || t.ClosedAt.Before(t.OpenedAt) {
			return invalidError("平仓时间不能为空且不得早于开仓时间")
		}
		utc := t.ClosedAt.UTC()
		t.ClosedAt = &utc
		followed := len(Violations(*t, def)) == 0
		t.FollowedRules = &followed
	default:
		return invalidError("交易状态只能是 open 或 closed")
	}
	return nil
}

const tradeColumns = "id,version_id,symbol,side,entry,stop,equity,risk_pct,qty,entry_reason,phase,setup,key_level,exit_plan,target,checklist,opened_at,status,exit,exit_reason,followed_rules,review_note,high,low,funding,deviations,closed_at"
const tradeValues = "?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?"

func scanTrade(row scanner) (Trade, error) {
	var t Trade
	var opened, checklist, deviations string
	var closed *string
	err := row.Scan(&t.ID, &t.VersionID, &t.Symbol, &t.Side, &t.Entry, &t.Stop, &t.Equity, &t.RiskPct, &t.Qty, &t.EntryReason, &t.Phase, &t.Setup, &t.KeyLevel, &t.ExitPlan, &t.Target, &checklist, &opened, &t.Status, &t.Exit, &t.ExitReason, &t.FollowedRules, &t.ReviewNote, &t.High, &t.Low, &t.Funding, &deviations, &closed)
	if err != nil {
		return t, dbError(err)
	}
	if json.Unmarshal([]byte(checklist), &t.Checklist) != nil || json.Unmarshal([]byte(deviations), &t.Deviations) != nil {
		return t, errors.New("数据库中的清单格式不正确")
	}
	if t.Deviations == nil {
		t.Deviations = []string{}
	}
	t.OpenedAt, err = parseTime(opened)
	if err != nil {
		return t, err
	}
	if closed != nil {
		at, err := parseTime(*closed)
		if err != nil {
			return t, err
		}
		t.ClosedAt = &at
	}
	return t, nil
}
func tradeArgs(t Trade) []any {
	var closed any
	if t.ClosedAt != nil {
		closed = timestamp(*t.ClosedAt)
	}
	checklist, _ := json.Marshal(t.Checklist)
	deviations, _ := json.Marshal(t.Deviations)
	return []any{t.ID, t.VersionID, t.Symbol, t.Side, t.Entry, t.Stop, t.Equity, t.RiskPct, t.Qty, t.EntryReason, t.Phase, t.Setup, t.KeyLevel, t.ExitPlan, t.Target, string(checklist), timestamp(t.OpenedAt), t.Status, t.Exit, t.ExitReason, t.FollowedRules, t.ReviewNote, t.High, t.Low, t.Funding, string(deviations), closed}
}
func getTrade(q querier, id int64) (Trade, error) {
	return scanTrade(q.QueryRow("SELECT "+tradeColumns+" FROM trades WHERE id=?", id))
}

// OpenTrade 开仓并归入当前版本。清单未满足也照常保存，违规由统计按清单计算。
func (s *Store) OpenTrade(in OpenInput) (Trade, error) {
	t := Trade{Symbol: in.Symbol, Side: in.Side, Entry: in.Entry, Stop: in.Stop, Equity: in.Equity, RiskPct: in.RiskPct, Qty: in.Qty, EntryReason: in.EntryReason,
		Phase: in.Phase, Setup: in.Setup, KeyLevel: in.KeyLevel, ExitPlan: in.ExitPlan, Target: in.Target, Checklist: in.Checklist, OpenedAt: now(), Status: "open", Deviations: []string{}}
	if t.Qty == 0 {
		t.Qty = stats.SuggestQty(t.Equity, t.RiskPct, t.Entry, t.Stop)
	}
	err := s.transaction(func(tx *sql.Tx) error {
		v, err := currentVersion(tx)
		if err != nil {
			return err
		}
		def, err := s.versionDef(v.No)
		if err != nil {
			return err
		}
		if err := validateTrade(&t, def); err != nil {
			return err
		}
		t.VersionID = v.ID
		args := tradeArgs(t)
		args[0] = nil
		result, err := tx.Exec("INSERT INTO trades("+tradeColumns+") VALUES("+tradeValues+")", args...)
		if err != nil {
			return err
		}
		t.ID, err = result.LastInsertId()
		return err
	})
	return t, err
}

func (s *Store) tradeDef(q querier, t Trade) (rules.Version, error) {
	v, err := getVersion(q, t.VersionID)
	if err != nil {
		return rules.Version{}, err
	}
	return s.versionDef(v.No)
}

func saveTrade(q querier, t Trade) error {
	var closed any
	if t.ClosedAt != nil {
		closed = timestamp(*t.ClosedAt)
	}
	deviations, _ := json.Marshal(t.Deviations)
	// 版本、趋势阶段、清单字段和开仓时间只在开仓时写入，这里不更新。
	_, err := q.Exec("UPDATE trades SET symbol=?,side=?,entry=?,stop=?,equity=?,risk_pct=?,qty=?,entry_reason=?,status=?,exit=?,exit_reason=?,followed_rules=?,review_note=?,high=?,low=?,funding=?,deviations=?,closed_at=? WHERE id=?",
		t.Symbol, t.Side, t.Entry, t.Stop, t.Equity, t.RiskPct, t.Qty, t.EntryReason, t.Status, t.Exit, t.ExitReason, t.FollowedRules, t.ReviewNote, t.High, t.Low, t.Funding, string(deviations), closed, t.ID)
	return dbError(err)
}

func (s *Store) CloseTrade(id int64, in CloseInput) (Trade, error) {
	var t Trade
	err := s.transaction(func(tx *sql.Tx) error {
		var err error
		t, err = getTrade(tx, id)
		if err != nil {
			return err
		}
		if t.Status == "closed" {
			return ErrAlreadyClosed
		}
		def, err := s.tradeDef(tx, t)
		if err != nil {
			return err
		}
		closed := now()
		t.Status = "closed"
		t.Exit = &in.Exit
		t.ExitReason = &in.ExitReason
		t.ReviewNote = in.ReviewNote
		t.High = in.High
		t.Low = in.Low
		t.Funding = in.Funding
		t.Deviations = in.Deviations
		t.ClosedAt = &closed
		if err = validateTrade(&t, def); err != nil {
			return err
		}
		return saveTrade(tx, t)
	})
	return t, err
}

func replace[T any](dst *T, src *T) {
	if src != nil {
		*dst = *src
	}
}
func (s *Store) UpdateTrade(id int64, p TradePatch) (Trade, error) {
	var t Trade
	err := s.transaction(func(tx *sql.Tx) error {
		var err error
		t, err = getTrade(tx, id)
		if err != nil {
			return err
		}
		replace(&t.Symbol, p.Symbol)
		replace(&t.Side, p.Side)
		replace(&t.Entry, p.Entry)
		replace(&t.Stop, p.Stop)
		replace(&t.Equity, p.Equity)
		replace(&t.RiskPct, p.RiskPct)
		replace(&t.Qty, p.Qty)
		replace(&t.EntryReason, p.EntryReason)
		replace(&t.ReviewNote, p.ReviewNote)
		if p.Exit != nil {
			t.Exit = p.Exit
		}
		if p.ExitReason != nil {
			t.ExitReason = p.ExitReason
		}
		if p.Deviations != nil {
			t.Deviations = *p.Deviations
		}
		if p.High != nil {
			t.High = p.High
		}
		if p.Low != nil {
			t.Low = p.Low
		}
		if p.Funding != nil {
			t.Funding = p.Funding
		}
		// 清空优先于同一补丁中的赋值，随后统一校验，失败时不写入。
		for _, field := range p.Clear {
			switch field {
			case "high":
				t.High = nil
			case "low":
				t.Low = nil
			case "funding":
				t.Funding = nil
			case "review_note":
				t.ReviewNote = ""
			default:
				return invalidError("不允许清空字段：" + field)
			}
		}
		def, err := s.tradeDef(tx, t)
		if err != nil {
			return err
		}
		if err = validateTrade(&t, def); err != nil {
			return err
		}
		return saveTrade(tx, t)
	})
	return t, err
}

func (s *Store) DeleteTrade(id int64) error {
	result, err := s.db.Exec("DELETE FROM trades WHERE id=?", id)
	if err != nil {
		return dbError(err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return dbError(err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func listTrades(q querier, f TradeFilter) ([]Trade, error) {
	query := "SELECT " + tradeColumns + " FROM trades WHERE 1=1"
	args := []any{}
	if f.VersionID != nil {
		query += " AND version_id=?"
		args = append(args, *f.VersionID)
	}
	if f.Status != "" {
		if f.Status != "open" && f.Status != "closed" {
			return nil, invalidError("无效的交易状态筛选")
		}
		query += " AND status=?"
		args = append(args, f.Status)
	}
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	trs := []Trade{}
	for rows.Next() {
		t, err := scanTrade(rows)
		if err != nil {
			return nil, err
		}
		trs = append(trs, t)
	}
	if err = rows.Err(); err != nil {
		return nil, dbError(err)
	}
	// RFC3339 的小数秒长度可变，按解析后的时间排序而非文本排序。
	sort.Slice(trs, func(i, j int) bool {
		if trs[i].OpenedAt.Equal(trs[j].OpenedAt) {
			return trs[i].ID > trs[j].ID
		}
		return trs[i].OpenedAt.After(trs[j].OpenedAt)
	})
	return trs, nil
}
func (s *Store) ListTrades(f TradeFilter) ([]Trade, error) { return listTrades(s.db, f) }
func (s *Store) LastEquity() (float64, bool, error) {
	trs, err := s.ListTrades(TradeFilter{})
	if err != nil {
		return 0, false, err
	}
	if len(trs) == 0 {
		return 0, false, nil
	}
	return trs[0].Equity, true, nil
}
