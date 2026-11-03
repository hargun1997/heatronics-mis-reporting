// Growth builder: new product lines, hiring, capacity, capex, fundraise rounds and stores, layered on
// top of the 5-year plan (engine.ts applies them when `plan.growth.on`, never in sheet-parity mode).
// Also: the exit run-rate ARR, a solver that scales the growth lines to a target, a "fund the gap"
// helper that sizes rounds, the dilution table, and the ₹500 Cr scenario. Every number in the
// scenario is a PLACEHOLDER for the founder to replace.

import { GROWTH_GROUPS, runPlan, type Channel, type GrowthPlan, type NewProduct, type Plan, type PlanResult } from './engine';

const CR = 1e7;
const L = 1e5;
const ch = (a: number, d: number, f = 0, g = 0, p = 0): Record<Channel, number> => ({ A: a, D: d, F: f, G: g, P: p });

/** Exit ARR as the founder uses it: the last 3 months' P&L revenue × 4, at month e (default: the horizon's end). */
export function runRateArr(r: PlanResult, e = r.months.length): number {
  const ms = r.months.slice(Math.max(0, e - 3), e);
  return ms.length ? (ms.reduce((a, m) => a + m.netRevenue, 0) * 12) / ms.length : 0;
}

/** An empty Growth builder: nothing changes until lines are added and it is switched on. */
export function emptyGrowth(): GrowthPlan {
  return {
    on: false, targetArr: 500 * CR, baseCapacity: 13_000, incrementPct: 0.1, benefitsPct: 0.12, recruitPct: 0.08,
    seedPreMoney: 40 * CR, hires: [], capacity: [], capex: [], rounds: [],
    stores: { on: false, openings: [], matureRevenue: 6 * L, rampMonths: 6, capexPerStore: 15 * L, rentPerStore: 1.5 * L, staffPerStore: 3, staffCtc: 30_000, otherOpexPerStore: 50_000 },
    note: '',
  };
}

/** Make sure the plan carries the Growth builder's cost groups (so tables list them). */
export function ensureGrowthGroups(p: Plan) {
  for (const g of GROWTH_GROUPS) if (!p.groups.some((x) => x.name === g.name)) p.groups.push({ ...g });
}

// ---- the ₹500 Cr scenario --------------------------------------------------------------------

/** New categories for the ₹500 Cr plan. Prices incl. GST; volumes are scaled by the solver. PLACEHOLDERS. */
export function growthCategories(): NewProduct[] {
  const base = { on: true, placeholder: true, growthLine: true, seasonRef: 'flat' } as const;
  return [
    // Topicals (contract-made): the base plan's cream and roll-on, switched on, plus spray and heat patches
    { ...base, id: 'p-cream', name: 'Pain relief cream', category: 'topical', inHouse: false, asp: 449, launchMonth: 5, launchUnits: 3000, rampPct: 0.15, steadyPct: 0.6, split: ch(0.45, 0.35, 0.1, 0.1), cogsPct: 0.25, marketingPct: 0.08, launchCost: 15 * L, launchCapex: 0 },
    { ...base, id: 'p-rollon', name: 'Pain relief roll-on', category: 'topical', inHouse: false, asp: 299, launchMonth: 7, launchUnits: 2500, rampPct: 0.15, steadyPct: 0.6, split: ch(0.45, 0.35, 0.1, 0.1), cogsPct: 0.25, marketingPct: 0.08, launchCost: 8 * L, launchCapex: 0 },
    { ...base, id: 'g-spray', name: 'Pain relief spray', category: 'topical', inHouse: false, asp: 349, launchMonth: 13, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: ch(0.45, 0.3, 0.1, 0.15), cogsPct: 0.28, marketingPct: 0.08, launchCost: 10 * L, launchCapex: 0 },
    { ...base, id: 'g-patch', name: 'Heat patches (pack)', category: 'topical', inHouse: false, asp: 399, launchMonth: 10, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: ch(0.4, 0.35, 0.1, 0.15), cogsPct: 0.3, marketingPct: 0.06, launchCost: 10 * L, launchCapex: 0 },
    // Nutraceuticals (contract-made)
    { ...base, id: 'g-joint', name: 'Joint support (nutra)', category: 'nutra', inHouse: false, asp: 899, launchMonth: 13, launchUnits: 1500, rampPct: 0.15, steadyPct: 0.6, split: ch(0.45, 0.4, 0.1, 0.05), cogsPct: 0.22, marketingPct: 0.1, launchCost: 20 * L, launchCapex: 0 },
    { ...base, id: 'g-mag', name: 'Magnesium / recovery (nutra)', category: 'nutra', inHouse: false, asp: 699, launchMonth: 16, launchUnits: 1200, rampPct: 0.15, steadyPct: 0.6, split: ch(0.45, 0.4, 0.1, 0.05), cogsPct: 0.22, marketingPct: 0.1, launchCost: 12 * L, launchCapex: 0 },
    { ...base, id: 'g-collagen', name: 'Collagen (nutra)', category: 'nutra', inHouse: false, asp: 999, launchMonth: 19, launchUnits: 1000, rampPct: 0.15, steadyPct: 0.6, split: ch(0.45, 0.4, 0.1, 0.05), cogsPct: 0.22, marketingPct: 0.1, launchCost: 12 * L, launchCapex: 0 },
    // New devices (made in-house: they use production capacity)
    { ...base, id: 'g-massager', name: 'Massage device', category: 'device', inHouse: true, asp: 3999, launchMonth: 16, launchUnits: 400, rampPct: 0.12, steadyPct: 0.5, split: ch(0.5, 0.3, 0.15, 0.05), cogsPct: 0.38, marketingPct: 0.05, launchCost: 20 * L, launchCapex: 40 * L },
    { ...base, id: 'g-tens', name: 'TENS / EMS device', category: 'device', inHouse: true, asp: 2999, launchMonth: 19, launchUnits: 400, rampPct: 0.12, steadyPct: 0.5, split: ch(0.45, 0.3, 0.1, 0.05, 0.1), cogsPct: 0.35, marketingPct: 0.05, launchCost: 25 * L, launchCapex: 35 * L },
    { ...base, id: 'g-hotcold', name: 'Smart hot–cold wrap', category: 'device', inHouse: true, asp: 4999, launchMonth: 25, launchUnits: 300, rampPct: 0.12, steadyPct: 0.5, split: ch(0.45, 0.35, 0.1, 0.05, 0.05), cogsPct: 0.4, marketingPct: 0.05, launchCost: 20 * L, launchCapex: 50 * L },
  ];
}

let seq = 0;
const id = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** People, capacity, capex and stores for the ₹500 Cr plan (monthly CTC in ₹). PLACEHOLDERS. */
export function growth500(): GrowthPlan {
  const h = (role: string, dept: GrowthPlan['hires'][number]['dept'], count: number, month: number, ctc: number) =>
    ({ id: id('h'), role, dept, count, month, end: null, monthlyCtc: ctc, on: true });
  return {
    ...emptyGrowth(),
    on: true,
    note: 'Every number here is a placeholder: replace with your own. Volumes of the new lines were scaled by "Solve for the target".',
    hires: [
      h('Category head — Topicals', 'corporate', 1, 4, 2.5 * L), h('Category head — Nutraceuticals', 'corporate', 1, 10, 2.5 * L),
      h('Brand & performance marketers', 'marketing', 2, 4, 1.2 * L), h('Brand & performance marketers', 'marketing', 3, 13, 1.2 * L), h('Brand & performance marketers', 'marketing', 4, 25, 1.2 * L),
      h('Sales — GT / MT / pharmacy', 'sales', 4, 7, 0.6 * L), h('Sales — GT / MT / pharmacy', 'sales', 10, 19, 0.6 * L), h('Sales — GT / MT / pharmacy', 'sales', 20, 31, 0.6 * L),
      h('R&D, formulation & regulatory', 'tech', 2, 4, 1.2 * L), h('R&D, formulation & regulatory', 'tech', 3, 16, 1.2 * L),
      h('Tech & data', 'tech', 2, 10, 1.5 * L),
      h('Supply chain & ops', 'corporate', 2, 7, 1 * L), h('Supply chain & ops', 'corporate', 3, 19, 1 * L),
      h('Finance & HR', 'corporate', 2, 7, 1 * L), h('CFO', 'corporate', 1, 19, 4 * L),
      h('Factory operators', 'factory', 15, 13, 0.25 * L), h('Factory operators', 'factory', 25, 25, 0.25 * L), h('Factory operators', 'factory', 40, 37, 0.25 * L),
    ],
    capacity: [
      { id: id('c'), name: 'Line 2 (current factory)', on: true, month: 8, leadMonths: 3, unitsPerMonth: 15_000, capex: 1.5 * CR, monthlyOpex: 3 * L },
      { id: id('c'), name: 'Line 3 (current factory)', on: true, month: 19, leadMonths: 3, unitsPerMonth: 20_000, capex: 2 * CR, monthlyOpex: 4 * L },
      { id: id('c'), name: 'Plant 2', on: true, month: 28, leadMonths: 6, unitsPerMonth: 60_000, capex: 10 * CR, monthlyOpex: 18 * L },
    ],
    capex: [
      { id: id('x'), name: 'ERP & data stack', on: true, group: 'Technology & Infrastructure', month: 12, amount: 50 * L },
      { id: id('x'), name: 'Testing & QC lab', on: true, group: 'Testing & Certification Equipment', month: 18, amount: 75 * L },
      { id: id('x'), name: 'Warehouse automation', on: true, group: 'Plant & Machinery', month: 30, amount: 1 * CR },
    ],
    rounds: [],
    stores: {
      on: false, openings: [{ month: 19, count: 2 }, { month: 25, count: 5 }, { month: 31, count: 10 }, { month: 37, count: 15 }, { month: 43, count: 20 }],
      matureRevenue: 6 * L, rampMonths: 6, capexPerStore: 15 * L, rentPerStore: 1.5 * L, staffPerStore: 3, staffCtc: 30_000, otherOpexPerStore: 50_000,
    },
  };
}

/** Multiply the launch volumes of every Growth-builder product line by k. */
function scaled(plan: Plan, k: number): Plan {
  const p = structuredClone(plan);
  for (const x of p.products) if (x.growthLine) x.launchUnits *= k;
  return p;
}

/**
 * Scale the Growth-builder product lines (launch volumes, same shape) so the exit run-rate ARR hits
 * the target. Returns the factor and the plan; null when the lines cannot reach it (no lines on).
 */
export function solveForTarget(plan: Plan, target = plan.growth?.targetArr ?? 500 * CR): { k: number; plan: Plan; arr: number } | null {
  const lines = plan.products.filter((x) => x.growthLine && x.on && x.launchUnits > 0);
  if (!lines.length) return null;
  const at = (k: number) => runRateArr(runPlan(scaled(plan, k)));
  let lo = 0, hi = 1;
  if (at(0) >= target) return { k: 0, plan: scaled(plan, 0), arr: at(0) };
  while (at(hi) < target && hi < 1e4) hi *= 2;
  if (hi >= 1e4) return null;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (at(mid) < target) lo = mid; else hi = mid; }
  const out = scaled(plan, hi);
  return { k: hi, plan: out, arr: at(hi) };
}

/**
 * Size fundraise rounds so cash never drops below `buffer` (from 3 months after the seed): each pass finds the
 * first month under the buffer and raises, a month earlier, what keeps the next `horizon` months above it (+15 %, rounded up to
 * ₹5 Cr, at least `minRound`). Pre-money is a placeholder: `multiple` × the run-rate ARR at the raise (min ₹50 Cr). Existing unconfirmed auto rounds are replaced.
 */
export function fundTheGap(plan: Plan, buffer = 5 * CR, multiple = 4, minRound = 15 * CR, horizon = 12): Plan {
  const p = structuredClone(plan);
  if (!p.growth) return p;
  // a round can't close before ~3 months after the seed; a dip before that is the overdraft's job
  const earliest = (p.fx?.seed.on ? p.fx.seed.month : 1) + 3;
  p.growth.rounds = p.growth.rounds.filter((r) => r.confirmed || !r.id.startsWith('auto-'));
  const names = ['Series A', 'Series B', 'Series C', 'Series D', 'Series E', 'Series F'];
  for (let i = 0; i < 6; i++) {
    const r = runPlan(p);
    const first = r.months.find((x) => x.m >= earliest && x.closingCash < buffer);
    if (!first) break;
    const month = Math.max(earliest, first.m - 1);
    const window = r.months.slice(month - 1, month - 1 + horizon);
    const low = Math.min(...window.map((x) => x.closingCash));
    const amount = Math.max(minRound, Math.ceil(((buffer - low) * 1.15) / (5 * CR)) * 5 * CR);
    const pre = Math.max(50 * CR, multiple * runRateArr(r, month));
    const n = p.growth.rounds.length;
    p.growth.rounds.push({ id: `auto-${i}-${month}`, name: names[n] ?? `Round ${n + 1}`, on: true, month, amount, preMoney: Math.round(pre / CR) * CR, feePct: 0.03, confirmed: false });
  }
  p.growth.rounds.sort((a, b) => a.month - b.month);
  return p;
}

export interface DilutionRow { name: string; month: number; amount: number; preMoney: number; postMoney: number; sold: number; existingAfter: number }

/** Ownership sold per round and what today's holders keep after each one (seed first, then the rounds by month). */
export function dilution(plan: Plan): DilutionRow[] {
  const out: DilutionRow[] = [];
  let keep = 1;
  const seed = plan.fx?.seed;
  const rows: { name: string; month: number; amount: number; preMoney: number }[] = [];
  if (seed?.on && plan.growth) rows.push({ name: 'Seed', month: seed.month, amount: seed.amount, preMoney: plan.growth.seedPreMoney });
  for (const r of plan.growth?.rounds ?? []) if (r.on) rows.push({ name: r.name, month: r.month, amount: r.amount, preMoney: r.preMoney });
  rows.sort((a, b) => a.month - b.month);
  for (const r of rows) {
    const post = r.preMoney + r.amount;
    const sold = post > 0 ? r.amount / post : 0;
    keep *= 1 - sold;
    out.push({ ...r, postMoney: post, sold, existingAfter: keep });
  }
  return out;
}

/** Build the ₹500 Cr scenario from a plan: categories on, people / capacity / capex, volumes solved, rounds sized. */
export function build500Cr(from: Plan): Plan {
  let p = structuredClone(from);
  p.name = 'Heatronics ₹500 Cr exit ARR — growth plan (placeholders)';
  const cats = growthCategories();
  const ids = new Set(cats.map((c) => c.id));
  p.products = [...p.products.filter((x) => !ids.has(x.id)), ...cats];
  p.growth = growth500();
  ensureGrowthGroups(p);
  const solved = solveForTarget(p);
  if (solved) p = solved.plan;
  return fundTheGap(p);
}
