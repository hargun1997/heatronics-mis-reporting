# Heatronics Medical Devices Private Limited — Profit & Loss (Blended Basis)

**Period:** 1-Jul-26 to 31-Jul-26
**Basis:** Blended gross margin — July's actual COGM is replaced by FY 2026-27's revenue-weighted GM% (**51.91%**), applied in proportion to July's net revenue. Everything below Gross Margin shifts by the same delta; channel, marketing, opex and non-operating stay at actuals.
**Companion:** `July-2026-PnL.md` — the actual, Tally-reconciled close. **That is the reportable statement; this one is not.**

> **What this is for.** The company books COGM on purchase and consumption timing rather than matched to each month's sales, so actual monthly gross margin swings violently — 19.0% in April, 84.3% in May, 45.6% in June, 42.1% in July. The blended view smooths that timing noise so months can be compared on trading terms. It is a management lens, not the books.
>
> ⚠️ **The blend flips July's sign.** Actual CM2 is **negative**; blended CM2 reads **+8.7%**. Actual net is a **₹3.50 L loss**; blended reads a **₹1.31 L profit**. Read Caveats 1 and 2 before quoting the blended figure to anyone.

---

## P&L Statement — blended

| Line | ₹ | ₹ Lac | % of Rev |
|---|---:|---:|---:|
| **Net Revenue** (external) | 48,77,043 | 48.77 | 100% |
| COGM — *blended at FY 51.91%* | (23,45,140) | (23.45) | (48.1%) |
| **Gross Margin** | **25,31,904** | **25.32** | **51.9%** |
| Channel & Fulfilment | (4,83,537) | (4.84) | (9.9%) |
| **CM1** | **20,48,367** | **20.48** | **42.0%** |
| Sales & Marketing — performance ads | (16,22,150) | (16.22) | (33.3%) |
| **CM2** | **4,26,217** | **4.26** | **8.7%** |
| Brand Investment — *nil in July* | — | — | — |
| **CM3** | **4,26,217** | **4.26** | **8.7%** |
| Operating Expenses (payroll, prof. fees, admin, net of other income) | (2,94,789) | (2.95) | (6.0%) |
| **EBITDA** | **1,31,428** | **1.31** | **2.7%** |
| Cost of Fundraising | — | — | — |
| Non-Operating | — | — | — |
| **Net Income** | **1,31,428** | **1.31** | **2.7%** |

Only two lines are restated — COGM and Gross Margin. Every other line is July's actual, unchanged.

---

## Blended vs actual

| Line | Actual ₹ Lac | Blended ₹ Lac | Δ |
|---|---:|---:|---:|
| Net Revenue | 48.77 (100%) | 48.77 (100%) | — |
| COGM | (28.26) (57.9%) | (23.45) (48.1%) | +4.81 |
| **Gross Margin** | **20.51 (42.1%)** | **25.32 (51.9%)** | **+4.81** |
| Channel & Fulfilment | (4.84) | (4.84) | — |
| CM1 | 15.67 (32.1%) | 20.48 (42.0%) | +4.81 |
| Sales & Marketing | (16.22) | (16.22) | — |
| **CM2 / CM3** | **(0.55) (−1.1%)** | **4.26 (8.7%)** | **+4.81** |
| Operating Expenses | (2.95) | (2.95) | — |
| **EBITDA / Net Income** | **(3.50) (−7.2%)** | **1.31 (2.7%)** | **+4.81** |

A single reconciling item: **₹4,81,065**, the amount by which the FY blend lifts July's gross margin. It cascades unchanged to every line below.

---

## How the 51.91% is derived

Revenue-weighted gross margin across every FY 2026-27 month booked so far:

| Month | Net Revenue ₹ Lac | Gross Margin ₹ Lac | Actual GM% |
|---|---:|---:|---:|
| Apr 2026 | 41.87 | 7.95 | 19.0% |
| May 2026 | 67.16 | 56.59 | **84.3%** |
| Jun 2026 | 49.48 | 22.56 | 45.6% |
| Jul 2026 | 48.77 | 20.51 | 42.1% |
| **FY 2026-27 to date** | **207.28** | **107.61** | **51.91%** |

The spread from 19.0% to 84.3% across four consecutive months is the timing noise the blend exists to remove. By construction a completed fiscal year is unchanged by blending — only sub-annual distribution moves.

---

## Caveats

1. **⚠️ The rate is provisional and will restate every month.** It is built from **4 of 12** FY 2026-27 months. Every month added re-weights it, and July's blended figures move retrospectively each time. Anything quoted from this document is a moving number until March 2027.

2. **⚠️ May is holding the blend up, and July's profit sits on 2.7 points of headroom.** July's blended EBITDA turns negative once the FY rate falls below **49.22%**; it currently stands at 51.91%. Strip May's outlier 84.3% out and the remaining three months blend to **36.41%** — at which July's blended EBITDA would be a **₹6.25 L loss**, worse than the actual. The blended profit therefore depends almost entirely on May's gross margin being real rather than itself a stock-timing artefact.

3. **This is not the reportable position.** The actual close — **a ₹3.50 L net loss** — is what reconciles to Tally (single ₹1,691 stock-transfer reconciling item) and is what `July-2026-PnL.md` carries. Nothing here has any statutory standing.

4. **The blend cannot fix a trading problem, only redistribute a timing one.** July's actual CM2 is negative: revenue does not cover COGS, logistics and ads. The blend borrows margin from elsewhere in the fiscal year to mask that. If July's real COGM is correct — and closing stock was re-valued specifically to make it so — then the negative CM2 is the true reading and the blended +8.7% is an artefact of averaging.

5. **Only COGM moves.** Channel & fulfilment, marketing, brand investment, operating expenses, non-operating and cost of fundraising are July actuals in both statements. So is revenue.

---

## When to use which

| | Use |
|---|---|
| Board pack, investor update, statutory, any external circulation | **Actual** — `July-2026-PnL.md` |
| Month-on-month trading comparison, channel and marketing efficiency | Either, consistently — but say which |
| Judging whether July traded profitably | **Actual.** The blend answers a different question |

*Generated from `MONTHLY_MIS` via `blendedMonths()` in `client/src/data/misDeck/analytics.ts`. Reproduce in the MIS deck by switching the P&L view from Actual to Blended.*
