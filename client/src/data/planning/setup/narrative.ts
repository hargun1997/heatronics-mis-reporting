// Setup → Business plan text (docs/planning/ONE-SETUP.md §2.10): the pure side of the Narrative section.
// `summary(plan)` for the collapsed line, and the milestone rename / retheme helpers that keep every cost line
// tagged with a milestone attached to it (the old BusinessPlanTab `Milestones` logic, moved here so it is testable).
// Every mutation helper edits the plan it is given in place — call it inside `update((p) => …)`.

import type { BusinessPlan, Plan } from '../engine';

export type Milestone = BusinessPlan['themes'][number];

/** Distinct theme names in the order the milestones list them. */
export function themesOf(plan: Pick<Plan, 'business'>): string[] {
  return [...new Set((plan.business?.themes ?? []).map((t) => t.theme))];
}

/** How many cost lines carry this milestone. */
export function taggedLines(plan: Pick<Plan, 'lines'>, milestone: string): number {
  return plan.lines.filter((l) => l.milestone === milestone).length;
}

/** Rename milestone row `i`; cost lines tagged with the old name follow it. */
export function renameMilestone(p: Plan, i: number, name: string): void {
  const row = p.business.themes[i];
  if (!row) return;
  const old = row.milestone;
  if (old === name) return;
  row.milestone = name;
  for (const l of p.lines) if (l.milestone === old) l.milestone = name;
}

/** Move milestone row `i` to another theme; cost lines tagged with the milestone take the new theme. */
export function rethemeMilestone(p: Plan, i: number, theme: string): void {
  const row = p.business.themes[i];
  if (!row) return;
  const ms = row.milestone;
  row.theme = theme;
  for (const l of p.lines) if (l.milestone === ms) l.theme = theme;
}

export const newNarrativeId = (): string => Math.random().toString(36).slice(2, 9);

export function addAssumption(p: Plan): void {
  p.business.assumptions.push({ id: newNarrativeId(), assumption: '', value: '', basis: '' });
}
export function addRisk(p: Plan): void {
  p.business.risks.push({ id: newNarrativeId(), risk: '', mitigation: '' });
}
/** A new milestone in the first theme (or "New theme"), month 1. */
export function addMilestone(p: Plan): void {
  p.business.themes.push({ id: newNarrativeId(), theme: themesOf(p)[0] ?? 'New theme', milestone: 'New milestone', month: 1 });
}

/** Collapsed line: `3 assumptions · 2 risks · 12 milestones in 4 themes`. */
export function summary(plan: Plan): string {
  const b = plan.business;
  const a = b?.assumptions?.length ?? 0;
  const r = b?.risks?.length ?? 0;
  const m = b?.themes?.length ?? 0;
  const t = themesOf(plan).length;
  return `${a} assumption${a === 1 ? '' : 's'} · ${r} risk${r === 1 ? '' : 's'} · ${m} milestone${m === 1 ? '' : 's'} in ${t} theme${t === 1 ? '' : 's'}`;
}
