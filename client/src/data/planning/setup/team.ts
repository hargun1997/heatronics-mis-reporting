// Setup → Team & hiring (docs/planning/ONE-SETUP.md §2.6): the collapsed summary line and the pure helpers behind the
// hires table (default row, the "Grows with" select's encoding, people added per FY). No React; tested in
// server/test/setup-team.test.ts.

import type { GrowthPlan, Hire, Plan, PlanResult } from '../engine';
import { emptyGrowth } from '../growth';

const L = 1e5;

/** How the hires table reads the plan: a missing growth layer shows the defaults `ensureGrowth` would create. */
export function teamOf(plan: Plan): Pick<GrowthPlan, 'hires' | 'benefitsPct' | 'recruitPct' | 'incrementPct'> {
  const g = plan.growth;
  if (g) return g;
  const e = emptyGrowth();
  return { hires: e.hires, benefitsPct: e.benefitsPct, recruitPct: e.recruitPct, incrementPct: e.incrementPct };
}

/** A hire row counts unless it is switched off (`on` undefined = on, as the engine reads it). */
export const hireOn = (h: Hire): boolean => h.on !== false;

/** Roles on and, of those, the ones that grow with revenue / units / outlets. */
export function teamCounts(plan: Plan): { roles: number; scaled: number } {
  const on = teamOf(plan).hires.filter(hireOn);
  return { roles: on.length, scaled: on.filter((h) => !!h.scale).length };
}

const pctInt = (v: number) => `${Math.round(v * 100)}%`;

/** Collapsed line: `27 roles · 6 grow with the business · benefits 12% · increment 10%/yr`. */
export function summary(plan: Plan): string {
  const t = teamOf(plan);
  const { roles, scaled } = teamCounts(plan);
  return `${roles} roles · ${scaled} grow with the business · benefits ${pctInt(t.benefitsPct)} · increment ${pctInt(t.incrementPct)}/yr`;
}

/** The row "Add a role" appends (GrowthTab's default: corporate, 1 person from month 7, ₹1 L a month). */
export function newHire(id: string, month = 7): Hire {
  return { id, role: 'New role', dept: 'corporate', count: 1, month, end: null, monthlyCtc: 1 * L, on: true };
}

export type ScaleBy = NonNullable<Hire['scale']>['by'];

/** Starting step for a role that begins to grow with the business: ₹5 Cr ARR, 5,000 units / mo or 500 outlets. */
export const defaultEvery = (by: ScaleBy): number => (by === 'revenue' ? 5 : by === 'units' ? 5000 : 500);

/** The "Grows with" select's value: `fixed`, `revenue`, `units`, `outlets:` (all) or `outlets:<retail type id>`. */
export function scaleKey(h: Hire): string {
  if (!h.scale) return 'fixed';
  return h.scale.by === 'outlets' ? `outlets:${h.scale.type ?? ''}` : h.scale.by;
}

/** Apply a "Grows with" choice to a hire; a step typed earlier is kept, else the metric's default. */
export function applyScaleKey(h: Hire, key: string): void {
  if (key === 'fixed') { delete h.scale; return; }
  const [by, type] = key.split(':') as [ScaleBy, string | undefined];
  h.scale = { by, every: h.scale?.every ?? defaultEvery(by), ...(type ? { type } : {}) };
}

/** Feedback line: growth-layer headcount at the end of each FY (the engine's `growthHeadcount` in the FY's last month). */
export function peopleAddedByFy(r: PlanResult): { fy: string; people: number }[] {
  return r.years.map((y) => {
    const ms = r.months.filter((m) => m.fy === y.fy);
    return { fy: y.fy, people: ms[ms.length - 1]?.growthHeadcount ?? 0 };
  });
}
