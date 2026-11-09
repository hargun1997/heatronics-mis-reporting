# MIS improvement backlog

Run 1: 9 Nov 2026. Next run: read this file first, pick up from "Next up", update statuses, never repeat done work.
Rank = Impact x Novelty / Effort (1-5 each). Rules: PRs only, no merge to main, nothing touches www.heatronics.in,
no deletions, emails, ad changes or marketplace / Tally writes without Hargun's yes.

## What this portal is
Live MIS, month close, Tally books (read only), Amazon price floors, 5-year plan, bulk payment files (files only).
Users: Hargun, accounts team, CA. Other portals read it through /api/expenses and the Heatronics MCP tools.

## Benchmarks (searched 9 Nov 2026)
Pigment (Analyst agent flags anomalies; Modeler and Planner agents announced), Mosaic, Runway (driver-based forecasting,
variance commentary, board reporting), Drivetrain / Aleph as lighter options.

## Built in run 1 (PRs open, see PR list in the chat)
| # | Feature | I | N | E | Score | Status |
|---|---|---|---|---|---|---|
| 1 | Floor Guard: SKUs selling below price floor, ₹ lost a month, why the floor moved. MCP `mis_get_floor_guard` | 4 | 4 | 2 | 8.0 | PR open |
| 2 | Why it moved: month bridge in plain words. MCP `mis_get_margin_bridge` | 4 | 3 | 2 | 6.0 | PR open |
| 3 | Plan vs Actual: 5-year plan as the budget. MCP `mis_get_plan_vs_actual` | 5 | 3 | 3 | 5.0 | PR open |

## Missing features (vs benchmarks), not yet built
1. Budget input per month beyond the plan (S) 2. Driver-based what-if on the live month (M) 3. Anomaly agent on Tally postings, auto-ticket (M)
4. Rolling 13-week cash forecast with alert (cash blocks exist in CEO summary v2: extend, S) 5. Board / investor pack auto-built each close (M)

## Novel ideas
1. Floor breach to P&L impact to ad throttle (joins Production cost, MIS floors, Marketing).
2. Warranty provision accrual from a failure-rate forecast (needs serial / batch in Warranty first).
3. True channel contribution after returns, RTO, freight and ads per order (joins Ops, Warranty).

## Data we should capture
Monthly budgets; returns by SKU with reason; ad spend by SKU against the batch cost at that time; Floor history (Floor Guard starts it);
forecast-vs-actual log; who approved each close override and why.

## Top bugs, slow spots, confusing screens (scan 9 Nov 2026, evidence file:line; items 2, 5, 6 inferred, not reproduced)
1. Partial pulls cached as complete: server/src/connectors/factsCache.ts:62-96. Amazon Ads (12 s) / Flipkart (20 s) partial facts are stored; a closed month stays "fresh" 24 h. Ads or Flipkart revenue understated all day. Fix: skip or short-TTL when warnings show truncation. M
2. No overall timeout on cold or forced loads: factsCache.ts:88-95, routes/connectors.ts:195-247 (Promise.all). One hung source blocks the page. Fix: per-source race ~25 s returning stale. Check Cloud Run CPU-always for background refresh. M
3. Live facts failure swallowed: client/src/data/misDeck/liveDeck.ts:931-966 (`.catch(() => [])`). Deck builds with no live data and no banner. Fix: show source errors in CompletenessBanner. S
4. Load waterfall and heavy payload: liveDeck.ts:961, ingest/objectStore.ts:378-410 (~75 GCS reads on a miss). Fix: start facts in parallel, trim /api/ingest/extracted. M
5. Every route eager-imported: client/src/App.tsx:1-32, no React.lazy. Slow first load on mobile. Fix: lazy routes, dynamic-import Excel / PDF builders. S

Also logged: zero shown instead of "no data" (client/src/data/liveMis/facts.ts, deckTabs.tsx:669/953/956, reportTabs.tsx:132/210) S;
wide tables with no mobile fallback (LiveMisSheetTab.tsx:139,178, reportTabs.tsx, deckTabs.tsx, StatementsTabs.tsx) M;
jargon ("COGM basis", "CM1", "residual") LiveMisSheetTab.tsx:125-170, MonthClosePanel.tsx:139 S;
UNVERIFIED assumptions with no on-screen flag (Shiprocket GST, fee GST +18%, Easebuzz fields, Tally XML, Meta product_id) M;
no unhandledRejection handler, silent background refresh errors (factsCache.ts:104) S.

## Perfect (one line)
Open it and see: cash runway, margin vs plan, the 3 numbers that moved and why, SKUs under their floor, one tap to approve the fix.

## Next up (run 2)
Fix bugs 3, 5, 6 (all S). Then bug 1 and 2. Then extend cash alert, then board pack.
