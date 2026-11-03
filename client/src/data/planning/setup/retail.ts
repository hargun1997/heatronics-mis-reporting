// Setup → Offline retail & stores (docs/planning/ONE-SETUP.md §2.5): the collapsed summary line and the pure helpers the
// section uses (selectors over plan.growth.retail / plan.growth.stores, feedback rows from a PlanResult, default rows).
// No React here; tested in server/test/setup-retail.test.ts.

import type { Plan, PlanResult, RetailType, StorePlan } from '../engine';
import { defaultRetail } from '../growth';

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const int = (v: number) => Math.round(v).toLocaleString('en-IN');

/** The offline channel types of a plan (none when the growth layer is absent). */
export const retailTypes = (plan: Plan): RetailType[] => plan.growth?.retail ?? [];

/** Outlets planned for a type = every "outlets added" step summed. */
export const outletsPlanned = (t: RetailType): number => sum(t.outlets.map((o) => o.add));

/** Stores planned = every opening's count summed. */
export const storeOpenings = (st: StorePlan | undefined): number => sum((st?.openings ?? []).map((o) => o.count));

/** Short label for the summary line: GT / MT / pharmacy for the built-in ids, else the name before any bracket (≤ 18 chars). */
export function typeLabel(t: RetailType): string {
  const known: Record<string, string> = { gt: 'GT', mt: 'MT', pharma: 'pharmacy' };
  if (known[t.id]) return known[t.id];
  const name = t.name.split('(')[0].trim() || t.id;
  return name.length > 18 ? name.slice(0, 17).trimEnd() + '…' : name;
}

/** Collapsed line: `GT, MT, pharmacy · 42,300 outlets planned · stores 52 openings` (≤ 90 chars). */
export function summary(plan: Plan): string {
  const on = retailTypes(plan).filter((t) => t.on);
  const st = plan.growth?.stores;
  const stores = st?.on ? `${int(storeOpenings(st))} openings` : 'off';
  if (!on.length) return `No offline channels · stores ${stores}`;
  let names = on.map(typeLabel).join(', ');
  if (names.length > 40) names = `${on.length} channels`;
  return `${names} · ${int(sum(on.map(outletsPlanned)))} outlets planned · stores ${stores}`;
}

/** A new channel type, shaped like the first default (GT) with no outlets yet. */
export function newRetailType(id: string): RetailType {
  return { ...defaultRetail()[0], id, name: 'New channel', outlets: [] };
}

/** The next "outlets added" step: 3 months after the last one (month 12 when there is none), clamped to the horizon, +500. */
export function nextOutletStep(t: RetailType, horizon: number): { month: number; add: number } {
  const last = t.outlets[t.outlets.length - 1]?.month ?? 12;
  return { month: Math.max(1, Math.min(last + 3, horizon)), add: 500 };
}

/** The next store opening: 6 months after the last one (month 19 when there is none), clamped to the horizon, 1 store. */
export function nextStoreOpening(st: StorePlan, horizon: number): { month: number; count: number } {
  const last = st.openings[st.openings.length - 1]?.month;
  const month = last === undefined ? 19 : last + 6;
  return { month: Math.max(1, Math.min(month, horizon)), count: 1 };
}

/** Feedback per FY for one type: live outlets at the FY's last month and what we invoiced over the FY. */
export function retailFyRows(r: PlanResult, t: RetailType): { fy: string; outlets: number; invoiced: number }[] {
  return r.years.map((y) => {
    const ms = r.months.filter((m) => m.fy === y.fy);
    return {
      fy: y.fy,
      outlets: ms[ms.length - 1]?.outlets[t.id] ?? 0,
      invoiced: sum(ms.map((m) => m.retailByType[t.id] ?? 0)),
    };
  });
}

/** Feedback for stores: stores open at the horizon's end and store revenue per FY. */
export function storesFeedback(r: PlanResult): { stores: number; label: string; byFy: { fy: string; revenue: number }[] } {
  const last = r.months[r.months.length - 1];
  return { stores: last?.stores ?? 0, label: last?.label ?? '', byFy: r.years.map((y) => ({ fy: y.fy, revenue: y.storeRevenue })) };
}
