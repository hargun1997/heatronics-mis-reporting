// ----------------------------------------------------------------------------
// Production costs → the BOM pricing slot's output, and Amazon's Sales & Traffic
// report → the Business Report slot's sheet rows. Pure; tests in
// server/test/slots.test.ts.
// ----------------------------------------------------------------------------

import type { ProductionCost } from '../../sources/production.js';
import type { BomCostRow, SlotPull } from '../types.js';
import { inr, num, r2, str } from './common.js';

/**
 * One row per finished good (FG-…), as the BOM upload's reader keeps them: fgId, BOM number,
 * BOM name, per-unit cost. Products without a material cost are left out and named.
 */
export function productionBomCosts(products: ProductionCost[], month: string, periodKey: string): SlotPull {
  const rows: BomCostRow[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const fgId = str(p.item).toUpperCase();
    if (!/^FG-\d+/.test(fgId) || seen.has(fgId)) continue;
    if (p.material == null || !(p.material > 0)) { missing.push(fgId); continue; }
    seen.add(fgId);
    rows.push({ fgId, bomNumber: str(p.bom) || fgId, bomName: str(p.name), costPerUnit: r2(p.material) });
  }
  rows.sort((a, b) => a.fgId.localeCompare(b.fgId));
  const warnings: string[] = [];
  if (month !== periodKey) warnings.push(`Production has no costs for ${periodKey} yet — these are its ${month} costs (newest it has).`);
  if (missing.length) warnings.push(`${missing.length} finished good(s) have no material cost in Production: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
  const avg = rows.length ? rows.reduce((s, r) => s + r.costPerUnit, 0) / rows.length : 0;
  return {
    bomCosts: rows,
    rowCount: rows.length,
    trace: [
      `Production costs for ${month}: ${products.length} product(s) → ${rows.length} finished goods costed (average ${inr(avg)} a unit)`,
      'Unit cost = the BOM with every part at its latest purchase invoice (ex-GST); factory overheads are not added (they are in Tally).',
    ],
    warnings,
    note: 'From Production\'s BOM costs (latest purchase invoices), not Tranzact\'s default prices — compare with the BOM upload once.',
  };
}

// ---- Amazon Sales & Traffic report (GET_SALES_AND_TRAFFIC_REPORT, asinGranularity CHILD) ----

/** Header the client's Business Report reader recognises (Sessions + Units Ordered). */
export const BIZ_HEADER = ['(Parent) ASIN', '(Child) ASIN', 'Title', 'SKU', 'Sessions - Total', 'Page Views - Total', 'Units Ordered', 'Ordered Product Sales'];

/** salesAndTrafficByAsin → the "Detail Page Sales and Traffic By Child Item" sheet (header + rows). */
export function salesTrafficRows(report: any, periodKey: string): SlotPull {
  const list: any[] = Array.isArray(report?.salesAndTrafficByAsin) ? report.salesAndTrafficByAsin : [];
  const rows: unknown[][] = [BIZ_HEADER];
  let sessions = 0, units = 0;
  for (const a of list) {
    const child = str(a?.childAsin);
    const sku = str(a?.sku);
    if (!child && !sku) continue;
    const s = Math.round(num(a?.trafficByAsin?.sessions ?? (num(a?.trafficByAsin?.browserSessions) + num(a?.trafficByAsin?.mobileAppSessions))));
    const pv = Math.round(num(a?.trafficByAsin?.pageViews ?? (num(a?.trafficByAsin?.browserPageViews) + num(a?.trafficByAsin?.mobileAppPageViews))));
    const u = Math.round(num(a?.salesByAsin?.unitsOrdered));
    const sales = r2(num(a?.salesByAsin?.orderedProductSales?.amount));
    sessions += s; units += u;
    rows.push([str(a?.parentAsin), child, '', sku, s, pv, u, sales]);
  }
  return {
    rows: list.length ? rows : [],
    rowCount: list.length,
    trace: [`Amazon Sales & Traffic report for ${periodKey}: ${list.length} child ASIN(s), ${sessions.toLocaleString('en-IN')} sessions, ${units.toLocaleString('en-IN')} units ordered`],
    warnings: [],
    emptyOk: list.length === 0,
  };
}
