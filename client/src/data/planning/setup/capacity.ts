// Setup → "Capacity, sites & capex" (docs/planning/ONE-SETUP.md §2.7): the pure side — the collapsed summary line, the
// one peak-use feedback line, the capex groups and the row factories. No React; tested in server/test/setup-capacity.test.ts.

import type { CapacityBlock, CapexItem, Overhead, Plan } from '../engine';
import { emptyGrowth } from '../growth';

const CR = 1e7;
const L = 1e5;

/** Where a one-off capex item is booked (the sheet's capex groups + the Growth builder's Store Fit-out). */
export const CAPEX_GROUPS = [
  'Plant & Machinery', 'Testing & Certification Equipment', 'New Product Tooling & Moulds', 'Brand & Creative Build',
  'Technology & Infrastructure', 'Intangibles & Deposits', 'Store Fit-out',
] as const;

const n = (v: number) => Math.round(v).toLocaleString('en-IN');
const on = <T extends { on: boolean }>(xs: T[] | undefined): T[] => (xs ?? []).filter((x) => x.on);

/** Capacity today: what the growth layer holds, else what `ensureGrowth` would create on the first write. */
export const baseCapacityOf = (plan: Plan): number => plan.growth?.baseCapacity ?? emptyGrowth().baseCapacity;

/** Capacity today + every block that is on (units a month), ignoring lead times. */
export const plannedCapacity = (plan: Plan): number =>
  baseCapacityOf(plan) + on(plan.growth?.capacity).reduce((a, b) => a + b.unitsPerMonth, 0);

/** Collapsed line: `13,000 → 43,000 units/mo · 3 blocks · 5 sites · 8 running costs · 4 capex items` (on items only). */
export function summary(plan: Plan): string {
  const G = plan.growth;
  const blocks = on(G?.capacity).length;
  const overheads = on(G?.overheads);
  const sites = overheads.filter((o) => o.kind === 'site').length;
  const running = overheads.length - sites;
  const capex = on(G?.capex).length;
  return `${n(baseCapacityOf(plan))} → ${n(plannedCapacity(plan))} units/mo · ${blocks} blocks · ${sites} sites · ${running} running costs · ${capex} capex items`;
}

export interface PeakUse {
  /** highest utilisation over the horizon (1 = 100 %) */
  utilisation: number;
  /** label of the month it happens in */
  label: string;
  /** months over 100 % */
  overMonths: number;
}

/** The one feedback line's numbers from `result.months[].utilisation`; null when no capacity is set (every month 0). */
export function peakUse(months: { label: string; utilisation: number }[]): PeakUse | null {
  if (!months.length) return null;
  let peak = months[0];
  for (const m of months) if (m.utilisation > peak.utilisation) peak = m;
  if (!(peak.utilisation > 0)) return null;
  return { utilisation: peak.utilisation, label: peak.label, overMonths: months.filter((m) => m.utilisation > 1).length };
}

/** "Peak use 112% in Nov-30; over 100% in 4 months" — or the no-capacity wording. */
export function peakUseLine(months: { label: string; utilisation: number }[]): string {
  const p = peakUse(months);
  if (!p) return 'No capacity set: utilisation is not tracked.';
  const over = p.overMonths ? `over 100% in ${p.overMonths} ${p.overMonths === 1 ? 'month' : 'months'}` : 'never over 100%';
  return `Peak use ${Math.round(p.utilisation * 100)}% in ${p.label}; ${over}`;
}

/** Cost groups an overhead may be booked to: its own (kept even if unknown) + every non-capex, non-finance group of the plan. */
export const overheadGroups = (plan: Plan, current: string): string[] =>
  [...new Set([current, ...plan.groups.filter((g) => g.section !== 'capex' && g.section !== 'finex').map((g) => g.name)])];

// ---- row factories (the same defaults the old Growth builder used) -------------------------------------------------
export const newSite = (id: string, month: number): Overhead =>
  ({ id, name: 'New warehouse', on: true, kind: 'site', group: 'Rent & Facilities', month, end: null, amount: 0, growthPct: 0.05, sqft: 10_000, rentPerSqft: 25, runningPerMonth: 0.5 * L, depositMonths: 6, fitout: 10 * L });

export const newExpense = (id: string, month: number): Overhead =>
  ({ id, name: 'New expense', on: true, kind: 'fixed', group: 'Office & Administration', month, end: null, amount: 0.5 * L, growthPct: 0.1 });

export const newBlock = (id: string, month: number): CapacityBlock =>
  ({ id, name: 'New line', on: true, month, leadMonths: 3, unitsPerMonth: 10_000, capex: 1 * CR, monthlyOpex: 2 * L });

export const newCapex = (id: string, month: number): CapexItem =>
  ({ id, name: 'New capex', on: true, group: CAPEX_GROUPS[0], month, amount: 50 * L });
