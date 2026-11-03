// The planner's Base scenario: the Projection & Deployment Plan sheet as imported by
// scripts/import-projection-plan.py, plus neutral-to-moderate levers for FY29–FY31.
// Levers for the first 18 months are neutral, so Base reproduces the sheet exactly.

import raw from './base-plan.json';
import { calOf, defaultRepeat, toIndex, type Channel, type ExpenseLine, type Levers, type NewProduct, type Plan, type PlanFx } from './engine';
import { SEED_AS_OF, SEED_HISTORY, SEED_SOURCE, d2cModelFrom, fitD2C } from './history';

const even = (a: number, d: number, f = 0, g = 0, p = 0): Record<Channel, number> => ({ A: a, D: d, F: f, G: g, P: p });

export const DEFAULT_LEVERS: Levers = {
  horizon: 54, // Oct-26 → Mar-31
  // Starting points only — move them on the page. Same growth on every channel by default.
  growth: {
    FY29: even(0.6, 0.6, 0.6, 0.6, 0.6),
    FY30: even(0.45, 0.45, 0.45, 0.45, 0.45),
    FY31: even(0.35, 0.35, 0.35, 0.35, 0.35),
  },
  baseVolume: even(1, 1, 1, 1, 1),
  aspGrowthPct: 0,
  cogsDeltaPerYear: 0,
  roasGainPct: 0,
  inflationPct: 0.06,
  teamGrowthPct: 0.15,
  brandPctOfRevenue: 0,
  taxMode: 'fy', // founder decision 6: losses carried forward by financial year (sheet parity forces the sheet's monthly tax)
  seasonShape: 'plan',
  fy27H1Revenue: 0,
  fy27H1Ebitda: 0,
};

/** Topicals from the launch plan — prices and dates filled, volumes left at zero and switched off. */
export const DEFAULT_PRODUCTS: NewProduct[] = [
  {
    id: 'p-cream', name: 'Pain relief cream', on: false, asp: 450, launchMonth: 5, // Feb-27
    launchUnits: 0, rampPct: 0.15, steadyPct: 0.5, split: even(0.4, 0.5, 0.1), cogsPct: 0.3, seasonRef: 'flat',
  },
  {
    id: 'p-rollon', name: 'Pain relief roll-on', on: false, asp: 300, launchMonth: 7, // Apr-27
    launchUnits: 0, rampPct: 0.15, steadyPct: 0.5, split: even(0.4, 0.5, 0.1), cogsPct: 0.3, seasonRef: 'flat',
  },
];

/** Shopify analytics (2 Nov 2026): discounts ÷ gross sales, Oct-25 → Sep-26 excluding Jun-26 (a junk ₹180 Cr order inflated its gross sales). */
export const SEED_DISCOUNT_PCT = 0.043;

/** Lotion and oil (short term) — every number is a placeholder to be replaced with the founder's. */
export const PLACEHOLDER_PRODUCTS: NewProduct[] = [
  {
    id: 'p-lotion', name: 'Pain relief lotion (placeholder)', on: true, asp: 399, launchMonth: 10, // Jul-27
    launchUnits: 500, rampPct: 0.1, steadyPct: 0.4, split: even(0.4, 0.5, 0.1), cogsPct: 0.3, seasonRef: 'flat', placeholder: true,
  },
  {
    id: 'p-oil', name: 'Pain relief oil (placeholder)', on: true, asp: 349, launchMonth: 13, // Oct-27
    launchUnits: 500, rampPct: 0.1, steadyPct: 0.4, split: even(0.4, 0.5, 0.1), cogsPct: 0.3, seasonRef: 'flat', placeholder: true,
  },
];

/** The founder's Nov-2026 decisions. Terms marked confirmed:false are placeholders. */
export function founderFx(cash: Plan['cash']): PlanFx {
  return {
    sheetParity: false,
    gstServicesAsCost: true,
    revenueExGst: true,
    gtNetRealisation: true,
    seed: { on: true, amount: 8e7, month: 4, feePct: 0.05, confirmed: true, note: '₹8 Cr seed confirmed by founder (3 Nov 2026), closing Jan-27 (M4); the 5% round cost is the sheet’s.' },
    opening: {
      on: true, cash: cash.openingCash, receivables: 0, payables: 0, inventory: cash.openingInventory, gstAsset: 0, debt: cash.openingDebt,
      accumulatedLosses: 1_970_000, source: 'sheet', asOf: null, note: 'Sheet values; accumulated tax losses ₹19.7 L from the audited FY26 ITR computation (business loss ₹10.11 L + unabsorbed depreciation ₹9.59 L). Load the Sep-26 Tally balance sheet for the rest.',
    },
    ventureDebt: { on: true, amount: 2.5e7, drawMonth: 9, rate: 0.12, moratoriumMonths: 6, tenorMonths: 60, feePct: 0.01, confirmed: true },
    overdraft: { on: true, rate: 0.085, confirmed: true },
    d2cDiscount: { on: true, pct: SEED_DISCOUNT_PCT, source: 'shopify', asOf: '2026-11-02' },
    depreciationOnce: { on: true, lifeYears: 5 },
    skuTweaks: {},
  };
}

/** Switch every founder decision off and ignore placeholder products: the plan then reproduces the sheet for M1–M18. */
export function setSheetParity(p: Plan, on: boolean): void {
  p.fx = p.fx ?? founderFx(p.cash);
  p.fx.sheetParity = on;
}

/** Apply the founder decisions to a plan saved before they existed. */
export function applyFounderDecisions(p: Plan) {
  p.fx = founderFx(p.cash);
  p.levers.taxMode = 'fy';
  const has = new Set(p.products.map((x) => x.id));
  for (const x of PLACEHOLDER_PRODUCTS) if (!has.has(x.id)) p.products.push(structuredClone(x));
  for (const e of p.events) if (e.id === 'debtDrawn9') e.venture = true;
}

type RawPlan = Omit<Plan, 'name' | 'products' | 'levers' | 'version' | 'skuSeason' | 'd2c'> & { version: number };

/**
 * Seasonality per SKU from the sheet's "Units : Last Year" rows — the actual units of Oct-25 → Sep-26,
 * all channels. SKUs with too little history (new launches) borrow the whole range's curve.
 */
export function learnSkuSeason(r: Pick<Plan, 'units' | 'skus' | 'startMonth'>): Record<string, number[]> {
  const n = Math.min(12, r.units.length);
  const all = Array(12).fill(0);
  const per: number[][] = r.skus.map(() => Array(12).fill(0));
  for (let m = 1; m <= n; m++) {
    const c = calOf(r.startMonth, m);
    r.skus.forEach((_, s) => {
      const ly = r.units[m - 1][s].reduce((a, cell) => a + cell[0], 0);
      per[s][c] += ly; all[c] += ly;
    });
  }
  const out: Record<string, number[]> = {};
  r.skus.forEach((sku, s) => {
    const tot = per[s].reduce((a, x) => a + x, 0);
    out[sku.id] = tot >= 200 ? toIndex(per[s]) : toIndex(all);
  });
  return out;
}

export function basePlan(): Plan {
  const r = structuredClone(raw) as unknown as RawPlan;
  const lines: ExpenseLine[] = r.lines.map((l) => ({ ...l, repeat: defaultRepeat(l) }));
  return {
    ...r,
    version: 1,
    name: 'Base — Projection & Deployment Plan',
    lines,
    events: r.events.map((e) => (e.id === 'debtDrawn9' ? { ...e, venture: true } : e)),
    products: [...structuredClone(DEFAULT_PRODUCTS), ...structuredClone(PLACEHOLDER_PRODUCTS)],
    fx: founderFx(r.cash),
    levers: structuredClone(DEFAULT_LEVERS),
    skuSeason: learnSkuSeason(r),
    d2c: { ...d2cModelFrom(SEED_HISTORY, fitD2C(SEED_HISTORY), SEED_SOURCE, SEED_AS_OF), discountPct: SEED_DISCOUNT_PCT },
  };
}

/** Fill fields newer than a saved plan (customer model, seasonality) from Base, so old scenarios still open. */
export function upgradePlan(p: Plan): Plan {
  const b = basePlan();
  return {
    ...p,
    skuSeason: p.skuSeason ?? b.skuSeason,
    business: p.business ?? b.business,
    cash: { ...b.cash, ...p.cash },
    // plans saved before the founder decisions keep their numbers: no fx until someone applies it
    fx: p.fx ? { ...b.fx!, ...p.fx, opening: { ...b.fx!.opening, ...p.fx.opening }, seed: { ...b.fx!.seed, ...p.fx.seed }, ventureDebt: { ...b.fx!.ventureDebt, ...p.fx.ventureDebt } } : undefined,
    d2c: p.d2c ?? { ...b.d2c, mode: 'units' }, // older scenarios were built on units; keep their numbers
    levers: { ...b.levers, ...p.levers },
    products: p.products.map((x) => ({ seasonRef: 'flat', ...x })),
    events: p.events.map((e) => (e.id === 'debtDrawn9' && e.venture === undefined ? { ...e, venture: true } : e)),
  };
}

export const BASE_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1j75EvRvD5mX-SSBNiwr_Lu2uhjmD-21SOpIRQz3RVUE/edit';
