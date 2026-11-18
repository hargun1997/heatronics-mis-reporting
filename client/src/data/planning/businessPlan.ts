// The 5-year business plan shared with investors (founder, 18 Nov 2026): the pain-care plan's team, capacity, capex and
// offline rollout, with the product lines and yearly revenue of the business plan doc. Month 1 = Oct-26.
//   Devices (sheet SKUs): FY28 as the 18-month sheet, then +100 % / +80 % / +56 % a year (FY29–FY31).
//   Topicals (cream Feb-27, roll-on Apr-27), nutraceuticals (from Apr-28), TENS / recovery (from Jul-28): revenue per FY
//   is set by the targets below (`BUSINESS_PLAN_TARGETS`); units follow from price, repeats and outlets.
//   OEM / B2B: wound down, stops after Sep-27 (founder decision, Nov 2026).
//   Rounds: Seed ₹8 Cr Jan-27 (fx.seed) + venture debt, Series A ₹30 Cr Jan-28, Series B ₹100 Cr Jul-29 (pre-money placeholders).
import { runPlan, type NewProduct, type Plan, type PlanResult } from './engine';
import { buildPainCarePlan, NEXT_ROUND_MONTH } from './painCare';

const CR = 1e7;
const ch = (a: number, d: number, f = 0, g = 0, p = 0) => ({ A: a, D: d, F: f, G: g, P: p });

export type LineKey = 'devices' | 'topicals' | 'nutra' | 'tens' | 'oem';
export const LINE_NAMES: Record<LineKey, string> = {
  devices: 'Heat devices (hCore, hGo)', topicals: 'Topicals', nutra: 'Nutraceuticals', tens: 'TENS & recovery devices', oem: 'OEM / B2B (stops Sep-27)',
};

/** Revenue per FY (₹ Cr, P&L revenue) the new lines are set to. Devices follow the sheet + `DEVICE_GROWTH`. */
export const BUSINESS_PLAN_TARGETS: Record<Exclude<LineKey, 'devices'>, Record<string, number>> = {
  topicals: { FY27: 0.1, FY28: 6, FY29: 22, FY30: 60, FY31: 140 },
  nutra: { FY29: 4, FY30: 20, FY31: 80 },
  tens: { FY29: 2, FY30: 10, FY31: 40 },
  oem: { FY27: 1.6, FY28: 0.8 },
};
export const DEVICE_GROWTH: Record<string, number> = { FY29: 0.95, FY30: 0.78, FY31: 0.54 };
export const SERIES_A_MONTH = NEXT_ROUND_MONTH; // Jan-28
export const SERIES_B_MONTH = 34; // Jul-29 (FY30)

function lines(): NewProduct[] {
  const base = { on: true, placeholder: true, growthLine: true, seasonRef: 'flat' } as const;
  const R = NEXT_ROUND_MONTH;
  const after = { G: R, P: R };
  const mix = ch(0.42, 0.33, 0.1, 0.1, 0.05);
  return [
    { ...base, id: 'p-cream', name: 'Pain relief cream', category: 'topical', inHouse: false, asp: 449, launchMonth: 5, launchUnits: 3000, rampPct: 0.15, steadyPct: 0.6, split: mix, chStart: after, retailStart: R, repeatPct: 0.12, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.1, launchCost: 15e5, launchCapex: 0 },
    { ...base, id: 'p-rollon', name: 'Pain relief roll-on', category: 'topical', inHouse: false, asp: 299, launchMonth: 7, launchUnits: 2500, rampPct: 0.15, steadyPct: 0.6, split: mix, chStart: after, retailStart: R, repeatPct: 0.12, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.1, launchCost: 8e5, launchCapex: 0 },
    { ...base, id: 'bp-joint', name: 'Joint support (nutra)', category: 'nutra', inHouse: false, asp: 899, launchMonth: 19, launchUnits: 1500, rampPct: 0.15, steadyPct: 0.6, split: mix, retailStart: 31, repeatPct: 0.3, repeatDecay: 0.9, cogsPct: 0.25, marketingPct: 0.1, launchCost: 20e5, launchCapex: 0 },
    { ...base, id: 'bp-recovery', name: 'Muscle recovery (nutra)', category: 'nutra', inHouse: false, asp: 699, launchMonth: 22, launchUnits: 1200, rampPct: 0.15, steadyPct: 0.6, split: mix, retailStart: 31, repeatPct: 0.3, repeatDecay: 0.9, cogsPct: 0.25, marketingPct: 0.1, launchCost: 15e5, launchCapex: 0 },
    { ...base, id: 'bp-tens', name: 'TENS / recovery device', category: 'device', inHouse: true, asp: 2999, launchMonth: 22, launchUnits: 400, rampPct: 0.12, steadyPct: 0.5, split: ch(0.45, 0.3, 0.1, 0.05, 0.1), retailStart: 28, repeatPct: 0, repeatDecay: 0, cogsPct: 0.35, marketingPct: 0.05, launchCost: 25e5, launchCapex: 40e5 },
    // OEM rides the physio / institutional channel (no channel of its own); no marketing, contract margin ~20 %
    { ...base, id: 'bp-oem', name: 'OEM / B2B (wind-down)', category: 'other', inHouse: true, asp: 357, launchMonth: 1, launchUnits: 3000, rampPct: 0, steadyPct: 1, split: ch(0, 0, 0, 0, 1), repeatPct: 0, repeatDecay: 0, cogsPct: 0.8, marketingPct: 0, launchCost: 0, launchCapex: 0, lastMonth: 12, unitsByFy: { FY27: 45000, FY28: 22000 } },
  ];
}

const LINE_OF: Record<string, LineKey> = { 'p-cream': 'topicals', 'p-rollon': 'topicals', 'bp-joint': 'nutra', 'bp-recovery': 'nutra', 'bp-tens': 'tens', 'bp-oem': 'oem' };

/** Which line a SKU / product id belongs to (sheet SKUs = devices). */
export function lineOf(id: string): LineKey { return LINE_OF[id] ?? 'devices'; }

/** Revenue and units per line per FY (revenue = the P&L basis: net revenue). */
export function lineTable(r: PlanResult): { fy: string; revenue: Record<LineKey, number>; units: Record<LineKey, number> }[] {
  const out = new Map<string, { fy: string; revenue: Record<LineKey, number>; units: Record<LineKey, number> }>();
  const zero = () => ({ devices: 0, topicals: 0, nutra: 0, tens: 0, oem: 0 });
  for (const m of r.months) {
    let y = out.get(m.fy);
    if (!y) { y = { fy: m.fy, revenue: zero(), units: zero() }; out.set(m.fy, y); }
    const gross = Object.values(m.revenueBySku).reduce((a, x) => a + x, 0) || 1;
    for (const [id, v] of Object.entries(m.revenueBySku)) y.revenue[lineOf(id)] += (v / gross) * m.netRevenue; // spread net revenue by gross share
    for (const [id, v] of Object.entries(m.unitsBySku)) y.units[lineOf(id)] += v;
  }
  return [...out.values()];
}

/** The business plan on top of `from` (normally the Base). */
export function buildBusinessPlan(from: Plan): Plan {
  let p = buildPainCarePlan(from);
  p.name = 'Business plan — 5 years, FY27–FY31 (Nov 2026)';
  for (const s of p.skus) p.fx!.skuTweaks[s.id] = { volume: 1, asp: null };
  for (const [fy, g] of Object.entries(DEVICE_GROWTH)) p.levers.growth[fy] = ch(g, g, g, g, g);
  const keep = new Set(['gt', 'pharma', 'mt']);
  const mine = lines();
  const ids = new Set(mine.map((x) => x.id));
  p.products = [...p.products.filter((x) => !x.growthLine && !ids.has(x.id) && !x.placeholder), ...mine];
  const G = p.growth!;
  G.retail = (G.retail ?? []).filter((t) => keep.has(t.id));
  // capacity: today ~2,000 units a day × 26 days (founder, Oct 2026); a second shift for the FY30 winter, Plant 2 for FY31
  G.baseCapacity = 52_000;
  G.capacity = [
    { id: 'bp-shift2', name: 'Second shift (current factory)', on: true, month: 31, leadMonths: 3, unitsPerMonth: 40_000, capex: 1.5 * CR, monthlyOpex: 8e5 },
    { id: 'bp-plant2', name: 'Plant 2', on: true, month: 37, leadMonths: 6, unitsPerMonth: 60_000, capex: 10 * CR, monthlyOpex: 18e5 },
  ];
  G.path = undefined; G.push = {};
  G.note = 'Business plan sent to investors (Nov 2026). Devices: sheet to FY28, then +100 % / +80 % / +56 %. Topicals, nutraceuticals and TENS sized to the yearly revenue in the plan; OEM stops after Sep-27. Series A ₹30 Cr Jan-28, Series B ₹100 Cr Jul-29 (pre-money placeholders).';
  G.rounds = [
    { id: 'bp-a', name: 'Series A', on: true, month: SERIES_A_MONTH, amount: 30 * CR, preMoney: 120 * CR, feePct: 0.03, confirmed: false },
    { id: 'bp-b', name: 'Series B', on: true, month: SERIES_B_MONTH, amount: 100 * CR, preMoney: 600 * CR, feePct: 0.03, confirmed: false },
  ];
  p = fitLines(p);
  return p;
}

/** Scale each new line's typed units per FY until its net revenue lands on the target (±0.5 %). */
export function fitLines(plan: Plan): Plan {
  const p = structuredClone(plan);
  const fys = ['FY27', 'FY28', 'FY29', 'FY30', 'FY31'];
  const byLine = (k: LineKey) => p.products.filter((x) => lineOf(x.id) === k);
  // start: a guess of units from price
  for (const [k, t] of Object.entries(BUSINESS_PLAN_TARGETS) as [Exclude<LineKey, 'devices'>, Record<string, number>][]) {
    const ps = byLine(k);
    for (const x of ps) {
      x.unitsByFy = {};
      for (const fy of fys) x.unitsByFy[fy] = t[fy] ? Math.round((t[fy] * CR) / ps.length / (x.asp / 1.05)) : 0;
    }
  }
  // FY by FY (repeats and outlets carry into later years), scaling each line's typed units until net revenue is on target
  for (const fy of fys) {
    for (let it = 0; it < 20; it++) {
      const table = lineTable(runPlan(p));
      let worst = 0;
      for (const [k, t] of Object.entries(BUSINESS_PLAN_TARGETS) as [Exclude<LineKey, 'devices'>, Record<string, number>][]) {
        const want = (t[fy] ?? 0) * CR;
        if (!want) { for (const x of byLine(k)) x.unitsByFy![fy] = 0; continue; }
        const got = table.find((y) => y.fy === fy)?.revenue[k] ?? 0;
        for (const x of byLine(k)) { const u = x.unitsByFy![fy] ?? 0; if (got > 0 && u > 0) x.unitsByFy![fy] = Math.max(1, Math.round(u * (1 + (want / got - 1) * 1.2))); }
        worst = Math.max(worst, Math.abs(got - want) / want);
      }
      if (worst < 0.003) break;
    }
  }
  return p;
}
