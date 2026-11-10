// Server side of Plan vs Actual (GET /api/planning/vs-actual, MCP tool mis_get_plan_vs_actual).
//
// PLAN: the Base plan's months come from basePlanMonths.ts (generated from the client engine, kept honest by a test);
//       a saved scenario carries its own months, written by the Planning page when it was saved (`summary`).
// ACTUALS: the Live MIS deck is built in the browser (uploads + connector facts + normalised COGM), so the browser
//       stores the monthly figures it shows (POST /api/planning/actuals, written by the Plan vs actual view). The server
//       cannot rebuild them alone: it reports how old they are and says so when there are none.

import { buildPlanVsActual, type ActualMonth, type PlanMonthRow, type PlanVsActual } from './planVsActual.js';

export interface ActualsSnapshot { savedAt: string; savedBy: string | null; months: ActualMonth[] }

const KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e13 ? v : null);

/** Clean what a browser sent: only known fields, finite numbers, at most 72 months. null = nothing usable. */
export function cleanActuals(input: unknown): ActualMonth[] | null {
  if (!Array.isArray(input) || input.length > 72) return null;
  const out: ActualMonth[] = [];
  for (const x of input) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.key !== 'string' || !KEY_RE.test(o.key)) continue;
    const level = o.level === 'full' || o.level === 'contribution' || o.level === 'topline' ? o.level : 'topline';
    out.push({
      key: o.key, level, basis: o.basis === 'normalised' ? 'normalised' : 'booked',
      netRevenue: num(o.netRevenue), grossMargin: num(o.grossMargin), cm3: num(o.cm3), ebitda: num(o.ebitda), units: num(o.units),
      ...(typeof o.complete === 'boolean' ? { complete: o.complete } : {}),
    });
  }
  return out;
}

/** Clean plan rows saved with a scenario. null = unusable. */
export function cleanPlanRows(input: unknown): PlanMonthRow[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 120) return null;
  const out: PlanMonthRow[] = [];
  for (const x of input) {
    if (!x || typeof x !== 'object') return null;
    const o = x as Record<string, unknown>;
    const n = [o.netRevenue, o.grossProfit, o.cm3, o.ebitda, o.units, o.arr].map(num);
    if (typeof o.key !== 'string' || !KEY_RE.test(o.key) || typeof o.label !== 'string' || typeof o.fy !== 'string' || n.some((v) => v == null)) return null;
    out.push({ key: o.key, label: o.label.slice(0, 12), fy: o.fy.slice(0, 6), netRevenue: n[0]!, grossProfit: n[1]!, cm3: n[2]!, ebitda: n[3]!, units: n[4]!, arr: n[5]! });
  }
  return out;
}

export const istMonthKey = (now: Date) => new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 7);

export interface VsActualReply extends PlanVsActual {
  scenario: { id: string; name: string };
  actualsAsOf: string | null;
  actualsBy: string | null;
  asOfMonth: string;
  limits: string[];
}

export function composeVsActual(scenario: { id: string; name: string }, plan: PlanMonthRow[], snap: ActualsSnapshot | null, now: Date): VsActualReply {
  const asOf = istMonthKey(now);
  const r = buildPlanVsActual(plan, snap?.months ?? [], asOf);
  const limits = ['Actuals are the monthly figures the Live MIS page last showed (normalised COGM where it has BOM costing), saved when someone opens Planning → Plan vs actual.'];
  if (!snap) limits.unshift('No actuals saved yet: open Planning → Plan vs actual once so the Live MIS figures are stored.');
  else {
    const days = Math.floor((now.getTime() - Date.parse(snap.savedAt)) / 86_400_000);
    if (days >= 3) limits.unshift(`Actuals were saved ${days} days ago.`);
  }
  return { ...r, scenario, actualsAsOf: snap?.savedAt ?? null, actualsBy: snap?.savedBy ?? null, asOfMonth: asOf, limits };
}
