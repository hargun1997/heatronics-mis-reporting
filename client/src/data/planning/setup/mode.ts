// Setup → Starting point (docs/planning/ONE-SETUP.md §2.1): the plan basis — "Sheet parity" (the 18-month sheet, exactly as it
// books) or "My plan" (founder decisions + products + the growth layer) — as ONE choice over the two flags the engine already has
// (`fx.sheetParity`, `growth.on`), plus the section's collapsed summary line. Pure: no React, no DOM; tested in
// server/test/setup-mode.test.ts.
import type { Plan, PlanFx } from '../engine';
import { applyFounderDecisions, setSheetParity } from '../basePlan';
import { emptyGrowth, ensureGrowthGroups } from '../growth';
import { cr } from '../../../components/planning/fmt';

export type PlanMode = 'sheet' | 'plan';

/** 'sheet' = no founder decisions yet, or sheet parity on; 'plan' = founder decisions applied and parity off. */
export function planMode(plan: Plan): PlanMode {
  // No fx yet (a scenario saved before the founder decisions): the engine still applies a switched-on growth layer, so say so.
  if (!plan.fx) return plan.growth?.on ? 'plan' : 'sheet';
  return plan.fx.sheetParity ? 'sheet' : 'plan';
}

/** Founder decisions, applied on first use (same as setup/shared.tsx `ensureFx`, kept here so node tests need no .tsx). */
export function ensureFx(p: Plan): PlanFx {
  if (!p.fx) applyFounderDecisions(p);
  return p.fx!;
}

/** The growth layer, created on first use; does NOT change `on` of an existing one (same as setup/shared.tsx `ensureGrowth`). */
export function ensureGrowth(p: Plan): NonNullable<Plan['growth']> {
  p.growth ??= { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  return p.growth;
}

/**
 * Switch the plan basis. 'sheet' keeps every switch, product, hire, round and target but books the plan the way the sheet does;
 * 'plan' applies the founder decisions (if missing), switches parity off and makes sure the growth layer exists and is on.
 */
export function setPlanMode(p: Plan, mode: PlanMode): void {
  ensureFx(p);
  if (mode === 'sheet') { setSheetParity(p, true); return; }
  setSheetParity(p, false);
  const g = ensureGrowth(p);
  g.on = true;
  ensureGrowthGroups(p);
}

/** Legacy case: a scenario saved from the old UI with the founder decisions on but the growth builder ticked off. */
export function growthSwitchedOff(plan: Plan): boolean {
  return planMode(plan) === 'plan' && !!plan.growth && !plan.growth.on;
}

/** Where the opening balance sheet came from, in words. */
export function openingSourceText(o: PlanFx['opening'] | undefined): string {
  if (!o || o.source === 'sheet') return 'sheet values';
  if (o.source === 'tally') return `from Tally${o.asOf ? ` (${String(o.asOf).slice(0, 10)})` : ''}`;
  return 'typed in';
}

/** Collapsed line of the section (≤ 90 chars). */
export function summary(plan: Plan): string {
  if (planMode(plan) === 'sheet') return 'Sheet parity · opening = sheet values';
  const o = plan.fx?.opening;
  const open = o && o.source !== 'sheet' ? `opening ${openingSourceText(o)}` : 'opening = sheet values';
  return `My plan · ${open} · Apr–Sep ’26 ₹${cr(plan.levers.fy27H1Revenue, 1)} Cr`;
}
