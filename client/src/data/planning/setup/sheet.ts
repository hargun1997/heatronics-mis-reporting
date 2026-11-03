// Setup → "Sheet lines (advanced)": pure helpers for the unit grid (SKU × channel × month) and the
// Expense Calendar lines (docs/planning/ONE-SETUP.md §2.11). No React here; tested in server/test/setup-sheet.test.ts.

import type { ExpenseLine, Plan, PlanResult, Section } from '../engine';

export const SHEET_SECTIONS: { id: Section; label: string }[] = [
  { id: 'revex', label: 'Revenue-linked' }, { id: 'opex', label: 'Opex' }, { id: 'capex', label: 'Capex' }, { id: 'finex', label: 'Finance' },
];

/** The three parts of a unit cell, as the sheet holds them: units[m][sku][ch] = [lastYear, missed, growth]. */
export const UNIT_PARTS = [
  { id: '0', label: 'Last year' }, { id: '1', label: 'Missed' }, { id: '2', label: 'Growth' }, { id: 'total', label: 'Total' },
] as const;
export type UnitPart = (typeof UNIT_PARTS)[number]['id'];

/** Collapsed line: `11 SKUs × 18 months · 149 cost lines (0 off, 59 tagged with a milestone)`. */
export function summary(plan: Plan): string {
  const off = plan.lines.filter((l) => l.off).length;
  const tagged = plan.lines.filter((l) => l.milestone).length;
  return `${plan.skus.length} SKUs × ${plan.units.length} months · ${plan.lines.length} cost lines (${off} off, ${tagged} tagged with a milestone)`;
}

/** Units in one grid cell (all three parts). */
export function cellUnits(plan: Plan, m: number, sku: number, ch: number): number {
  return plan.units[m][sku][ch].reduce((a, x) => a + x, 0);
}

/** Units of one SKU in one base month across every channel. */
export function monthUnits(plan: Plan, m: number, sku: number): number {
  return plan.units[m][sku].reduce((a, cell) => a + cell.reduce((t, x) => t + x, 0), 0);
}

/** Write one part of a cell (whole, non-negative units). */
export function setCellPart(p: Plan, m: number, sku: number, ch: number, part: 0 | 1 | 2, v: number): void {
  p.units[m][sku][ch][part] = Math.max(0, Math.round(v));
}

/** ₹ per line per FY, from a run's months (the feedback columns next to each line). A group's total can exceed its lines' sum:
 *  with the founder decisions on, the engine books product materials / D2C discounts into groups without a line. */
export function lineTotalsByFy(r: PlanResult): Record<string, Record<string, number>> {
  const t: Record<string, Record<string, number>> = {};
  for (const m of r.months) for (const [id, v] of Object.entries(m.lines)) (t[id] ??= {})[m.fy] = (t[id][m.fy] ?? 0) + v;
  return t;
}

/** ₹ a group booked in one FY. */
export function groupTotal(r: PlanResult, group: string, fy: string): number {
  return r.months.filter((m) => m.fy === fy).reduce((a, m) => a + (m.groups[group] ?? 0), 0);
}

/** A new Expense Calendar line in `group`, inserted right after the group's last line (first in the list when the group has none yet). */
export function addLine(p: Plan, section: Section, group: string, id: string): ExpenseLine {
  const l: ExpenseLine = { id, name: 'New line', section, group, type: 'Monthly', amount: 0, start: 1, end: null, theme: null, milestone: null, repeat: true };
  const after = p.lines.map((x) => x.group).lastIndexOf(group);
  p.lines.splice(after + 1, 0, l);
  return l;
}

/** Tag a line with a milestone (and its theme) from the business plan; '' clears both. */
export function tagMilestone(p: Plan, l: ExpenseLine, milestone: string): void {
  const ms = p.business.themes.find((t) => t.milestone === milestone);
  l.milestone = ms ? ms.milestone : null;
  l.theme = ms ? ms.theme : null;
}

/** Lines of a group that match the find box (case-insensitive substring; empty = all). */
export function linesOf(plan: Plan, group: string, q: string): ExpenseLine[] {
  const ql = q.trim().toLowerCase();
  return plan.lines.filter((l) => l.group === group && (!ql || l.name.toLowerCase().includes(ql)));
}
