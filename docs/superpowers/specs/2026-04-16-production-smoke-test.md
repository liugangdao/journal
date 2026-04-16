# Production Smoke Test — journal.basiscalc.xyz

**Date**: 2026-04-16
**Type**: Interactive smoke test (通路测试)
**Target**: https://journal.basiscalc.xyz

## Constraints

- Test account: `qa_test_<timestamp>` — isolated from real users
- Non-destructive: no stress/load/performance tests
- Deliverable: text report with ✅/❌/⚠️ per step + bug list
- No Lighthouse
- Duration: ~20-30 min
- Tool: Chrome DevTools MCP (browser automation)

## Test Flow

### Phase 1 — Public Pages (unauthenticated)

| # | Step | Pass criteria |
|---|------|--------------|
| 1 | Visit `/` | Landing page renders, CTA visible |
| 2 | Visit `/about` | Content renders |
| 3 | Visit `/privacy` | Content renders |
| 4 | Visit `/terms` | Content renders |
| 5 | Navigate between pages | Routes work, no 404 |

### Phase 2 — Auth

| # | Step | Pass criteria |
|---|------|--------------|
| 6 | Register `qa_test_<ts>` | Account created, no error |
| 7 | Auto-login after register | Enters main app |
| 8 | Logout | Returns to Landing |
| 9 | Login with same creds | Enters main app |
| 10 | Refresh page | Session persists |

### Phase 3 — Trade CRUD (core)

| # | Step | Pass criteria |
|---|------|--------------|
| 11 | Check seeded data | Pairs and policies present |
| 12 | Create open trade | Form submits, no error |
| 13 | Verify open position | Trade appears in open list |
| 14 | Close trade | Exit price + PnL accepted |
| 15 | Verify closed trade | R-multiple / pips display |
| 16 | Edit closed trade | Fields update |
| 17 | Verify edit | Changes reflected in list |
| 18 | Delete trade | Removed from list |

### Phase 4 — Notes

| # | Step | Pass criteria |
|---|------|--------------|
| 19 | Create weekly note | Saves successfully |
| 20 | Verify weekly note | Displays in list |
| 21 | Create monthly note | Saves successfully |
| 22 | Verify monthly note | Displays in list |

### Phase 5 — Settings

| # | Step | Pass criteria |
|---|------|--------------|
| 23 | View pairs list | Seeded pairs visible |
| 24 | Add custom pair | New pair appears |
| 25 | View policies | Seeded policies visible |
| 26 | Toggle policy | Active state changes |

### Phase 6 — Stats

| # | Step | Pass criteria |
|---|------|--------------|
| 27 | Navigate to stats tab | Tab loads |
| 28 | KPI cards | Show data from trades |
| 29 | Charts | Render without blank/error |

### Phase 7 — Cross-cutting

| # | Step | Pass criteria |
|---|------|--------------|
| 30 | Toggle theme | Dark ↔ Light switches |
| 31 | Refresh after toggle | Theme persists |
| 32 | Switch all tabs | No broken tabs |
| 33 | Export JSON | File downloads |

## Report Template

```
## Smoke Test Report — YYYY-MM-DD

### Results
| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Landing page | ✅/❌/⚠️ | ... |
...

### Bugs Found
| # | Severity | Description | Repro |
|---|----------|-------------|-------|
```
