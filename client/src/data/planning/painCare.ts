// The founder's pain-care plan (3 Nov 2026): "Zanskar route for the next 12 months — launch hGo only, double down on devices,
// focus on Amazon, Flipkart, D2C and quick commerce; from the next round, growth from GT / offline / physio; branding exercise
// right away; ₹15–20 L capex". Lean first (founder, 7 Nov 2026): "burn less, stay small and nimble until the rebranding and the
// topical launch is done, then only we proceed with scaling on marketing; till then very basic like we are today, maybe leading
// up to March". Built from the Base like build500Cr; every ₹ figure not stated by the founder is a placeholder.
// Month 1 = Oct-26. Quick commerce has no channel of its own in the engine: it rides in the D2C share (note on the plan).
import { runPlan, type Channel, type Hire, type NewProduct, type Overhead, type Plan, type RetailType } from './engine';
import { applyFounderDecisions } from './basePlan';
import { defaultCapacityWeights, defaultCategories, defaultFunding, emptyGrowth, ensureGrowthGroups, fundTheGap, solvePath } from './growth';
import { applyTallyOpening } from './opening';
import type { StatementMonthIn } from '../statements/statements';

const CR = 1e7;

const L = 1e5;
let seq = 0;
const id = (p: string) => `${p}pc${(seq++).toString(36)}`;
const ch = (a: number, d: number, f = 0, g = 0, p = 0) => ({ A: a, D: d, F: f, G: g, P: p });

/** Lean phase Oct-26 → Mar-27 (M1–M6): today's team and spend, the rebrand and the cream launch (Mar-27). */
export const LEAN_UNTIL = 6;
/** Scale phase from Apr-27 (M7): the device push, growth marketing and the growth hires start. */
export const SCALE_FROM = LEAN_UNTIL + 1;
/** Offline (GT, pharmacy, physio), new devices and the rest of the team: Jan-28 (M16). */
export const OFFLINE_MONTH = 16;
/** Series A: Sep-27 (M12). At M16 the scale phase runs cash to ≈ −₹5.5 Cr in Nov-27 (past the ₹2 Cr CC limit); M13 is already −₹2.6 Cr. */
export const SERIES_A_MONTH = 12;
/** kept for older imports: "the next round" = the Series A */
export const NEXT_ROUND_MONTH = SERIES_A_MONTH;
/** Founder round sizes (7 Nov 2026): Series A ₹30 Cr (sized up to ₹40 Cr rather than adding a bridge), Series B ₹100 Cr Jul-29. */
export const SERIES_A_CR = 30;
export const SERIES_A_MAX_CR = 40;
export const SERIES_B_CR = 100;
export const SERIES_B_MONTH = 34;
/** Seed pre-money agreed (founder, 6 Nov 2026) and the CC / overdraft limit being sought. */
export const SEED_PRE_MONEY_CR = 23;
export const OVERDRAFT_LIMIT_CR = 2;
/** Cash the round sizing keeps in hand (≈ 3 months of the scale phase's burn). */
export const FUNDING_BUFFER_CR = 5;

/**
 * Engine mechanics the plan uses (review, 9 Nov 2026), each a switch so its effect can be shown one at a time:
 * capacity = line time in pad-equivalents + lost sales above capacity (reported, not capped); receivables = days per channel;
 * rule89 = GST refund per Rule 89(5); opening = the Tally Sep-26 balance sheet when supplied; fundraiseCapital = share-issue costs off
 * the equity; advances = contract-made topicals / nutra paid 50 % with the PO; overheads = warehouses, office and the Plant 2 building.
 */
export type PainCareFix = 'capacity' | 'receivables' | 'rule89' | 'opening' | 'fundraiseCapital' | 'advances' | 'overheads';
export const PAIN_CARE_FIXES: PainCareFix[] = ['capacity', 'receivables', 'rule89', 'opening', 'fundraiseCapital', 'advances', 'overheads'];

/** Receivable days by how the money comes in (placeholders until Supernode's and the distributors' terms are signed). */
export const RECEIVABLE_DAYS = { amazon: 20, flipkart: 15, d2cPrepaid: 3, d2cCod: 10, quickCommerce: 30, offline: 45, b2b: 30 };
/** D2C money mix: prepaid gateways, COD remittance, quick commerce (rides in the D2C share). Placeholder. */
export const D2C_MONEY_MIX = { prepaid: 0.6, cod: 0.3, quickCommerce: 0.1 };
export function painCareReceivableDays(): Partial<Record<Channel | 'retail' | 'stores', number>> {
  const R = RECEIVABLE_DAYS, X = D2C_MONEY_MIX;
  const d2c = X.prepaid * R.d2cPrepaid + X.cod * R.d2cCod + X.quickCommerce * R.quickCommerce; // 7.8 days
  // GT and physio / clinic channels and the outlets are distributor / trade credit; there is no B2B channel in the engine (30 days when added)
  return { A: R.amazon, D: Math.round(d2c * 10) / 10, F: R.flipkart, G: R.offline, P: R.offline, retail: R.offline, stores: 0 };
}
/** Contract manufacturers want half the PO up front (placeholder). */
export const CM_ADVANCE_PCT = 0.5;

/** Space rules for the overheads (placeholders): own warehouse space for the stock not sitting at Amazon / 3PL nodes. */
export const SPACE = {
  /** share of the stock held in our own warehouses (the rest at Amazon FBA / Flex / 3PL nodes) */
  ownStockShare: 0.6, unitsPerSqft: 75, warehouseHaveSqft: 2_000, warehouseRent: 28, warehouseRunningPerSqft: 5, warehouseFitoutPerSqft: 100,
  /** office: seats today in the factory building, sq ft per seat, people the base team already has */
  officeHaveSeats: 20, sqftPerSeat: 100, baseOfficeTeam: 16, officeRent: 90, officeRunningPerSqft: 20, officeFitoutPerSqft: 800,
  step: 5_000, headroom: 1.2, leadMonths: 6,
  /** Plant 2 building (founder brief): 60k sq ft × ₹30 = ₹18 L a month, 6 months' deposit ₹1.08 Cr, fit-out ₹2.5 Cr, 9 months to fit out and license */
  plant2Sqft: 60_000, plant2Rent: 30, plant2DepositMonths: 6, plant2Fitout: 2.5 * CR, plant2LeadMonths: 9,
};

/**
 * Warehouses and office sized from the plan's own stock and headcount, and the Plant 2 building tied to its capacity block (pure: runs
 * the plan once). A site is added `leadMonths` before the space is needed, in 5,000 sq ft steps with 20 % headroom.
 */
export function sizeOverheads(p: Plan): Overhead[] {
  const r = runPlan(p);
  const S = SPACE;
  const out: Overhead[] = [];
  const site = (name: string, group: string, month: number, sqft: number, rent: number, running: number, depositMonths: number, fitout: number): Overhead =>
    ({ id: id('o'), name, on: true, kind: 'site', group, month, end: null, amount: 0, growthPct: 0.05, sqft, rentPerSqft: rent, runningPerMonth: running, depositMonths, fitout });
  const officeIds = new Set((p.growth?.hires ?? []).filter((h) => h.dept !== 'factory' && h.dept !== 'store' && !/warehouse|reps|kam/i.test(h.role)).map((h) => h.id));
  const need = r.months.map((m) => {
    const perUnit = m.units > 0 ? m.stdCogs / m.units : 0;
    const stockUnits = perUnit > 0 ? m.inventory / perUnit : 0;
    const seats = S.baseOfficeTeam + Object.entries(m.headcountByHire).reduce((a, [hid, n]) => a + (officeIds.has(hid) ? n : 0), 0);
    return { wh: (stockUnits * S.ownStockShare) / S.unitsPerSqft, office: seats * S.sqftPerSeat };
  });
  let wh = S.warehouseHaveSqft, office = S.officeHaveSeats * S.sqftPerSeat, nWh = 0, nOff = 0;
  for (let m = SCALE_FROM; m <= r.months.length; m++) {
    const ahead = need.slice(m - 1, m - 1 + S.leadMonths);
    const wNeed = Math.max(...ahead.map((x) => x.wh)), oNeed = Math.max(...ahead.map((x) => x.office));
    if (wNeed > wh) {
      const sq = Math.ceil((wNeed * S.headroom - wh) / S.step) * S.step;
      out.push(site(`Warehouse ${++nWh} (sized from stock, placeholder)`, 'Rent & Facilities', m, sq, S.warehouseRent, sq * S.warehouseRunningPerSqft, 6, sq * S.warehouseFitoutPerSqft));
      wh += sq;
    }
    if (oNeed > office) {
      const sq = Math.ceil((oNeed * S.headroom - office) / S.step) * S.step;
      out.push(site(nOff++ ? `Office expansion ${nOff} (sized from headcount, placeholder)` : 'Corporate office (sized from headcount, placeholder)', 'Rent & Facilities', m, sq, S.officeRent, sq * S.officeRunningPerSqft, 10, sq * S.officeFitoutPerSqft));
      office += sq;
    }
  }
  const plant2 = p.growth?.capacity.find((c) => c.on && /plant 2/i.test(c.name));
  if (plant2) {
    // lease from 9 months before the plant makes anything (fit-out, power, BIS / CDSCO site licences); factory rent sits in COGM like today's
    const month = Math.max(1, plant2.month + plant2.leadMonths - S.plant2LeadMonths);
    out.push(site('Plant 2 building (lease, deposit, fit-out)', 'Manufacturing Overhead', month, S.plant2Sqft, S.plant2Rent, 0, S.plant2DepositMonths, S.plant2Fitout));
  }
  return out;
}

function products(): NewProduct[] {
  const base = { on: true, placeholder: true, growthLine: true, seasonRef: 'flat' } as const;
  const online = ch(0.5, 0.4, 0.1); // Amazon / D2C (incl. quick commerce) / Flipkart — no GT / physio until offline starts
  const O = OFFLINE_MONTH;
  const after = { G: O, P: O }; // offline channels switch on together
  return [
    // the topical launch: cream at the end of the lean phase, roll-on in Q1 of the scale phase, oil after Oct-27
    { ...base, id: 'p-cream', name: 'Pain relief cream', category: 'topical', inHouse: false, asp: 449, launchMonth: 6, launchUnits: 3000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.15, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.1, launchCost: 15 * L, launchCapex: 0, retailStart: O },
    { ...base, id: 'p-rollon', name: 'Pain relief roll-on', category: 'topical', inHouse: false, asp: 299, launchMonth: 9, launchUnits: 2500, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.15, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.1, launchCost: 8 * L, launchCapex: 0, retailStart: O },
    { ...base, id: 'g-oil', name: 'Pain relief oil', category: 'topical', inHouse: false, asp: 349, launchMonth: 14, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.18, repeatDecay: 0.85, cogsPct: 0.28, marketingPct: 0.1, launchCost: 8 * L, launchCapex: 0, retailStart: O },
    // after the Series A and offline: at most one launch a quarter
    { ...base, id: 'g-spray', name: 'Pain relief spray', category: 'topical', inHouse: false, asp: 349, launchMonth: 17, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.15, repeatDecay: 0.85, cogsPct: 0.28, marketingPct: 0.08, launchCost: 10 * L, launchCapex: 0, retailStart: O },
    { ...base, id: 'g-patch', name: 'Heat patches (pack)', category: 'topical', inHouse: false, asp: 399, launchMonth: 20, launchUnits: 2000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.2, repeatDecay: 0.85, cogsPct: 0.3, marketingPct: 0.06, launchCost: 10 * L, launchCapex: 0, retailStart: O },
    { ...base, id: 'g-joint', name: 'Joint support (nutra)', category: 'nutra', inHouse: false, asp: 899, launchMonth: 23, launchUnits: 1500, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.35, repeatDecay: 0.9, cogsPct: 0.22, marketingPct: 0.1, launchCost: 20 * L, launchCapex: 0, retailStart: O },
    { ...base, id: 'g-tens', name: 'TENS / EMS device', category: 'device', inHouse: true, asp: 2999, launchMonth: 26, launchUnits: 400, rampPct: 0.12, steadyPct: 0.5, split: ch(0.45, 0.3, 0.1, 0.05, 0.1), repeatPct: 0, repeatDecay: 0, cogsPct: 0.35, marketingPct: 0.05, launchCost: 25 * L, launchCapex: 40 * L, retailStart: 29 },
    { ...base, id: 'g-mag', name: 'Magnesium / recovery (nutra)', category: 'nutra', inHouse: false, asp: 699, launchMonth: 29, launchUnits: 1200, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.3, repeatDecay: 0.9, cogsPct: 0.22, marketingPct: 0.1, launchCost: 15 * L, launchCapex: 0, retailStart: O },
    { ...base, id: 'g-massager', name: 'Massage device', category: 'device', inHouse: true, asp: 3999, launchMonth: 32, launchUnits: 400, rampPct: 0.12, steadyPct: 0.5, split: ch(0.5, 0.3, 0.15, 0.05), repeatPct: 0, repeatDecay: 0, cogsPct: 0.38, marketingPct: 0.05, launchCost: 30 * L, launchCapex: 60 * L, retailStart: 35 },
    { ...base, id: 'g-collagen', name: 'Collagen (nutra)', category: 'nutra', inHouse: false, asp: 999, launchMonth: 35, launchUnits: 1000, rampPct: 0.15, steadyPct: 0.6, split: online, chStart: after, repeatPct: 0.3, repeatDecay: 0.9, cogsPct: 0.22, marketingPct: 0.1, launchCost: 15 * L, launchCapex: 0, retailStart: O },
    { ...base, id: 'g-hotcold', name: 'Smart hot–cold wrap', category: 'device', inHouse: true, asp: 4999, launchMonth: 38, launchUnits: 300, rampPct: 0.12, steadyPct: 0.5, split: ch(0.45, 0.35, 0.1, 0.05, 0.05), repeatPct: 0, repeatDecay: 0, cogsPct: 0.4, marketingPct: 0.05, launchCost: 40 * L, launchCapex: 80 * L, retailStart: 41 },
  ];
}

/** GT / pharmacy from the offline month; MT a year later. Outlets are placeholders. */
function retail(): RetailType[] {
  const steps = (xs: [number, number][]) => xs.map(([month, add]) => ({ month, add }));
  const R = OFFLINE_MONTH;
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

/** Topical roles hired for the cream launch (the only growth hires in the lean phase). */
export const LEAN_HIRE_ROLES = ['Category head — Topicals', 'R&D, formulation & regulatory'];

function hires(): Hire[] {
  const h = (role: string, dept: Hire['dept'], count: number, month: number, ctc: number): Hire => ({ id: id('h'), role, dept, count, month, end: null, monthlyCtc: ctc, on: true });
  const sc = (x: Hire, by: NonNullable<Hire['scale']>['by'], every: number, type?: string): Hire => ({ ...x, scale: { by, every, ...(type ? { type } : {}) } });
  const S = SCALE_FROM, O = OFFLINE_MONTH;
  const launch = (pid: string) => products().find((p) => p.id === pid)!.launchMonth;
  return [
    // lean phase: only the two roles the cream (Mar-27) needs, in seat early enough to get it formulated and licensed
    h(LEAN_HIRE_ROLES[0], 'corporate', 1, 2, 2.5 * L),
    h(LEAN_HIRE_ROLES[1], 'tech', 1, 2, 1.2 * L),
    // scale phase (Apr-27): online growth
    h('Performance marketing lead (Amazon, Flipkart, D2C, q-com)', 'marketing', 1, S, 1.5 * L),
    h('Content & creators', 'marketing', 2, S, 0.8 * L),
    sc(h('Customer support (1 per ₹5 Cr revenue)', 'corporate', 2, S, 0.25 * L), 'revenue', 5),
    sc(h('Warehouse & dispatch (1 per 6,000 units / mo)', 'corporate', 4, S, 0.18 * L), 'units', 6000),
    // in seat 3 months before what they serve
    h('Finance controller (Series A diligence)', 'corporate', 1, Math.min(SERIES_A_MONTH, OFFLINE_MONTH) - 3, 2.5 * L),
    h('Head of offline sales (GT / pharmacy / physio)', 'sales', 1, O - 3, 4 * L),
    h('Category head — Nutraceuticals', 'corporate', 1, launch('g-joint') - 3, 2.5 * L),
    h('R&D — devices', 'tech', 2, launch('g-tens') - 12, 1.2 * L), // device certification takes ~a year
    // offline + the rest of the team
    sc(h('GT sales reps (1 per 500 outlets)', 'sales', 0, O, 0.3 * L), 'outlets', 500, 'gt'),
    sc(h('Pharmacy & physio reps (1 per 300 outlets)', 'sales', 0, O, 0.35 * L), 'outlets', 300, 'pharma'),
    sc(h('MT KAMs (1 per 25 stores)', 'sales', 0, O + 12, 0.2 * L), 'outlets', 25, 'mt'),
    h('Brand & performance marketers', 'marketing', 3, O, 1.2 * L), h('Head of marketing', 'marketing', 1, O + 6, 4 * L),
    h('Supply chain & ops', 'corporate', 2, O, 1 * L), h('Finance & HR', 'corporate', 2, O, 1 * L), h('CFO', 'corporate', 1, O + 12, 4 * L),
    h('Tech & data', 'tech', 2, O + 6, 1.5 * L),
    h('Factory operators', 'factory', 10, O, 0.25 * L), h('Factory operators', 'factory', 20, O + 12, 0.25 * L), h('Factory operators', 'factory', 30, O + 24, 0.25 * L),
    sc(h('Finance, HR & admin (1 per ₹25 Cr revenue)', 'corporate', 1, O, 0.8 * L), 'revenue', 25),
  ];
}

/** Series A and B at the founder's sizes; the A grows (₹5 Cr steps, ≤ ₹40 Cr) before any bridge is added between them. */
function withRounds(p0: Plan, A: number, B: number): Plan {
  const r = runPlan(p0);
  // pre-money = 3.5 × trailing-12-month revenue at the round (a winter run-rate alone would flatter it); B at 4 × TTM
  const ttm = (m: number) => r.months.slice(Math.max(0, m - 13), m - 1).reduce((a, x) => a + x.netRevenue, 0);
  const preA = Math.max(50 * CR, Math.round(3.5 * ttm(A) / CR) * CR);
  const preB = Math.max(150 * CR, Math.round(4 * ttm(B) / CR) * CR);
  let out = p0;
  for (let a = SERIES_A_CR; a <= SERIES_A_MAX_CR; a += 5) {
    const p = structuredClone(p0);
    p.growth!.rounds = [
      { id: 'bench-a', name: 'Series A', on: true, month: A, amount: a * CR, preMoney: preA, feePct: 0.03, confirmed: false },
      { id: 'bench-b', name: 'Series B', on: true, month: B, amount: SERIES_B_CR * CR, preMoney: preB, feePct: 0.03, confirmed: false },
    ];
    // buffer ₹5 Cr ≈ 3 months of the scale phase's burn (the ₹10 Cr default would force a bridge before the B)
    p.growth!.funding = { ...defaultFunding(), ...p.growth!.funding, buffer: FUNDING_BUFFER_CR * CR, earliestAfterSeed: A - p.fx!.seed.month };
    out = fundTheGap(p);
    if (!out.growth!.rounds.some((x) => x.id.startsWith('auto-') && x.month < B)) break;
  }
  // a gap fundTheGap still fills between the A and the B is a bridge, not a lettered round
  for (const x of out.growth!.rounds) if (x.id.startsWith('auto-') && x.month > A && x.month < B) x.name = 'Bridge (A extension)';
  return out;
}

/** The founder's pain-care plan on top of `from` (normally the Base). */
export function buildPainCarePlan(from: Plan, opts: {
  seriesAMonth?: number; seriesBMonth?: number;
  /** months of GET /api/tally/statements: the month before the start becomes the opening balance sheet */
  statements?: StatementMonthIn[] | null;
  /** the engine fixes to apply (default all; [] = the plan as before the 9 Nov 2026 review) */
  fixes?: PainCareFix[];
} = {}): Plan {
  const fix = new Set(opts.fixes ?? PAIN_CARE_FIXES);
  let p = structuredClone(from);
  p.name = 'Pain care — lean to Mar-27, online first, offline from Jan-28 (Nov 2026)';
  if (!p.fx) applyFounderDecisions(p);
  p.fx!.sheetParity = false;
  if (fix.has('opening') && opts.statements) p = applyTallyOpening(p, opts.statements).plan;
  if (fix.has('rule89')) p.fx!.gstRefundRule = 'rule89';
  if (fix.has('fundraiseCapital')) p.fx!.fundraiseAsCapital = true;
  if (fix.has('receivables')) p.cash = { ...p.cash, receivableDaysByChannel: painCareReceivableDays() };
  // double down on devices from the scale phase: the sheet's device volumes up, hGo pushed harder (placeholders)
  for (const s of p.skus) p.fx!.skuTweaks[s.id] = { volume: s.id === 's8' ? 1.5 : 1.2, asp: null };
  // the CC / overdraft limit being sought; cash below it is an unfunded gap
  p.fx!.overdraft = { ...p.fx!.overdraft, limit: OVERDRAFT_LIMIT_CR * CR };
  // the seed's 5% round cost is paid with the seed (engine) and labelled as the seed's
  for (const l of p.lines) if (l.id === 'e378') { l.name = 'Fundraise Cost - Seed (5% of raise)'; l.milestone = 'Seed'; }
  if (p.business && !p.business.themes.some((t) => t.milestone === 'Seed')) p.business.themes.push({ id: 'th-seed', theme: 'Fundraise', milestone: 'Seed', month: p.fx!.seed.month });
  const O = OFFLINE_MONTH;
  const cats = products();
  const ids = new Set(cats.map((c) => c.id));
  p.products = [...p.products.filter((x) => !ids.has(x.id) && !x.placeholder), ...cats];
  if (fix.has('advances')) for (const x of p.products) if (x.growthLine && x.inHouse === false) x.advancePct = CM_ADVANCE_PCT;
  // rebrand ₹50 L over Dec-26 → Feb-27: a small advance before the seed, the rest once it lands (keeps Dec-26 inside the CC limit)
  const rebrand = ([[3, 5], [4, 25], [5, 20]] as const).map(([month, lakh]) => ({ id: id('x'), name: 'Branding exercise — new master brand (placeholder)', on: true, group: 'Brand & Creative Build', month, amount: lakh * L }));
  p.growth = {
    ...emptyGrowth(),
    on: true,
    leanUntil: LEAN_UNTIL,
    seedPreMoney: SEED_PRE_MONEY_CR * CR,
    note: 'Founder plan, 7 Nov 2026: lean until Mar-27 (today\'s team and spend, the rebrand, the cream launch); growth marketing, the device push and the growth hires from Apr-27; online only (Amazon, Flipkart, D2C incl. quick commerce) until GT, pharmacy and physio start in Jan-28. Branding ₹50 L and ₹17.5 L capex are placeholders — set the real numbers.',
    // FY28 is left to the launch plan itself (a target there would make the solver zero the topicals: devices alone already pass ₹30 Cr)
    path: { FY29: 100 * CR, FY30: 250 * CR, FY31: 500 * CR },
    categories: defaultCategories(),
    retail: retail(),
    hires: hires(),
    capacity: [
      { id: id('c'), name: 'Line 2 (current factory)', on: true, month: O, leadMonths: 3, unitsPerMonth: 15_000, capex: 1.5 * CR, monthlyOpex: 3 * L },
      { id: id('c'), name: 'Line 3 (current factory)', on: true, month: O + 12, leadMonths: 3, unitsPerMonth: 20_000, capex: 2 * CR, monthlyOpex: 4 * L },
      { id: id('c'), name: 'Plant 2', on: true, month: O + 21, leadMonths: 6, unitsPerMonth: 60_000, capex: 10 * CR, monthlyOpex: 18 * L },
    ],
    capex: [
      ...rebrand,
      { id: id('x'), name: 'Capex now (founder: ₹15–20 L), paid when the seed lands', on: true, group: 'Plant & Machinery', month: 4, amount: 17.5 * L },
      { id: id('x'), name: 'ERP & data stack', on: true, group: 'Technology & Infrastructure', month: O, amount: 50 * L },
      { id: id('x'), name: 'Testing & QC lab', on: true, group: 'Testing & Certification Equipment', month: O + 6, amount: 75 * L },
    ],
    rounds: [],
  };
  if (fix.has('capacity')) { p.growth.capacityWeights = defaultCapacityWeights(p); p.growth.peakShift = 1.9; }
  ensureGrowthGroups(p);
  p = solvePath(p).plan;
  if (fix.has('overheads')) p.growth!.overheads = sizeOverheads(p);
  return withRounds(p, opts.seriesAMonth ?? SERIES_A_MONTH, opts.seriesBMonth ?? SERIES_B_MONTH);
}
