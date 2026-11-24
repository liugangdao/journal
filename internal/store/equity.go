package store

import (
	"database/sql"
	"time"

	"github.com/liugangdao/journal/internal/stats"
)

// Calibration 是用户核对过的账户余额。Delta 为校准前推算权益与实际余额的差，首次校准没有差额。
type Calibration struct {
	ID        int64     `json:"id"`
	Balance   float64   `json:"balance"`
	Delta     *float64  `json:"delta"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}
type CalibrationInput struct {
	Balance float64 `json:"balance"`
	Reason  string  `json:"reason"`
}

const reasonInitial = "initial"

func validAdjustReason(r string) bool {
	return r == "cash_flow" || r == "missed_trade" || r == "fee" || r == "other"
}

func listCalibrations(q querier) ([]Calibration, error) {
	rows, err := q.Query("SELECT id,balance,delta,reason,created_at FROM equity_calibrations ORDER BY id DESC")
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	out := []Calibration{}
	for rows.Next() {
		var c Calibration
		var created string
		if err = rows.Scan(&c.ID, &c.Balance, &c.Delta, &c.Reason, &created); err != nil {
			return nil, dbError(err)
		}
		if c.CreatedAt, err = parseTime(created); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if err = rows.Err(); err != nil {
		return nil, dbError(err)
	}
	return out, nil
}

// ComputeEquity 以最新校准（列表第一条）为基准，加上其后平仓交易的盈亏。
// 校准前的交易已体现在核对过的余额中，修改它们不影响当前权益。
func ComputeEquity(calibrations []Calibration, trades []Trade) (float64, bool) {
	if len(calibrations) == 0 {
		return 0, false
	}
	latest := calibrations[0]
	equity := latest.Balance
	for _, t := range trades {
		if t.Status != "closed" || !t.ClosedAt.After(latest.CreatedAt) {
			continue
		}
		c := stats.ClosedTrade{Side: t.Side, Entry: t.Entry, Stop: t.Stop, Qty: t.Qty, Exit: *t.Exit}
		if t.Funding != nil {
			c.Funding = *t.Funding
		}
		equity += stats.PnL(c)
	}
	return equity, finite(equity)
}

func (s *Store) ListCalibrations() ([]Calibration, error) { return listCalibrations(s.db) }

func (s *Store) CurrentEquity() (float64, bool, error) {
	d, err := s.Export()
	if err != nil {
		return 0, false, err
	}
	equity, ok := ComputeEquity(d.Calibrations, d.Trades)
	return equity, ok, nil
}

// Calibrate 在同一事务内读取推算权益并写入，差额不受并发平仓影响。
func (s *Store) Calibrate(in CalibrationInput) (Calibration, error) {
	c := Calibration{Balance: in.Balance, Reason: in.Reason, CreatedAt: now()}
	if !positive(in.Balance) {
		return c, invalidError("账户余额必须是大于 0 的有限数字")
	}
	err := s.transaction(func(tx *sql.Tx) error {
		existing, err := listCalibrations(tx)
		if err != nil {
			return err
		}
		if len(existing) == 0 {
			c.Reason = reasonInitial
		} else {
			if !validAdjustReason(in.Reason) {
				return invalidError("请选择校准原因")
			}
			trades, err := listTrades(tx, TradeFilter{})
			if err != nil {
				return err
			}
			equity, ok := ComputeEquity(existing, trades)
			if !ok || !finite(in.Balance-equity) {
				return invalidError("权益超出可计算范围")
			}
			delta := in.Balance - equity
			c.Delta = &delta
		}
		result, err := tx.Exec("INSERT INTO equity_calibrations(balance,delta,reason,created_at) VALUES(?,?,?,?)", c.Balance, c.Delta, c.Reason, timestamp(c.CreatedAt))
		if err != nil {
			return err
		}
		c.ID, err = result.LastInsertId()
		return err
	})
	return c, err
}

func validateCalibrations(list []Calibration) error {
	seen := map[int64]bool{}
	for i := range list {
		c := &list[i]
		if c.ID <= 0 || seen[c.ID] || !positive(c.Balance) || c.CreatedAt.IsZero() {
			return invalidError("备份校准记录的编号、余额或时间不合法")
		}
		if c.Reason == reasonInitial {
			if c.Delta != nil {
				return invalidError("备份中的首次校准不能包含差额")
			}
		} else if !validAdjustReason(c.Reason) || c.Delta == nil || !finite(*c.Delta) {
			return invalidError("备份校准记录的原因或差额不合法")
		}
		c.CreatedAt = c.CreatedAt.UTC()
		seen[c.ID] = true
	}
	return nil
}
