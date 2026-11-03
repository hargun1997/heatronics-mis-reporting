// Setup → Targets (docs/planning/ONE-SETUP.md §2.9): which kind of target the plan carries, switching between the two,
// the ONE "fit" action (solve the revenue path or the exit ARR, then size the unconfirmed rounds) and the section's summary.
// Pure: no React. Tested in server/test/setup-targets.test.ts.

import type { Plan, PlanResult } from '../engine';
import { emptyGrowth, ensureGrowthGroups, fundTheGap, solvePath, solveForTarget } from '../growth';

const CR = 1e7;

export type TargetMode = 'path' | 'arr';

/** Derived, no plan field: a revenue path with at least one FY = 'path', else the exit-ARR target. */
export function targetMode(plan: Plan): TargetMode {
  return plan.growth?.path && Object.keys(plan.growth.path).length ? 'path' : 'arr';
}

/** The growth layer, created on first use (does NOT change `on` of an existing one) — same rule as setup/shared.tsx `ensureGrowth`. */
function growthOf(p: Plan): NonNullable<Plan['growth']> {
  p.growth ??= { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  return p.growth;
}

/**
 * Switch the target type. 'arr' drops the path and its pushes; 'path' seeds a target per full FY from the plan's own
 * P&L revenue (`result.years`, rounded to ₹ Cr) so the user types over numbers that already hold.
 */
export function setTargetMode(p: Plan, mode: TargetMode, result: PlanResult): void {
  const g = growthOf(p);
  if (mode === 'arr') { delete g.path; delete g.push; return; }
  const path: Record<string, number> = {};
  for (const y of result.years) {
    if (y.months < 12) continue;
    const v = Math.round(y.revenue / CR) * CR;
    if (v > 0) path[y.fy] = v;
  }
  g.path = path;
  delete g.push;
}

const sheetMode = (plan: Plan) => !plan.fx || plan.fx.sheetParity;

/**
 * The page's one action. Path mode: push the growth lines' new buyers FY by FY until each year meets its target
 * (`solvePath`); ARR mode: scale their launch volumes to `growth.targetArr` (`solveForTarget`). Then re-size the
 * unconfirmed `auto-` rounds so cash stays above the buffer (`fundTheGap`). Never mutates `plan`.
 */
export function fitToTargets(plan: Plan): { plan: Plan; notes: string[] } {
  if (sheetMode(plan) || !plan.growth) return { plan: structuredClone(plan), notes: ['Sheet parity is on: nothing fitted.'] };
  if (!plan.growth.on) return { plan: structuredClone(plan), notes: ['The products & growth layer is switched off in this scenario (Starting point): nothing fitted.'] };
  const notes: string[] = [];
  let p: Plan;
  if (targetMode(plan) === 'path') {
    const s = solvePath(plan);
    p = s.plan;
    notes.push(...s.missed);
  } else {
    const s = solveForTarget(plan);
    p = s?.plan ?? plan;
    if (!s) notes.push('No growth line is on, or the lines cannot reach the exit ARR.');
  }
  return { plan: fundTheGap(p), notes };
}

const crs = (v: number) => (v / CR).toLocaleString('en-IN', { maximumFractionDigits: 0 });

/** Collapsed line for the section (≤ 90 chars, no runPlan). */
export function summary(plan: Plan): string {
  const g = plan.growth;
  if (!g) return 'No targets';
  if (targetMode(plan) === 'path') {
    const fys = Object.keys(g.path!).sort();
    const first = fys[0], last = fys[fys.length - 1];
    const fitted = !!g.push && Object.keys(g.push).length > 0;
    const span = first === last ? `${first} ₹${crs(g.path![first])} Cr` : `${first} ₹${crs(g.path![first])} Cr → ${last} ₹${crs(g.path![last])} Cr`;
    return `Revenue by year: ${span}${fitted ? ' · fitted' : ' · not fitted yet'}`;
  }
  return `Exit ARR ₹${crs(g.targetArr)} Cr target`;
}
