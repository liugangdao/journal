package store

import (
	"database/sql"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/liugangdao/journal/internal/stats"
)

type OpenInput struct {
	StrategyID  int64      `json:"strategy_id"`
	Symbol      string     `json:"symbol"`
	Side        stats.Side `json:"side"`
	Entry       float64    `json:"entry"`
	Stop        float64    `json:"stop"`
	Equity      float64    `json:"equity"`
	RiskPct     float64    `json:"risk_pct"`
	Qty         float64    `json:"qty"`
	EntryReason string     `json:"entry_reason"`
}
type CloseInput struct {
	Exit          float64  `json:"exit"`
	ExitReason    string   `json:"exit_reason"`
	FollowedRules bool     `json:"followed_rules"`
	ReviewNote    string   `json:"review_note"`
	High          *float64 `json:"high"`
	Low           *float64 `json:"low"`
	Funding       *float64 `json:"funding"`
}
type TradePatch struct {
	Clear         []string    `json:"clear"`
	Symbol        *string     `json:"symbol"`
	Side          *stats.Side `json:"side"`
	Entry         *float64    `json:"entry"`
	Stop          *float64    `json:"stop"`
	Equity        *float64    `json:"equity"`
	RiskPct       *float64    `json:"risk_pct"`
	Qty           *float64    `json:"qty"`
	EntryReason   *string     `json:"entry_reason"`
	Exit          *float64    `json:"exit"`
	ExitReason    *string     `json:"exit_reason"`
	FollowedRules *bool       `json:"followed_rules"`
	ReviewNote    *string     `json:"review_note"`
	High          *float64    `json:"high"`
	Low           *float64    `json:"low"`
	Funding       *float64    `json:"funding"`
}
type Trade struct {
	ID            int64      `json:"id"`
	VersionID     int64      `json:"version_id"`
	Symbol        string     `json:"symbol"`
	Side          stats.Side `json:"side"`
	Entry         float64    `json:"entry"`
	Stop          float64    `json:"stop"`
	Equity        float64    `json:"equity"`
	RiskPct       float64    `json:"risk_pct"`
	Qty           float64    `json:"qty"`
	EntryReason   string     `json:"entry_reason"`
	OpenedAt      time.Time  `json:"opened_at"`
	Status        string     `json:"status"`
	Exit          *float64   `json:"exit"`
	ExitReason    *string    `json:"exit_reason"`
	FollowedRules *bool      `json:"followed_rules"`
	ReviewNote    string     `json:"review_note"`
	High          *float64   `json:"high"`
	Low           *float64   `json:"low"`
	Funding       *float64   `json:"funding"`
	ClosedAt      *time.Time `json:"closed_at"`
}
type TradeFilter struct {
	VersionID *int64 `json:"version_id"`
	Status    string `json:"status"`
}

func validateOpen(t *Trade) error {
	t.Symbol = strings.ToUpper(strings.TrimSpace(t.Symbol))
	t.EntryReason = strings.TrimSpace(t.EntryReason)
	if t.Symbol == "" || t.EntryReason == "" {
		return invalidError("品种和入场理由不能为空")
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
	return nil
}

func validateClose(t Trade) error {
	if t.Exit == nil || !positive(*t.Exit) {
		return invalidError("出场价必须是大于 0 的有限数字")
	}
	if t.ExitReason == nil || (*t.ExitReason != "stop" && *t.ExitReason != "target" && *t.ExitReason != "manual") {
		return invalidError("出场原因只能是 stop、target 或 manual")
	}
	if t.FollowedRules == nil {
		return invalidError("平仓必须填写是否按规则执行")
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

func validateTrade(t *Trade) error {
	if err := validateOpen(t); err != nil {
		return err
	}
	if t.OpenedAt.IsZero() {
		return invalidError("开仓时间不能为空")
	}
	t.OpenedAt = t.OpenedAt.UTC()
	switch t.Status {
	case "open":
		if t.Exit != nil || t.ExitReason != nil || t.FollowedRules != nil || t.ClosedAt != nil || t.High != nil || t.Low != nil || t.Funding != nil || t.ReviewNote != "" {
			return invalidError("持仓中的交易不能包含平仓字段")
		}
	case "closed":
		if err := validateClose(*t); err != nil {
			return err
		}
		if t.ClosedAt == nil || t.ClosedAt.IsZero() || t.ClosedAt.Before(t.OpenedAt) {
			return invalidError("平仓时间不能为空且不得早于开仓时间")
		}
		utc := t.ClosedAt.UTC()
		t.ClosedAt = &utc
	default:
		return invalidError("交易状态只能是 open 或 closed")
	}
	return nil
}

const tradeColumns = "id,version_id,symbol,side,entry,stop,equity,risk_pct,qty,entry_reason,opened_at,status,exit,exit_reason,followed_rules,review_note,high,low,funding,closed_at"
const tradeValues = "?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?"

func scanTrade(row scanner) (Trade, error) {
	var t Trade
	var opened string
	var closed *string
	err := row.Scan(&t.ID, &t.VersionID, &t.Symbol, &t.Side, &t.Entry, &t.Stop, &t.Equity, &t.RiskPct, &t.Qty, &t.EntryReason, &opened, &t.Status, &t.Exit, &t.ExitReason, &t.FollowedRules, &t.ReviewNote, &t.High, &t.Low, &t.Funding, &closed)
	if err != nil {
		return t, dbError(err)
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
	return []any{t.ID, t.VersionID, t.Symbol, t.Side, t.Entry, t.Stop, t.Equity, t.RiskPct, t.Qty, t.EntryReason, timestamp(t.OpenedAt), t.Status, t.Exit, t.ExitReason, t.FollowedRules, t.ReviewNote, t.High, t.Low, t.Funding, closed}
}
func getTrade(q querier, id int64) (Trade, error) {
	return scanTrade(q.QueryRow("SELECT "+tradeColumns+" FROM trades WHERE id=?", id))
}

func (s *Store) OpenTrade(in OpenInput) (Trade, error) {
	t := Trade{Symbol: in.Symbol, Side: in.Side, Entry: in.Entry, Stop: in.Stop, Equity: in.Equity, RiskPct: in.RiskPct, Qty: in.Qty, EntryReason: in.EntryReason, OpenedAt: now(), Status: "open"}
	if t.Qty == 0 {
		t.Qty = stats.SuggestQty(t.Equity, t.RiskPct, t.Entry, t.Stop)
	}
	if err := validateTrade(&t); err != nil {
		return t, err
	}
	err := s.transaction(func(tx *sql.Tx) error {
		a, err := getStrategy(tx, in.StrategyID)
		if err != nil {
			return err
		}
		if a.Archived {
			return invalidError("已归档策略不能开新仓")
		}
		v, err := currentVersion(tx, in.StrategyID)
		if err != nil {
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

func saveTrade(q querier, t Trade) error {
	args := tradeArgs(t)
	// 版本、开仓时间及状态只能由专用操作设置，补丁不能改变这些字段。
	args = append(args[2:], t.ID)
	_, err := q.Exec("UPDATE trades SET symbol=?,side=?,entry=?,stop=?,equity=?,risk_pct=?,qty=?,entry_reason=?,opened_at=?,status=?,exit=?,exit_reason=?,followed_rules=?,review_note=?,high=?,low=?,funding=?,closed_at=? WHERE id=?", args...)
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
		closed := now()
		t.Status = "closed"
		t.Exit = &in.Exit
		t.ExitReason = &in.ExitReason
		t.FollowedRules = &in.FollowedRules
		t.ReviewNote = in.ReviewNote
		t.High = in.High
		t.Low = in.Low
		t.Funding = in.Funding
		t.ClosedAt = &closed
		if err = validateTrade(&t); err != nil {
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
		if p.FollowedRules != nil {
			t.FollowedRules = p.FollowedRules
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
		if err = validateTrade(&t); err != nil {
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
