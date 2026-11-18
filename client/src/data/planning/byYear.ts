// Year-by-year views of a plan for the Excel download: revenue and units by product line, and the capital picture.
// Lines: the sheet's SKUs = current device range; added products grouped by category (device → new devices).
import { CATEGORY_NAMES, type Plan, type PlanResult } from './engine';

export interface LineYear { line: string; revenue: Record<string, number>; units: Record<string, number> }

const CURRENT = 'Heat devices (current range)';
const lineName = (cat: string | undefined) => (cat === 'device' ? 'New devices (TENS, recovery)' : cat === 'other' ? 'OEM / B2B and other' : CATEGORY_NAMES[cat ?? ''] ?? cat ?? 'Other');

/** Net revenue (P&L basis, spread by each month's gross share) and units by product line and FY. */
export function linesByYear(plan: Plan, r: PlanResult): { fys: string[]; lines: LineYear[] } {
  const skuIds = new Set(plan.skus.map((s) => s.id));
  const cat = new Map(plan.products.map((p) => [p.id, p.category]));
  const of = (id: string) => (skuIds.has(id) ? CURRENT : lineName(cat.get(id)));
  const fys = r.years.map((y) => y.fy);
  const map = new Map<string, LineYear>();
  const get = (line: string) => {
    let x = map.get(line);
    if (!x) { x = { line, revenue: Object.fromEntries(fys.map((f) => [f, 0])), units: Object.fromEntries(fys.map((f) => [f, 0])) }; map.set(line, x); }
    return x;
  };
  get(CURRENT);
  for (const m of r.months) {
    const gross = Object.values(m.revenueBySku).reduce((a, v) => a + v, 0);
    for (const [id, v] of Object.entries(m.revenueBySku)) if (gross > 0) get(of(id)).revenue[m.fy] += (v / gross) * m.netRevenue;
    for (const [id, u] of Object.entries(m.unitsBySku)) get(of(id)).units[m.fy] += u;
  }
  const lines = [...map.values()].filter((x) => fys.some((f) => x.revenue[f] > 0 || x.units[f] > 0));
  return { fys, lines };
}

export interface CapitalYear { fy: string; ebitda: number; capex: number; operatingCash: number; equity: number; debtNet: number; closingCash: number; lowestCash: number }

/** Per FY: EBITDA, capex, net cash flow before funding (after tax, interest, working capital and capex), equity and net debt raised, closing and lowest cash. */
export function capitalByYear(r: PlanResult): CapitalYear[] {
  return r.years.map((y) => {
    const ms = r.months.filter((m) => m.fy === y.fy);
    const equity = ms.reduce((a, m) => a + m.equity, 0);
    const debtNet = ms.reduce((a, m) => a + m.debtNet, 0);
    return {
      fy: y.fy, ebitda: y.ebitda, capex: y.capex,
      operatingCash: y.netCashFlow,
      equity, debtNet, closingCash: y.closingCash,
      lowestCash: Math.min(...ms.map((m) => m.closingCash)),
    };
  });
}
