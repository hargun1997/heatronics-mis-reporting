# MIS improvement backlog

Run 1 and run 2: 9–10 Nov 2026. **Next run: read this file and CHANGELOG.md first, start at "Next up", update statuses, and never repeat work that is done.**
Rank = Impact × Novelty / Effort (each 1–5). Rules from Hargun:
- PRs only, each one tested, screenshotted and reviewed by a separate agent; merge once tests and review pass.
- Never touch www.heatronics.in.
- Ask his yes before:
  - removing a feature;
  - sending email;
  - changing ads;
  - any write to a marketplace, Tally or Tranzact;
  - anything that can't be undone.

## What this portal is (5 lines)
1. **What:** the books side of Heatronics. It has:
   - Today page and Live MIS (P&L by channel and SKU, balance sheet, cash flow, why it moved);
   - month close and lock;
   - Tasks + Fix list, Tally health, TDS, cash runway;
   - 5-year plan + plan vs actual;
   - accounts tools: price floors, ICICI payment files, invoice booking.
2. **Who:** Hargun (founder) and the accounts team. Ops' CEO agent and the Heatronics MCP read it (`mis_get_*`).
3. **Owns:** Tally copies (P&L, TB, Day Books, masters), month-close report slots, close locks, tasks, plan scenarios, payee and batch records, daily morning snapshots.
4. **Reads (doesn't own):**
   - Ops BigQuery: Amazon ads, fees, stock;
   - Production `/api/costs`: BOM;
   - Warranty: Delhivery AWBs;
   - Portal: login.
5. **Nearby elsewhere — link, don't rebuild:**
   - **Ops:** CEO brief, alerts inbox, all-channel daily sales and targets, channel ops (Amazon / Flipkart / D2C / Blinkit / GT), planner, geography;
   - **Production:** costs;
   - **Warranty:** CX and returns.

## Benchmarks (searched 9–10 Nov 2026)
| Product | What they have now | What we take |
|---|---|---|
| **Numeric** (close) | Close checklist, AI flux writer (first-draft variance notes), AI flux drivers across every transaction, "Numeric Intelligence" finds close bottlenecks, Numeric MCP | Variance notes from our bridge; a close-readiness score; MCP already done |
| **Runway** (FP&A) | "Ambient intelligence": automatic budget-vs-actual, alerts when actuals leave the forecast, plain-word driver explanations, scenario summaries | Plan-vs-actual alerts into Ops' alerts inbox; hover definitions |
| **Pigment / Mosaic** | Analyst agent flags anomalies; driver-based planning; board reporting | Anomaly agent on Tally postings; board pack after lock |
| **Fathom / Zoho Books** | Commentary writer; anomaly detection with expected value; AI cash-flow forecast; auto-categorise expenses | Expected-vs-actual on expense ledgers; learn booking from narrations |

Sources: [Numeric AI accounting tools](https://www.numeric.io/blog/ai-accounting-tools), [Numeric close software list](https://www.numeric.io/blog/financial-close-software), [Runway ambient intelligence launch](https://ffnews.com/newsarticle/fintech/runway-launches-first-ambient-intelligence-platform-for-finance-teams), [Runway variance guide](https://runway.com/blog/ultimate-guide-to-variance-analysis-for-finance-teams).

## Who owns which data (no duplicates)
| Data | Owner portal | MIS does |
|---|---|---|
| Tally books, close, locks, tasks, plan | **MIS** | Owns; serves via `mis_get_*` |
| Daily all-channel sales, ads, targets, alerts inbox, CEO brief | **Ops** | Reads Ops BigQuery for the close only; links out for daily ops. Plan / cash alerts should go *into Ops' alerts inbox* (Phase 3), not a second inbox |
| BOM and production cost | **Production** | Reads `/api/costs` |
| Returns, CX, Delhivery AWBs | **Warranty** | Reads the AWB feed only |
| Company-wide AI spend, login, access | **Portal** | Serves its own usage feed only |
| D2C customers, cohorts, repeat | **Ops** (D2C → Customers) | One link line (already) |

## Menu and owners (proposal; every page shows owner · how often · job on the page since #398)
| Section | Page | Owner | How often | Job |
|---|---|---|---|---|
| — | **Today** | Hargun (Founder) | Daily | Act on red, read what changed |
| Reporting | Live MIS (Overview · P&L · Channels · Products · Statements) | Hargun | Weekly | Read; close and lock after the 10th |
| Reporting | AI insights | Hargun | When needed | Ask why a number moved |
| Accounts | Tasks (To do · Fix · Calendar) | Accounts executive | Daily | Tick due tasks, clear Fix |
| Accounts | Cash runway | Hargun | Weekly | Watch the zero / limit week |
| Accounts | Tally health | Accounts executive | Weekly | Fix ledgers in TallyPrime |
| Accounts | TDS planning | Accounts executive | Monthly | Pay by the 7th, quarter return |
| Accounts | Accounts Handbook | Accounts executive | When needed | Follow the SOP |
| Planning | 5-year plan (+ Plan vs actual) | Hargun | Monthly | Update; pin the plan of record |
| Tools | Book an invoice · Bulk payments · Price floors · Round planner · Send report | per page | per page | per page |
| Admin | Setup | Accounts executive | Monthly | All reports in by the 10th |

**Moves proposed (need Hargun's yes; nothing removed):**
1. Book an invoice and Bulk payments: Tools → Accounts (daily / weekly accounts work).
2. Round planner: Tools → Planning.
3. A new "Money" group (Cash runway, Receivables & payables, Bulk payments) once Phase 2 ageing ships.

## Ranked improvements
| # | Item | Phase | I | N | E | Score | Status |
|---|---|---|---|---|---|---|---|
| 1 | Today page: needs-you, 5 numbers, what changed, coming up; MCP `mis_get_morning_brief` | 1 | 5 | 3 | 2 | 7.5 | **Merged #394** |
| 2 | Code health: lazy pages (main chunk 1.16 MB → 88 kB gz), lint 0, dead code out, faster plan engine | 1 | 4 | 1 | 2 | 2.0 | **Merged #395** |
| 3 | Accessibility + phone layout: axe serious issues 1,116 → 0 | 1 | 4 | 1 | 2 | 2.0 | **Merged #397** |
| 4 | Cash runway: 13 weeks, 3 cases, overdraft-limit week; MCP `mis_get_cash_runway` | 1 | 5 | 3 | 2 | 7.5 | **Merged #396** |
| 5 | Owner · how often · job on every page; Source chip (where from, how old); no banners | 1 | 4 | 3 | 1 | 12.0 | PR #398 |
| 6 | Live feed bugs: partial pulls re-pulled, 25 s cap per source, failures on Fix list | 1 | 4 | 1 | 2 | 2.0 | PR #399 |
| 7 | Why it moved bridge; MCP `mis_get_margin_bridge` (other session) | 1 | 4 | 3 | 2 | 6.0 | Merged #392 |
| 8 | Plan vs actual; MCP `mis_get_plan_vs_actual` (other session) | 1 | 5 | 3 | 3 | 5.0 | Merged #393 |
| 9 | **Source chip on every page** (Live MIS, Tasks, Tally, TDS, Runway, Plan) — #398 only did Today | 2 | 4 | 2 | 2 | 4.0 | Next |
| 10 | **Receivables & payables ageing** from Tally bills (Day Book + masters): 0–30/31–60/61–90/90+, top 10 parties, DSO / DPO trend; MCP `mis_get_ageing` | 2 | 5 | 2 | 3 | 3.3 | Next |
| 11 | **Runway v2: known dues on the 13 weeks** — TDS (TDS engine), GST (TB), salaries (P&L avg), bulk-payment batches saved | 2 | 5 | 3 | 3 | 5.0 | Next |
| 12 | **Variance notes (flux writer)**: per P&L line, "up ₹X L (Y %) vs last month because …" from the bridge + ledger moves, deterministic, Claude only to polish | 2 | 4 | 3 | 2 | 6.0 | Next |
| 13 | **Board / investor pack after lock**: one PDF (P&L, cash, runway, plan vs actual, why it moved) from Send report | 2 | 4 | 2 | 2 | 4.0 | Later |
| 14 | **Anomaly agent on Tally postings**: new vouchers vs each ledger's usual (amount, party, narration) → Fix items with "expected ₹X, got ₹Y"; never edits Tally | 3 | 5 | 4 | 3 | 6.7 | Later |
| 15 | **Plan / cash alerts into Ops' alerts inbox** via an MCP / feed (cash below zero within 6 weeks, month > 10 % behind plan, close late) — one inbox company-wide | 3 | 4 | 4 | 2 | 8.0 | Later (needs Ops change) |
| 16 | **Close-readiness predictor**: from slot history, which report will be late this month and who owns it; nudges in Tasks | 3 | 3 | 4 | 3 | 4.0 | Later |
| 17 | **Floor breach → P&L impact**: SKUs below price floor × units = ₹ lost a month, on Today; Floor Guard idea from run 1 | 3 | 4 | 4 | 2 | 8.0 | Later |
| 18 | **Learned booking**: suggest ledger / GST for a new invoice from past vouchers with the same party / narration | 3 | 3 | 3 | 3 | 3.0 | Later |

Remaining from run 1's bug scan (not yet fixed):
- Load waterfall + heavy `/api/ingest/extracted` payload (`liveDeck.ts`, `objectStore.ts`, about 75 GCS reads on a miss). M
- Zero shown instead of "no data" (`facts.ts`, `deckTabs.tsx`, `reportTabs.tsx`). S
- Wide tables with no phone layout (MIS sheet, statements). M
- Jargon on screen ("COGM basis", "CM1", "residual") with no hover definition. S
- UNVERIFIED assumptions with no on-screen flag (Shiprocket GST, fee GST +18 %, Easebuzz fields, Meta product_id). M
- Pages added in run 2 (Today, Why it moved, Plan vs actual, Cash runway) not yet in the axe sweep. S
- `liveFeed` duplicate pulls: a forced refresh after a timeout can start a second pull of a never-pulled month (factsCache skips the in-flight check for missing months). S

## Data we should capture but don't
Saved since run 2: daily morning snapshot (`morning/snap-<day>`).

Still missing:
- monthly budgets beyond the plan;
- returns by SKU with reason (owned by Warranty → read it);
- a log of forecast vs actual over time;
- who approved each close override (only partly stored);
- payable and receivable bill due dates (needed for item 10);
- overdraft limit per bank (only one total in `cash/settings` now).

## Needs Hargun's decision
1. **Names for the accounts roles** on page owners (now "Accounts executive" with no name).
2. **Menu moves** listed above.
3. **Overdraft limit:** type it once on Cash runway (one total for now), or per bank (HDFC / ICICI / Central Bank)?
4. **Item 15:** OK to add a small "MIS alerts" producer to Ops' alerts inbox (an Ops repo change)?
5. Equity raises make the "Best month repeats" case look too good. Should a month with share money be left out automatically? That needs the share-capital ledger name.

## Next up (run 3)
1. Merge #398 / #399 if they're still open.
2. Item 9: source chip on every page.
3. Item 11: runway known dues.
4. Item 12: variance notes.
5. Item 10: ageing.
6. Then the remaining bug list.
