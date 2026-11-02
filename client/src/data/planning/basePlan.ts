// The planner's Base scenario: the Projection & Deployment Plan sheet as imported by
// scripts/import-projection-plan.py, plus neutral-to-moderate levers for FY29–FY31.
// Levers for the first 18 months are neutral, so Base reproduces the sheet exactly.

import raw from './base-plan.json';
import { defaultRepeat, type Channel, type ExpenseLine, type Levers, type NewProduct, type Plan } from './engine';

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
  fy27H1Revenue: 0,
  fy27H1Ebitda: 0,
};

/** Topicals from the launch plan — prices and dates filled, volumes left at zero and switched off. */
export const DEFAULT_PRODUCTS: NewProduct[] = [
  {
    id: 'p-cream', name: 'Pain relief cream', on: false, asp: 450, launchMonth: 5, // Feb-27
    launchUnits: 0, rampPct: 0.15, steadyPct: 0.5, split: even(0.4, 0.5, 0.1), cogsPct: 0.3,
  },
  {
    id: 'p-rollon', name: 'Pain relief roll-on', on: false, asp: 300, launchMonth: 7, // Apr-27
    launchUnits: 0, rampPct: 0.15, steadyPct: 0.5, split: even(0.4, 0.5, 0.1), cogsPct: 0.3,
  },
];

type RawPlan = Omit<Plan, 'name' | 'products' | 'levers' | 'version'> & { version: number };

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
  };
}

export const BASE_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1j75EvRvD5mX-SSBNiwr_Lu2uhjmD-21SOpIRQz3RVUE/edit';
