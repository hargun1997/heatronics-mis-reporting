// The founder's pain-care plan (3 Nov 2026): "Zanskar route for the next 12 months — launch hGo only, double down on devices,
// focus on Amazon, Flipkart, D2C and quick commerce; from the next round, growth from GT / offline / physio; branding exercise
// right away; ₹15–20 L capex". Built from the Base like build500Cr; every ₹ figure not stated by the founder is a placeholder.
// Month 1 = Oct-26. Quick commerce has no channel of its own in the engine: it rides in the D2C share (note on the plan).
import { runPlan, type Hire, type NewProduct, type Plan, type RetailType } from './engine';
import { applyFounderDecisions } from './basePlan';
import { defaultCategories, defaultFunding, emptyGrowth, ensureGrowthGroups, fundTheGap, solvePath } from './growth';

const CR = 1e7;

const L = 1e5;
let seq = 0;
const id = (p: string) => `${p}pc${(seq++).toString(36)}`;
const ch = (a: number, d: number, f = 0, g = 0, p = 0) => ({ A: a, D: d, F: f, G: g, P: p });

/** The next round: Jan-28 (M16) — 12 months after the seed closes (Jan-27, M4); the benchmarks say ~20 months, but year-1 burn needs it then. */
export const NEXT_ROUND_MONTH = 16;

function products(): NewProduct[] {
  const base = { on: true, placeholder: true, growthLine: true, seasonRef: 'flat' } as const;
  const online = ch(0.5, 0.4, 0.1); // Amazon / D2C (incl. quick commerce) / Flipkart — no GT / physio until the next round
  const after = { G: NEXT_ROUND_MONTH, P: NEXT_ROUND_MONTH }; // offline channels switch on with the round
  return [
    // Year 1 (Oct-26 → Sep-27): topicals only, online only
    { ...base, id: 'p-cream', name: 'Pain relief cream', category: 'topical', inHouse: false, asp: 449, launchMonth: 5, launchUnits: 3000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.15, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.1, launchCost: 15 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    { ...base, id: 'p-rollon', name: 'Pain relief roll-on', category: 'topical', inHouse: false, asp: 299, launchMonth: 7, launchUnits: 2500, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.15, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.1, launchCost: 8 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    { ...base, id: 'g-oil', name: 'Pain relief oil', category: 'topical', inHouse: false, asp: 349, launchMonth: 10, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.18, repeatDecay: 0.85, cogsPct: 0.28, marketingPct: 0.1, launchCost: 8 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    // Year 2+ (after the round): the rest of the routine
    { ...base, id: 'g-spray', name: 'Pain relief spray', category: 'topical', inHouse: false, asp: 349, launchMonth: 14, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.15, repeatDecay: 0.85, cogsPct: 0.28, marketingPct: 0.08, launchCost: 10 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    { ...base, id: 'g-patch', name: 'Heat patches (pack)', category: 'topical', inHouse: false, asp: 399, launchMonth: 16, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.2, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.06, launchCost: 10 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    { ...base, id: 'g-joint', name: 'Joint support (nutra)', category: 'nutra', inHouse: false, asp: 899, launchMonth: 16, launchUnits: 1500, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.35, repeatDecay: 0.9, cogsPct: 0.22, marketingPct: 0.1, launchCost: 20 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    { ...base, id: 'g-mag', name: 'Magnesium / recovery (nutra)', category: 'nutra', inHouse: false, asp: 699, launchMonth: 20, launchUnits: 1200, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.3, repeatDecay: 0.9, cogsPct: 0.22, marketingPct: 0.1, launchCost: 15 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    { ...base, id: 'g-collagen', name: 'Collagen (nutra)', category: 'nutra', inHouse: false, asp: 999, launchMonth: 25, launchUnits: 1000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.3, repeatDecay: 0.9, cogsPct: 0.22, marketingPct: 0.1, launchCost: 15 * L, launchCapex: 0, retailStart: NEXT_ROUND_MONTH },
    // New devices only after the round (year 1 launches hGo alone — it is a sheet SKU)
    { ...base, id: 'g-tens', name: 'TENS / EMS device', category: 'device', inHouse: true, asp: 2999, launchMonth: 22, launchUnits: 400, rampPct: 0.12, steadyPct: 0.5, split: ch(0.45, 0.3, 0.1, 0.05, 0.1), repeatPct: 0, repeatDecay: 0, cogsPct: 0.35, marketingPct: 0.05, launchCost: 25 * L, launchCapex: 40 * L, retailStart: 28 },
    { ...base, id: 'g-massager', name: 'Massage device', category: 'device', inHouse: true, asp: 3999, launchMonth: 28, launchUnits: 400, rampPct: 0.12, steadyPct: 0.5, split: ch(0.5, 0.3, 0.15, 0.05), repeatPct: 0, repeatDecay: 0, cogsPct: 0.38, marketingPct: 0.05, launchCost: 30 * L, launchCapex: 60 * L, retailStart: 31 },
    { ...base, id: 'g-hotcold', name: 'Smart hot–cold wrap', category: 'device', inHouse: true, asp: 4999, launchMonth: 34, launchUnits: 300, rampPct: 0.12, steadyPct: 0.5, split: ch(0.45, 0.35, 0.1, 0.05, 0.05), repeatPct: 0, repeatDecay: 0, cogsPct: 0.4, marketingPct: 0.05, launchCost: 40 * L, launchCapex: 80 * L, retailStart: 37 },
  ];
}

/** GT / pharmacy from the round; MT a year later. Outlets are placeholders. */
function retail(): RetailType[] {
  const steps = (xs: [number, number][]) => xs.map(([month, add]) => ({ month, add }));
  const R = NEXT_ROUND_MONTH;
  return [
    { id: 'gt', name: 'General trade (chemists & general stores, via distributors)', on: true, rampMonths: 3,
      outlets: steps([[R, 500], [R + 3, 1000], [R + 6, 1500], [R + 9, 2000], [R + 12, 2500], [R + 15, 3000], [R + 18, 3500], [R + 21, 3500], [R + 24, 3500], [R + 27, 3000], [R + 30, 2500]]),
      units: { topical: 6, nutra: 1, device: 0.1, other: 0 }, tradeMarginPct: 0.5, schemePct: 0.05, listingFee: 0, servicePerOutlet: 150 },
    { id: 'pharma', name: 'Pharmacy chains + physio clinics', on: true, rampMonths: 3,
      outlets: steps([[R, 300], [R + 6, 700], [R + 12, 1000], [R + 18, 1500], [R + 24, 1500], [R + 30, 1200]]),
      units: { topical: 10, nutra: 4, device: 0.5, other: 0 }, tradeMarginPct: 0.3, schemePct: 0.05, listingFee: 2000, servicePerOutlet: 300 },
    { id: 'mt', name: 'Modern trade (Apollo, Wellness Forever, Reliance…)', on: true, rampMonths: 3,
      outlets: steps([[R + 12, 100], [R + 18, 200], [R + 24, 300], [R + 30, 400]]),
      units: { topical: 15, nutra: 5, device: 1, other: 0 }, tradeMarginPct: 0.35, schemePct: 0.08, listingFee: 5000, servicePerOutlet: 800 },
  ];
}

function hires(): Hire[] {
  const h = (role: string, dept: Hire['dept'], count: number, month: number, ctc: number): Hire => ({ id: id('h'), role, dept, count, month, end: null, monthlyCtc: ctc, on: true });
  const sc = (x: Hire, by: NonNullable<Hire['scale']>['by'], every: number, type?: string): Hire => ({ ...x, scale: { by, every, ...(type ? { type } : {}) } });
  const R = NEXT_ROUND_MONTH;
  return [
    // year 1: lean, online
    h('Performance marketing lead (Amazon, Flipkart, D2C, q-com)', 'marketing', 1, 3, 1.5 * L),
    h('Category head — Topicals', 'corporate', 1, 4, 2.5 * L),
    h('Content & creators', 'marketing', 2, 5, 0.8 * L),
    h('R&D, formulation & regulatory', 'tech', 1, 4, 1.2 * L),
    sc(h('Customer support (1 per ₹5 Cr revenue)', 'corporate', 2, 1, 0.25 * L), 'revenue', 5),
    sc(h('Warehouse & dispatch (1 per 6,000 units / mo)', 'corporate', 4, 1, 0.18 * L), 'units', 6000),
    // from the round: offline + the rest of the team
    h('Head of offline sales (GT / pharmacy / physio)', 'sales', 1, R - 3, 4 * L),
    sc(h('GT sales reps (1 per 500 outlets)', 'sales', 0, R, 0.3 * L), 'outlets', 500, 'gt'),
    sc(h('Pharmacy & physio reps (1 per 300 outlets)', 'sales', 0, R, 0.35 * L), 'outlets', 300, 'pharma'),
    sc(h('MT KAMs (1 per 25 stores)', 'sales', 0, R + 12, 0.2 * L), 'outlets', 25, 'mt'),
    h('Category head — Nutraceuticals', 'corporate', 1, R - 3, 2.5 * L),
    h('Brand & performance marketers', 'marketing', 3, R, 1.2 * L), h('Head of marketing', 'marketing', 1, R + 6, 4 * L),
    h('Supply chain & ops', 'corporate', 2, R, 1 * L), h('Finance & HR', 'corporate', 2, R, 1 * L), h('CFO', 'corporate', 1, R + 12, 4 * L),
    h('Tech & data', 'tech', 2, R + 6, 1.5 * L), h('R&D — devices', 'tech', 2, R, 1.2 * L),
    h('Factory operators', 'factory', 10, R, 0.25 * L), h('Factory operators', 'factory', 20, R + 12, 0.25 * L), h('Factory operators', 'factory', 30, R + 24, 0.25 * L),
    sc(h('Finance, HR & admin (1 per ₹25 Cr revenue)', 'corporate', 1, R, 0.8 * L), 'revenue', 25),
  ];
}

/** The founder's pain-care plan on top of `from` (normally the Base). */
export function buildPainCarePlan(from: Plan): Plan {
  let p = structuredClone(from);
  p.name = 'Pain care — online first, offline from the next round (Nov 2026)';
  if (!p.fx) applyFounderDecisions(p);
  p.fx!.sheetParity = false;
  // double down on devices: the sheet's device volumes up, hGo pushed harder (placeholders)
  for (const s of p.skus) p.fx!.skuTweaks[s.id] = { volume: s.id === 's8' ? 1.5 : 1.2, asp: null };
  const R = NEXT_ROUND_MONTH;
  const cats = products();
  const ids = new Set(cats.map((c) => c.id));
  p.products = [...p.products.filter((x) => !ids.has(x.id) && !x.placeholder), ...cats];
  p.growth = {
    ...emptyGrowth(),
    on: true,
    note: 'Founder plan, 3 Nov 2026: online only (Amazon, Flipkart, D2C incl. quick commerce) for 12 months with topicals + hGo; GT, pharmacy, physio and the rest of the range from the next round (Jan-28). Branding ₹50 L and ₹17.5 L capex now are placeholders — set the real numbers.',
    // FY28 is left to the launch plan itself (a target there would make the solver zero the topicals: devices alone already pass ₹30 Cr)
    path: { FY29: 100 * CR, FY30: 250 * CR, FY31: 500 * CR },
    categories: defaultCategories(),
    retail: retail(),
    hires: hires(),
    capacity: [
      { id: id('c'), name: 'Line 2 (current factory)', on: true, month: R, leadMonths: 3, unitsPerMonth: 15_000, capex: 1.5 * CR, monthlyOpex: 3 * L },
      { id: id('c'), name: 'Line 3 (current factory)', on: true, month: R + 12, leadMonths: 3, unitsPerMonth: 20_000, capex: 2 * CR, monthlyOpex: 4 * L },
      { id: id('c'), name: 'Plant 2', on: true, month: R + 21, leadMonths: 6, unitsPerMonth: 60_000, capex: 10 * CR, monthlyOpex: 18 * L },
    ],
    capex: [
      { id: id('x'), name: 'Branding exercise — new master brand (placeholder)', on: true, group: 'Brand & Creative Build', month: 3, amount: 50 * L },
      { id: id('x'), name: 'Capex now (founder: ₹15–20 L)', on: true, group: 'Plant & Machinery', month: 2, amount: 17.5 * L },
      { id: id('x'), name: 'ERP & data stack', on: true, group: 'Technology & Infrastructure', month: R, amount: 50 * L },
      { id: id('x'), name: 'Testing & QC lab', on: true, group: 'Testing & Certification Equipment', month: R + 6, amount: 75 * L },
    ],
    rounds: [],
  };
  ensureGrowthGroups(p);
  // the next round: benchmark Series A (3.5× run-rate ARR at the round, min ₹50 Cr pre-money), sized by fundTheGap around it
  p = solvePath(p).plan;
  const r = runPlan(p);
  // pre-money = 3.5 × trailing-12-month revenue at the round (a winter run-rate alone would flatter it)
  const ttm = r.months.slice(Math.max(0, R - 12), R).reduce((a, m) => a + m.netRevenue, 0);
  p.growth!.rounds = [{ id: 'bench-a', name: 'Series A (next round)', on: true, month: R, amount: 35 * CR, preMoney: Math.max(50 * CR, Math.round(3.5 * ttm / CR) * CR), feePct: 0.03, confirmed: false }];
  p.growth!.funding = { ...defaultFunding(), ...p.growth!.funding, earliestAfterSeed: R - 4 };
  return fundTheGap(p);
}
