// The planner's Base scenario: the Projection & Deployment Plan sheet as imported by
// scripts/import-projection-plan.py, plus neutral-to-moderate levers for FY29–FY31.
// Levers for the first 18 months are neutral, so Base reproduces the sheet exactly.

import raw from './base-plan.json';
import { calOf, defaultRepeat, toIndex, type Channel, type ExpenseLine, type Levers, type NewProduct, type Plan } from './engine';
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
  taxMode: 'sheet',
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
    products: structuredClone(DEFAULT_PRODUCTS),
    levers: structuredClone(DEFAULT_LEVERS),
    skuSeason: learnSkuSeason(r),
    d2c: d2cModelFrom(SEED_HISTORY, fitD2C(SEED_HISTORY), SEED_SOURCE, SEED_AS_OF),
  };
}

/** Fill fields newer than a saved plan (customer model, seasonality) from Base, so old scenarios still open. */
export function upgradePlan(p: Plan): Plan {
  const b = basePlan();
  return {
    ...p,
    skuSeason: p.skuSeason ?? b.skuSeason,
    d2c: p.d2c ?? { ...b.d2c, mode: 'units' }, // older scenarios were built on units; keep their numbers
    levers: { ...b.levers, ...p.levers },
    products: p.products.map((x) => ({ seasonRef: 'flat', ...x })),
  };
}

export const BASE_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1j75EvRvD5mX-SSBNiwr_Lu2uhjmD-21SOpIRQz3RVUE/edit';
