# 5-year plan: ONE Setup, then outputs

Founder (3 Nov 2026, verbatim): "still confusing...should have just 1 setup thing...and then just outputs right...2 buttons i get
confused that ways maybe collapsible section where we input stuff and adjust etc etc".

This document is the implementation contract for the rebuild of `/planning` (`client/src/pages/planning/PlanningPage.tsx`).
Rule of the page after the rebuild: **every input lives inside the Setup panel; everything below it is read-only; there is one
"do something" button (Fit the plan to these targets) and it is the page's only `bg-cta`.**

Engine (`client/src/data/planning/engine.ts`) is untouched. `server/test/planning.test.ts` (sheet parity) and
`server/test/growth.test.ts` must stay green unchanged.

---

## 0. Page layout

```
PageHeader "5-year plan"  (actions: Source sheet ↗)
┌ scenario bar ───────────────────────────────────────────────────────────────────────┐
│ Scenario [select]  (Unsaved changes)  [Save as scenario / Save] [Save as new] [Undo] │
│ Delete · Compare with [select] · [Export Excel]                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
┌ SETUP (collapsible card) ───────────────────────────────────────────────────────────┐
│ ▸ Setup   10 products · 27 hires · 3 rounds · sheet parity off          [Expand ▾]  │
│   (expanded:)                                                                        │
│   ▸ 1 Starting point      My plan · opening from Tally (Sep-26) · Apr–Sep ’26 ₹x Cr │
│   ▾ 2 Assumptions         FY29 +60% · FY30 +45% · FY31 +35% · inflation 6% · …      │
│       …inputs…                                                                       │
│   ▸ 3 Products & categories   3 categories · 10 products (8 placeholders) · 2 off   │
│   ▸ …                                                                                │
└─────────────────────────────────────────────────────────────────────────────────────┘
[ Overview | Business plan | Revenue | Costs | Monthly P&L | Cash & funding | Products & customers ]   ← SegmentedControl
…the selected read-only output view…
```

- Scenario bar: unchanged except (a) the Sheet-parity checkbox is **removed** (it moves into Setup → Starting point), (b) "Save as
  scenario / Save" becomes a **secondary** button (`border border-slate-200 bg-white`) so the page has one `bg-cta`, which is
  "Fit the plan to these targets" inside Setup → Targets. When Setup is collapsed there is no `bg-cta` on screen; that is fine
  (design system: *at most* one).
- Setup panel: one `Card`. Header = chevron + "Setup" + the panel summary line + a "Sheet parity" amber chip when parity is on
  (so every output below is understood as "the sheet"). Click anywhere on the header toggles it. Open/closed state of the panel
  and of each section is kept in `localStorage['planning-setup-v1']` as `{ open: boolean; sections: Record<SetupSectionId, boolean> }`.
  Default: panel open, only "Starting point" open on a first visit.
- Panel summary line (collapsed): `${products} products · ${hires} hires · ${rounds} rounds · sheet parity ${on|off}` where
  products = `plan.products.filter(p => p.on).length`, hires = `plan.growth?.hires.filter(h => h.on !== false).length ?? 0`,
  rounds = `plan.growth?.rounds.filter(r => r.on).length ?? 0`.
- Each section: a header button (`aria-expanded`, `aria-controls`) with number + title + its `summary(plan)` in `text-slate-500`
  + chevron; body rendered only when open. Sections never render a `bg-cta` except Targets.
- Outputs: `SegmentedControl<View>` with 7 options; the selected view renders below. Views contain **no** input controls.
  View-only controls (grain / section switches in PnlGrid, "By milestone / By theme") are allowed because they never call `update`.
- Design system (`design-system/heatronics-mis/MASTER.md`, CLAUDE.md "Design & menu"): `bg-surface` cards, `border-slate-200/80`,
  `shadow-card`, no raw hex, selected segments in accent (indigo), focus ring `focus-visible:ring-2 ring-accent-500`, 44px targets
  on phones, tables in `overflow-x-auto`. Primary = `bg-cta text-on-cta hover:bg-cta-hover` (ONE). Secondary =
  `rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50`.

---

## 1. Shared contract (integrator writes these FIRST, before any section agent starts)

### `client/src/components/planning/setup/types.ts`

```ts
import type { Plan, PlanResult } from '../../../data/planning/engine';

/** Mutate a deep clone of the plan (PlanningPage: structuredClone → fn(next) → setPlan). Synchronous only. */
export type Update = (fn: (p: Plan) => void) => void;

export interface SetupSectionProps {
  plan: Plan;        // the current plan (never mutate directly)
  update: Update;    // update((p) => { p.levers.inflationPct = 0.05; })
  result: PlanResult; // runPlan(plan) — for read-only feedback lines next to inputs
}

export type SetupSectionId =
  | 'start' | 'assumptions' | 'products' | 'customers' | 'retail' | 'team' | 'capacity' | 'funding' | 'targets' | 'narrative' | 'sheet';

export interface SetupSectionDef {
  id: SetupSectionId;
  title: string;                       // e.g. 'Team & hiring'
  blurb: string;                       // one line under the title when open (≤ 110 chars)
  Section: (props: SetupSectionProps) => JSX.Element;
  summary: (plan: Plan) => string;     // collapsed line; pure, cheap (no runPlan), ≤ 90 chars
}
```

### `client/src/components/planning/setup/shared.tsx`

Moved out of GrowthTab/ProductsTab/FounderPanel/CustomersTab so every section uses the same pieces:
- `MonthSelect({ value, onChange, months, title, allowNone, noneLabel })` (GrowthTab.tsx L29-37 + ProductsTab.tsx L24-31 merged).
- `Check({ checked, onChange, label })` (GrowthTab L39-41).
- `Row({ label, hint, children })`, `Field` (FounderPanel L17-22, CustomersTab L200-207 — same thing, one component).
- `Flag({ children })` amber "Terms not confirmed" pill (FounderPanel L14-16).
- `SubHead({ children })` = `<h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">`.
- Class strings: `btn` (secondary), `rm` (ghost remove), `txt` (text input), `lbl` (caps label), `th`, `thr`, `td` — exactly the
  strings at GrowthTab.tsx L22-27 and ProductsTab.tsx L18-22.
- `newId(prefix)` (GrowthTab L19).
- `monthsOf(result)` → `result.months.map(m => ({ m: m.m, label: m.label }))`.
- `replacePlan(update, fn: (p: Plan) => Plan)` → `update((p) => { const n = fn(p); for (const k of Object.keys(p)) if (!(k in n)) delete (p as any)[k]; Object.assign(p, n); })`
  (the "replace the whole plan" pattern GrowthTab L49-56 used; needed by Fit and Load-example).
- `useBusy()` → `[busy, run(what, fn)]` with the 30 ms `setTimeout` so the button repaints before a synchronous solver runs (GrowthTab L49-56).
- `ensureGrowth(p: Plan)` → `p.growth ??= { ...emptyGrowth(), on: true }; ensureGrowthGroups(p); return p.growth;` (does NOT change
  `on` of an existing growth). `ensureFx(p)` → `if (!p.fx) applyFounderDecisions(p); return p.fx!;`.

Every section imports `NumInput` / `Lever` from `components/planning/inputs.tsx` and `cr/int/money/pct/lakh` from `fmt.ts`.
Nobody edits `inputs.tsx`, `fmt.ts`, `engine.ts`, `growth.ts`, `basePlan.ts`, `summary.ts`, `history.ts`, `opening.ts`.

### Section file skeleton (every agent copies this)

```tsx
// client/src/components/planning/setup/TeamHiring.tsx
import type { SetupSectionDef, SetupSectionProps } from './types';
import { summary } from '../../../data/planning/setup/team';   // pure, tested
export { summary };
export function Section({ plan, update, result }: SetupSectionProps) { /* inputs + feedback lines */ }
export const SECTION: SetupSectionDef = { id: 'team', title: 'Team & hiring', blurb: '…', Section, summary };
```

`data/planning/setup/<section>.ts` holds `summary(plan)` and any pure mutation/selector helpers; `server/test/setup-<section>.test.ts`
tests them (node:test, imports via `../../client/src/data/planning/setup/<section>.ts` like `planning.test.ts`). React components are
not unit-tested (no DOM test runner in the repo).

### Feedback-line rule
A section may show small read-only computed text next to its inputs (one line or one small row set, e.g. "FY31: 27 people added",
"peak use 112% in Nov-30", "sold 18% · holders keep 61%"). It must not render output *tables* that an output view already shows.

---

## 2. Setup sections (in order) — what each holds, what it absorbs, what is removed

### 2.1 Starting point — `setup/StartingPoint.tsx`, `data/planning/setup/mode.ts`, `server/test/setup-mode.test.ts`
Blurb: "What the plan starts from: the sheet or your plan, the opening balance sheet, and the actuals already booked."

Inputs:
1. **Plan basis** — `SegmentedControl` (size md) with two options:
   - `Sheet parity` — "the 18-month Projection & Deployment Plan, exactly as the sheet books it"
   - `My plan` — "founder decisions, your products and the growth layer"
   Implemented by `planMode(plan): 'sheet' | 'plan'` = `!plan.fx || plan.fx.sheetParity ? 'sheet' : 'plan'` and
   `setPlanMode(p, mode)`: `'sheet'` → `ensureFx(p); setSheetParity(p, true)`; `'plan'` → `ensureFx(p); setSheetParity(p, false);
   ensureGrowth(p); p.growth.on = true; ensureGrowthGroups(p)` (= ProductsTab.tsx L68-74 `enable()`).
   This control **replaces**: the top-bar Sheet-parity checkbox (`ParityToggle`, FounderPanel L27-36, PlanningPage L192), the
   "Growth builder on" checkbox (GrowthTab L108-110), the ProductsTab amber banner + "Use my products in the plan" (L99-107),
   "Apply the founder decisions" (FounderPanel L60-66), "Start empty" (GrowthTab L92) and "Remove" the growth builder (L124).
   Under it, one grey line: "Sheet parity ignores every switch, product, hire, round and target below and books tax monthly — the
   first 18 months then equal the sheet. Outputs show a 'Sheet parity' chip."
   Legacy case: if `planMode === 'plan'` and `plan.growth && !plan.growth.on` (a scenario saved from the old UI), show one amber line
   "The products & growth layer is switched off in this saved scenario." + secondary button "Switch it on"
   (`update(p => { p.growth!.on = true; })`). This is the only remnant of "Growth builder on".
2. **Load the example growth plan** — secondary button, `window.confirm('Replace products, hires, capacity, rounds and targets with the
   example growth plan (₹30 → 100 → 250 → 500 Cr, every number a placeholder)?')` → `replacePlan(update, build500Cr)` via `useBusy`
   ("Building…"). Absorbs GrowthTab L89-91 and L121-123 ("Reload the growth plan"). Disabled in sheet mode with a title.
3. **Opening position** (`plan.startMonth`, e.g. Oct-26):
   - mode `plan`: FounderPanel L122-137 as is — source text ("From Tally, 2026-09-30" / "Typed in" / "Sheet values — replace with
     Tally"), secondary button **"Load Sep-26 from Tally"** (the fetch of `/api/tally/statements` + `openingFromTally`, L45-58),
     the 7 `NumInput unit="cr"` fields (cash, receivables, payables, inventory, GST input credit, debt, accumulated losses), `o.note`.
   - mode `sheet`: the three sheet inputs `plan.cash.openingCash / openingInventory / openingDebt` (CashTab `inputs` rows
     'openingInventory', 'openingDebt', 'openingCash') labelled "Sheet's opening values".
   Only the active mode's block renders — one set of opening numbers visible at a time.
4. **Actuals already booked** — `levers.fy27H1Revenue`, `levers.fy27H1Ebitda` ("Apr–Sep ’26 actual revenue / EBITDA", PlanningPage
   L223-229) and `business.exitPriorL3M` ("Jul–Sep ’26 revenue, for the 12-month Exit ARR", BusinessPlanTab L41-42).

`summary(plan)`: `Sheet parity · opening = sheet values` or
`My plan · opening from Tally (${asOf}) | typed in | sheet values · Apr–Sep ’26 ₹${cr(fy27H1Revenue,1)} Cr`.
Test: `setPlanMode(p,'sheet')` + horizon 18 → M1–M18 closing cash equals `base-plan-check.json` (same `close()` as planning.test.ts);
`setPlanMode` on a plan with `fx` undefined applies founder decisions and sets `growth.on`; `planMode(basePlan())==='plan'`.

Reads for reference: FounderPanel.tsx, ProductsTab.tsx L48-74, GrowthTab.tsx L83-98, PlanningPage.tsx L79-92 & L219-233,
CashTab.tsx. Must not edit any of them.

### 2.2 Assumptions — `setup/Assumptions.tsx`, `data/planning/setup/assumptions.ts`, `server/test/setup-assumptions.test.ts`
Blurb: "The levers every product sits on, the accounting switches, and working capital, GST, tax and interest."
Three sub-blocks with `SubHead`s:
1. **Growth & costs** — the whole `LeverPanel` (LeverPanel.tsx L12-55: FY29–31 unit growth all channels, price change, raw-material
   delta, ROAS gain, brand %, team growth, inflation, "Stretch the 18-month plan" `baseVolume` per channel) **plus** the per-channel
   growth table from RevenueTab.tsx L30-56 (channel × FY29–31 `NumInput unit="pct"`, with the FY31 revenue feedback column) **plus**
   the seasonality-shape choice `levers.seasonShape` (`SegmentedControl` "FY29+ follows the sheet's shape / follows the learned curves",
   CustomersTab L256-257).
2. **Accounting & tax switches** (`plan.fx`, FounderPanel L78-89): `gstServicesAsCost`, `revenueExGst`, `gtNetRealisation`,
   `depreciationOnce.on` (+ `lifeYears` with Flag), and **Tax method** `levers.taxMode` select (CashTab L96-102; the read-only tax row at
   FounderPanel L89 is dropped). Disabled (`opacity-50`) with the parity note when `planMode==='sheet'`.
   (`d2cDiscount` goes to D2C customers; `seed/ventureDebt/overdraft` go to Funding; `skuTweaks` go to Products.)
3. **Working capital, GST, tax & interest** (`plan.cash`, CashTab `inputs` minus the three `opening*`): inventoryDays, gmStandard,
   receivableDays, payableDays, refundLagMonths, gstWriteOffPct, interestRate, taxRate, contingencyPct ("Contingency on peak deficit,
   18M / full plan"), **plus** `business.contingency12` ("Contingency, 12-month ask", BusinessPlanTab L51-53) and
   `business.exitGrowthCap` (L43-44), **plus** the interest-rate steps editor (CashTab L72-88, `cash.interestSteps`).
`summary`: `FY29 +${pct}% · FY30 +… · FY31 +… · price ${±}%/yr · inflation ${}% · ${revenueExGst ? 'ex-GST P&L' : 'GMV P&L'} · tax ${by FY|as sheet}`
(average growth across channels per FY as LeverPanel's `avgGrowth`).
Reads: LeverPanel.tsx, RevenueTab.tsx L30-56, FounderPanel.tsx L78-89, CashTab.tsx L19-32 & L72-104, BusinessPlanTab.tsx L40-53,
CustomersTab.tsx L238-260.

### 2.3 Products & categories — `setup/Products.tsx`, `data/planning/setup/products.ts`, `server/test/setup-products.test.ts`
Blurb: "Today's range, then categories → products in each (launch, price, volumes, channels, economics, own expenses)."
= ProductsTab.tsx L122-199 and `ProductRow` L203-313, moved as is, minus: the amber banner / `enable()` (L99-107, now Plan basis),
the "Broad assumptions" show/hide card (L109-120, now Assumptions). Plus:
- "Current range (from the sheet)" keeps `fx.skuTweaks` volume × / price per SKU (L123-145). The hGo/hPulse block in FounderPanel
  L139-154 is a duplicate → **removed**.
- Each product row gets the **Season** select (`seasonRef`: Flat / Like <sku>) from CustomersTab RolloutCard L335-341, in the
  "Volume" box.
- "+ Add product" and "+ Add category" are **secondary** (today `primary`/`bg-cta`).
- When `planMode==='sheet'`, show one grey line at the top "Sheet parity: products, categories and their expenses are not in the
  numbers (Starting point → My plan)." and keep the editors enabled (edits are kept, just not applied — same as today's
  `disabled={!plan.fx || parity}` on skuTweaks stays).
- The legacy "New products" editor in RevenueTab.tsx L58-99 (flat `plan.products` list) is **removed** — ProductsTab's cascade
  supersedes it; orphan products (no category) are handled by the "Not in a category yet" block (L183-198).
`summary`: `${cats} categories · ${products on} products (${placeholders} placeholders) · ${off} off`.
Test: summary counts; `addProduct` default row shape (id prefix `g-`, inherits category split).
Reads: ProductsTab.tsx, CustomersTab.tsx L301-352, RevenueTab.tsx L16-24 & L58-99, FounderPanel.tsx L139-154.

### 2.4 D2C customers & seasonality — `setup/Customers.tsx`, `data/planning/setup/customers.ts`, `server/test/setup-customers.test.ts`
Blurb: "New buyers × AOV + repeats by cohort (learned from Shopify), discounts, and each product's month-by-month shape."
= CustomersTab.tsx `D2CCard` L34-184 (model switch `SegmentedControl` Customers/Units as an input labelled "Model", the Shopify
history box with "Refresh from Shopify orders" (secondary), "Use Shopify cohorts (date)" (**secondary**, was bg-cta), "Reset to
learned" (ghost), the 8 cohort/AOV fields) **minus** the "Plan by year" table and `BaseCheck` (L150-181 → output Products & customers)
and the `HistoryChart` (→ output). Plus:
- **D2C discounts & coupons** row from FounderPanel L82-86 (`fx.d2cDiscount` on / pct / "Use Shopify's").
- **Seasonality** heatmap editor from CustomersTab `SeasonCard` L238-299 (per-SKU and D2C new-buyer rows, Oct-first, "Reset products"
  ghost button) **minus** the shape `SegmentedControl` (→ Assumptions).
`summary`: `${mode === 'cohorts' ? 'Customers' : 'Units'} model · AOV ₹${int(aovNew)} · repeat boost ${x}× · discounts ${pct}% · learned ${d.source} ${d.asOf}`.
Reads: CustomersTab.tsx, FounderPanel.tsx L82-86, history.ts.

### 2.5 Offline retail & stores — `setup/OfflineRetail.tsx`, `data/planning/setup/retail.ts`, `server/test/setup-retail.test.ts`
Blurb: "General trade, modern trade and pharmacies (outlets, offtake, margins), and own stores."
= GrowthTab.tsx L190-235 (retail types; "Add a channel" secondary; "Add GT, MT and pharmacy" link when empty; the FY outlets/invoiced
line L228-230 stays as feedback) + L471-496 (stores; "Stores on" check, the 7 fields, openings; L493 line stays as feedback).
Writes go through `ensureGrowth(p)` so the section works even when `plan.growth` is absent.
`summary`: `${types on names, e.g. GT, MT, pharmacy} · ${sum of outlets.add over on types} outlets planned · stores ${on ? `${sum openings} openings` : 'off'}`.
Reads: GrowthTab.tsx L190-235, L471-496.

### 2.6 Team & hiring — `setup/TeamHiring.tsx`, `data/planning/setup/team.ts`, `server/test/setup-team.test.ts`
Blurb: "Roles, when they join, CTC, and which roles grow with revenue, units or outlets."
= GrowthTab.tsx L238-291 as is (benefits / hiring / increment %, "Add a role" secondary, the hires table; "People added" per FY L285-290
stays as feedback). `summary`: `${roles on} roles · ${scaled} grow with the business · benefits ${}% · increment ${}%/yr`.
Reads: GrowthTab.tsx L238-291.

### 2.7 Capacity, sites & capex — `setup/CapacityCapex.tsx`, `data/planning/setup/capacity.ts`, `server/test/setup-capacity.test.ts`
Blurb: "Production capacity blocks, warehouses / offices / running costs, and one-off capex."
= GrowthTab.tsx L350-382 (capacity today + blocks; the per-FY peak lines L374-381 collapse to **one** feedback line "Peak use
${pct} in ${month}; over 100% in N months" — the per-FY detail goes to output Products & customers) + L294-346 (overheads; opex-per-FY
feedback L339-345 → output Costs) + L384-407 (other capex). `CAPEX_GROUPS` constant moves here.
`summary`: `${int(baseCapacity)} → ${int(baseCapacity + Σ on blocks)} units/mo · ${blocks} blocks · ${sites} sites · ${other overheads} running costs · ${capex} capex items`.
Reads: GrowthTab.tsx L18, L294-407, growth.ts `defaultOverheads`.

### 2.8 Funding — `setup/Funding.tsx`, `data/planning/setup/funding.ts`, `data/planning/setup/fundingDefaults.ts`, `server/test/setup-funding.test.ts`
Blurb: "Seed, venture debt and overdraft terms, the sheet's timeline events, the rounds, and how rounds are sized."
Sub-blocks:
1. **Seed, venture debt, overdraft** — FounderPanel L93-118 (`fx.seed` on/amount/month select; `fx.ventureDebt` on/amount + the terms
   grid with "Terms confirmed"; `fx.overdraft` on/rate) + `growth.seedPreMoney` (GrowthTab L413).
2. **Timeline events (the sheet's)** — CashTab L44-71: `plan.events` list (Equity raise / Debt drawn / Debt repaid; month, amount, note,
   Remove; "+ Equity raise" etc. secondary; the "Replaced by the venture-debt terms" chip).
3. **How rounds are sized** — GrowthTab L417-431 (`growth.funding`: buffer, runway months, min round, pre-money multiple, fee, first
   round ≥ n months after seed). One grey line: "Rounds are (re)sized when you fit the plan (Targets). Rounds ticked Agreed are kept."
4. **Rounds** — GrowthTab L432-466 table reduced to the input columns On · Round · Month · Amount · Pre-money · Fee · Agreed · (feedback:
   Sold · Today's holders keep from `dilution(plan)`) · ✕, with the Seed row read-only on top; "Add a round" secondary. Columns Cash
   before / Burn / Runway → output Cash & funding. **Removed**: "Size rounds from the burn" (L414) and "Fund the gap" (L119-120) —
   both are inside Fit.
5. **Benchmarks (Indian D2C)** — a small read-only table from `FUNDING_DEFAULTS.rounds` (name · when · size · pre-money × ARR ·
   dilution · milestones) and one secondary button **"Add these rounds as a starting point"** → for each default: month = seed month +
   `timing.afterSeedMonths` (clamped to the horizon), amount = `sizeCr.typical × 1e7`, preMoney = `preMoneyArrMultiple.typical ×
   runRateArr(result, month)` (min ₹50 Cr), fee = `FUNDING_DEFAULTS.feePct`, `confirmed:false`, id `bench-<n>`; also sets
   `growth.funding.preMoneyMultiple` to the Series A typical multiple if the user has not changed it from `defaultFunding()`.
   `bench-` rounds are kept by `fundTheGap` (it only replaces `auto-` ids), so Fit sizes the gap *around* them.

`fundingDefaults.ts` shape — the research is already done: `docs/planning/funding-defaults.json` + `docs/planning/D2C-RAISE-BENCHMARKS.md`.
The Funding agent converts that JSON into this TS literal (ARR-gated timing: `arrAtLeastCr` = the JSON's `arrAtRaiseCr.mid`;
`afterSeedMonths` = cumulative `monthsAfterPrevious`; `sizeCr` / multiples / dilution from low/mid/high → min/typical/max):
```ts
export interface Range3 { min: number; typical: number; max: number }
export interface FundingRoundDefault {
  name: string;                       // 'Series A'
  timing: {
    afterSeedMonths: number;          // typical months after the seed close
    afterPrevRoundMonths?: number;    // for B/C: months after the previous round
    arrAtLeastCr?: number;            // revenue run-rate investors expect at this round (₹ Cr)
    rule: string;                     // one sentence, e.g. '~20 months after seed, ARR ≈ ₹40 Cr, D2C contribution positive'
  };
  sizeCr: Range3;                     // round size, ₹ Cr
  preMoneyArrMultiple: Range3;        // pre-money ÷ run-rate ARR
  dilutionPct: Range3;                // 0.18 = 18 %
  milestones: string;                 // what the round is raised against
  sources?: string[];                 // URLs / report names
}
export interface FundingDefaults {
  asOf: string;                       // 'YYYY-MM' of the research
  market: string;                     // 'Indian D2C / consumer health, 2024–26'
  feePct: number;                     // typical banker / legal cost as % of the round
  ventureDebt: { shareOfRound: number; tenureMonths: number; ratePct: number; feePct: number };
  rounds: FundingRoundDefault[];      // Series A, B, C
  notes: string;                      // caveats
}
export const FUNDING_DEFAULTS: FundingDefaults = /* from docs/planning/funding-defaults.json */;
```
`summary`: `Seed ₹${cr} Cr ${month label} · venture debt ${on ? '₹x Cr' : 'off'} · ${rounds on} rounds (₹${total} Cr, ${agreed} agreed) · OD ${on|off}`.
Test: `roundsFromDefaults(plan, result, defaults)` gives one `bench-` round per default, months after seed, pre-money ≥ ₹50 Cr; `summary`.
Reads: FounderPanel.tsx L93-118, CashTab.tsx L44-71, GrowthTab.tsx L411-468, growth.ts (`defaultFunding`, `fundTheGap`, `dilution`, `roundStats`).

### 2.9 Targets — `setup/Targets.tsx`, `data/planning/setup/targets.ts`, `server/test/setup-targets.test.ts`
Blurb: "Where the plan should land, and the one action that fits volumes and rounds to it."
Inputs:
- **Target type** `SegmentedControl`: `Revenue by year` | `Exit ARR`. Derived, no new plan field: `targetMode(plan) =
  plan.growth?.path && Object.keys(plan.growth.path).length ? 'path' : 'arr'`. Choosing `Exit ARR` → `delete g.path; delete g.push`.
  Choosing `Revenue by year` → `g.path = {}` seeded with the current FY P&L revenues rounded to ₹ Cr for every full FY from `result.years`
  (the user then types over them).
- `path` mode: the Revenue path table (GrowthTab L136-162) with the **Target** `NumInput unit="cr"` per FY as the input column and
  Plan revenue · Gap · New-buyer push as feedback columns (EBITDA / closing cash columns → output Revenue).
- `arr` mode: `growth.targetArr` ("Exit ARR target", GrowthTab L112-113) + feedback "Exit ARR now ₹x Cr (${last 3 months} run-rate), ₹y Cr short".
- **THE button**: `bg-cta` **"Fit the plan to these targets"** with the one-sentence explanation under it:
  "Pushes the new lines' new buyers year by year until each year meets its target (or scales their launch volumes to the exit ARR), then
  re-sizes the unconfirmed rounds so cash stays above the buffer." Disabled with a title when `planMode==='sheet'` ("Switch Starting
  point to My plan") or when no growth line is on ("Add a product in Products & categories first"). Busy label "Fitting…" via `useBusy`.
  After a run, show `notes` from the helper (e.g. "FY29: the new lines cannot reach the target") in amber under the button, and
  `growth.note` in grey (GrowthTab L126).
- Pure helper `fitToTargets(plan): { plan: Plan; notes: string[] }`:
  ```
  if sheet mode or !plan.growth → return { plan: clone, notes: ['Sheet parity is on: nothing fitted.'] }
  if targetMode === 'path' → { plan: p, missed } = solvePath(plan); notes = missed
  else → s = solveForTarget(plan); p = s?.plan ?? plan; if (!s) notes.push('No growth line is on, or the lines cannot reach the exit ARR.')
  return { plan: fundTheGap(p), notes }
  ```
  This **replaces** "Solve the revenue path" (L114-116: `fundTheGap(solvePath(p).plan)`), "Solve for the target" (L117-118) and
  "Fund the gap" (L119-120, L414).
`summary`: `Revenue by year: ${first FY} ₹x Cr → ${last FY} ₹y Cr${push ? ' · fitted' : ' · not fitted yet'}` or `Exit ARR ₹x Cr target` or `No targets`.
Test: path mode on `build500Cr(basePlan())` re-fits within 0.5 % per FY and every round ≥ seed month + 3 (same assertions as
growth.test.ts L114-126); arr mode hits `targetArr` within 0.1 % (as L102-112); sheet mode returns the plan unchanged with the note.
Reads: GrowthTab.tsx L43-66, L107-162; growth.ts.

### 2.10 Business plan text — `setup/Narrative.tsx`, `data/planning/setup/narrative.ts`, `server/test/setup-narrative.test.ts`
Blurb: "The words next to the numbers: assumptions, risks, themes & milestones, team structure."
= BusinessPlanTab.tsx L69-104 editors (assumptions rows, risks rows, `Milestones` table L227-271 with its rename/retheme logic that
keeps cost lines attached, team textarea) — `Txt`, `AddBtn`, `Del` move into this file. `LiveChecks` (L274-287) → output Business plan.
`summary`: `${n} assumptions · ${n} risks · ${milestones} milestones in ${themes} themes`.
Reads: BusinessPlanTab.tsx L69-104, L227-300.

### 2.11 Sheet lines (advanced) — `setup/SheetLines.tsx`, `data/planning/setup/sheet.ts`, `server/test/setup-sheet.test.ts`
Blurb: "Edit the sheet itself: the unit grid by SKU × channel × month and every Expense Calendar line. Rarely needed."
= `UnitPlanEditor` (UnitPlanEditor.tsx L17-74: SKU chips, part switch, price, the editable grid; `RevenueSummary` L77-124 → output
Revenue) + the Costs line editor (CostsTab.tsx L15-123 as is: section switch, find box, per-line on/name/milestone tag/type/amount/
from/to/repeats, "+ Add line"; the FY-total columns stay as feedback since they sit on the same row).
`summary`: `${skus} SKUs × ${plan.units.length} months · ${lines} cost lines (${off} off, ${tagged} tagged with a milestone)`.
Reads: UnitPlanEditor.tsx, CostsTab.tsx.

---

## 3. Output views (read-only) — `client/src/components/planning/outputs/*.tsx` (one "outputs agent")

All receive `{ plan, result, compare?: PlanResult | null, compareName?: string }`; none receives `update`.

| View | File | Content | Inputs that leave it |
|---|---|---|---|
| Overview | `outputs/Overview.tsx` | PlanningPage L212-243 (MiniStats, FyTable, RevenueBars, CashCurve, the how-it-works paragraph) + two more MiniStats from GrowthTab L130 & L133: "Exit ARR (run-rate) vs target", "Peak capacity use" → grid of 6 (`grid-cols-2 xl:grid-cols-3`) | `LeverPanel` aside (→ Assumptions), Apr–Sep actuals NumInputs (→ Starting point) |
| Business plan | `outputs/BusinessPlan.tsx` | BusinessPlanTab Headline, The Ask (contingency shown as text), Use of funds, Capital deployment (its two view SegmentedControls stay), Key assumptions / risks / team as read-only lists, Themes & milestones read-only table, `LiveChecks` | exitPriorL3M, exitGrowthCap, contingency NumInputs, all text editors (→ Starting point / Assumptions / Business plan text) |
| Revenue | `outputs/Revenue.tsx` | `RevenueSummary` (sheet months), "Units and revenue by product" per FY (RevenueTab L101-128), **Revenue vs targets** per FY (GrowthTab L136-162 read-only, all 8 columns), **Exit run-rate by product family** (L164-170 + the `mix` memo L68-81), **Offline revenue by channel type** per FY (L196-199 fyRow) and store revenue (L493) | unit grid editor (→ Sheet lines), channel growth table (→ Assumptions), New products editor (removed) |
| Costs | `outputs/Costs.tsx` | Per section (view switch) → per group: FY totals row + each line's FY totals (name · type · FY27…FY31 ₹ Cr, from CostsTab `totals`), plus the Growth-layer rows: "People added" per FY (GrowthTab L285-290), opex per FY (L339-345) | every line input (→ Sheet lines) |
| Monthly P&L | `PnlGrid.tsx` (unchanged) | as today | none |
| Cash & funding | `outputs/CashFunding.tsx` | CashTab `Box` row L36-41, **Rounds & dilution** table (seed + rounds: month · amount · pre-money · cash before · burn/mo · runway · sold · holders keep from `dilution` + `roundStats`), equity raised · kept MiniStat (GrowthTab L132), timeline events read-only, the GST note (CashTab L104-106) | FounderPanel, events editor, interest steps, WC/GST/tax inputs (→ Starting point / Assumptions / Funding) |
| Products & customers | `outputs/ProductsCustomers.tsx` | Product roll-out table (CustomersTab L303-352 with Season as text), **Capacity & utilisation by FY** (GrowthTab L374-381), D2C "Plan by year" table + `BaseCheck` + `HistoryChart` (CustomersTab L150-181, L209-234), seasonality heatmap read-only (optional; skip if time) | season select, cohort fields, Shopify buttons (→ Products / D2C sections) |

Compare mode (`compareId !== 'none'`) keeps working in Overview (FyTable, charts) exactly as today; other views ignore `compare`.

---

## 4. Engine & data changes (minimal)

- `engine.ts`, `growth.ts`, `basePlan.ts`, `summary.ts`, `history.ts`, `opening.ts`, `planningExport.ts`: **no change**. `GrowthPlan.on`,
  `fx.sheetParity`, `fundTheGap`'s `auto-` convention and `solvePath`/`solveForTarget` keep their semantics; the UI just stops exposing
  `on` and `sheetParity` as two separate checkboxes.
- New pure modules under `client/src/data/planning/setup/`: `mode.ts` (`planMode`, `setPlanMode`), `targets.ts` (`targetMode`,
  `fitToTargets`), `fundingDefaults.ts`, `funding.ts` (`roundsFromDefaults`, `summary`), and one `<section>.ts` per section with its
  `summary(plan)`. All importable from node tests (`.ts` only — tests cannot import `.tsx`).
- `upgradePlan()` unchanged; the localStorage draft key `planning-draft-v1` unchanged (plan shape is unchanged).
- CLAUDE.md "5-year plan" section: integrator replaces the sentences that name tabs with one paragraph pointing at this doc and the
  `setup/` + `outputs/` folders.

---

## 5. File ownership & sequencing

**Phase 0 — integrator (serial, before anyone else):** `setup/types.ts`, `setup/shared.tsx`, this doc.

**Phase 1 — parallel. 12 agents, each writes ONLY the files in its row (new files; never edits an existing file):**

| Agent | Writes | Reads for reference (read-only) |
|---|---|---|
| Starting point | `setup/StartingPoint.tsx`, `data/planning/setup/mode.ts`, `server/test/setup-mode.test.ts` | FounderPanel, ProductsTab L48-107, GrowthTab L83-98, PlanningPage, CashTab, basePlan.ts, opening.ts |
| Assumptions | `setup/Assumptions.tsx`, `data/planning/setup/assumptions.ts`, `server/test/setup-assumptions.test.ts` | LeverPanel, RevenueTab L30-56, FounderPanel L78-89, CashTab, BusinessPlanTab L40-53, CustomersTab L238-260 |
| Products | `setup/Products.tsx`, `data/planning/setup/products.ts`, `server/test/setup-products.test.ts` | ProductsTab, CustomersTab L301-352, RevenueTab L16-24 & L58-99, FounderPanel L139-154, growth.ts `defaultCategories` |
| Customers | `setup/Customers.tsx`, `data/planning/setup/customers.ts`, `server/test/setup-customers.test.ts` | CustomersTab, FounderPanel L82-86, history.ts |
| Offline retail | `setup/OfflineRetail.tsx`, `data/planning/setup/retail.ts`, `server/test/setup-retail.test.ts` | GrowthTab L190-235, L471-496, growth.ts `defaultRetail` |
| Team | `setup/TeamHiring.tsx`, `data/planning/setup/team.ts`, `server/test/setup-team.test.ts` | GrowthTab L238-291 |
| Capacity | `setup/CapacityCapex.tsx`, `data/planning/setup/capacity.ts`, `server/test/setup-capacity.test.ts` | GrowthTab L18, L294-407, growth.ts `defaultOverheads` |
| Funding | `setup/Funding.tsx`, `data/planning/setup/funding.ts`, `data/planning/setup/fundingDefaults.ts`, `server/test/setup-funding.test.ts` | FounderPanel L93-118, CashTab L44-71, GrowthTab L411-468, growth.ts, docs/planning/funding-defaults.json |
| Targets | `setup/Targets.tsx`, `data/planning/setup/targets.ts`, `server/test/setup-targets.test.ts` | GrowthTab L43-66 & L107-162, growth.ts, growth.test.ts L100-126 |
| Narrative | `setup/Narrative.tsx`, `data/planning/setup/narrative.ts`, `server/test/setup-narrative.test.ts` | BusinessPlanTab L69-104, L227-300 |
| Sheet lines | `setup/SheetLines.tsx`, `data/planning/setup/sheet.ts`, `server/test/setup-sheet.test.ts` | UnitPlanEditor L17-74, CostsTab |
| Outputs | `outputs/Overview.tsx`, `outputs/BusinessPlan.tsx`, `outputs/Revenue.tsx`, `outputs/Costs.tsx`, `outputs/CashFunding.tsx`, `outputs/ProductsCustomers.tsx` | PlanningPage L152-243, BusinessPlanTab, RevenueTab, UnitPlanEditor L77-124, CostsTab, CashTab, CustomersTab, GrowthTab (read-only parts listed in §3), FyTable, charts, summary.ts, growth.ts |

Hard rules for every agent: do not touch `engine.ts`, `growth.ts`, `basePlan.ts`, `inputs.tsx`, `fmt.ts`, `types.ts`, `shared.tsx`,
`PlanningPage.tsx`, any old tab file, CLAUDE.md, or another agent's files. If a shared piece is missing, add a local helper in your own
file and say so in your report. Each new test must pass with `npm test` on its own (no network, no DOM).

**Phase 2 — integrator (serial):** `setup/SetupPanel.tsx`; rewire `PlanningPage.tsx`; delete the 10 old tab/panel files; fix
`import type { Update } from './LeverPanel'` → `./setup/types`; update CLAUDE.md; run §6.

---

## 6. Acceptance checks (verifier)

1. `npm test` — green, including `server/test/planning.test.ts`, `growth.test.ts`, and every new `setup-*.test.ts`.
2. `npm run lint` and `npm run build:client` — clean.
3. No input outside Setup:
   `grep -rln "NumInput\|<Lever\|<input\|<select\|<textarea" client/src/components/planning/outputs client/src/components/planning/FyTable.tsx client/src/components/planning/PnlGrid.tsx client/src/components/planning/charts.tsx` → empty;
   `grep -rn "update(" client/src/components/planning/outputs` → empty;
   in `PlanningPage.tsx` the only `<select>`s are `#scn` and `#cmp` and there is no `NumInput`/`ParityToggle`.
4. Old files gone: `GrowthTab, ProductsTab, FounderPanel, LeverPanel, CustomersTab, UnitPlanEditor, CostsTab, CashTab, BusinessPlanTab, RevenueTab`.
5. One primary: `grep -rn "bg-cta" client/src/components/planning client/src/pages/planning` → exactly one hit, in `setup/Targets.tsx`.
6. Every section's `summary` returns a non-empty string for `basePlan()` and for `build500Cr(basePlan())` (`server/test/setup-sections.test.ts`).
7. Screenshots (Playwright, 1440×900 and 390×844): Setup collapsed; Setup open with Starting point + Targets expanded (one `bg-cta`);
   each output view with Setup collapsed; parity on (chip shows, FY27/FY28 equal the pre-rebuild Base).
8. Behaviour: Plan basis → My plan, Fit: FY targets met within 1 %, rounds appear in Funding unticked; tick Agreed, Fit again → kept;
   Load the example growth plan → `build500Cr` numbers; Export Excel still produces the Growth builder sheet.
