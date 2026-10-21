// ----------------------------------------------------------------------------
// Parser for the Amazon Seller Central "Revenue and fees" (product profitability)
// report export. Layout: a group-header row (Net Proceed, Sales, Fulfilment cost,
// Referral Fee …) above a column-header row (ASIN, SKU, Total, Per Unit, Units
// Charged …), then a "Total" row, then one row per SKU. Fees are negative-free
// totals that already include the GST Amazon charges on them.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import type { FeeReport, ParsedSkuRow } from './priceFloors';

type Cell = string | number | null | undefined;

const num = (v: Cell) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export class FeeReportError extends Error {}

export async function parseFeeReport(file: File, uploadedBy: string | null): Promise<FeeReport> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, blankrows: false });

  const hi = rows.findIndex((r) => String(r?.[0] ?? '').trim().toUpperCase() === 'ASIN');
  if (hi < 1) throw new FeeReportError('This does not look like the Seller Central "Revenue and fees" report: no ASIN column found.');
  const groupRow = rows[hi - 1] || [];
  const headRow = rows[hi] || [];

  // "Group|Header" → first column index. Groups carry forward across their columns.
  const col = new Map<string, number>();
  let group = '';
  headRow.forEach((h, i) => {
    const g = String(groupRow[i] ?? '').trim();
    if (g) group = g;
    const key = `${group}|${String(h ?? '').trim()}`.toLowerCase();
    if (!col.has(key)) col.set(key, i);
  });
  const c = (g: string, h: string) => col.get(`${g}|${h}`.toLowerCase());
  const at = (r: Cell[], g: string, h: string) => {
    const i = c(g, h);
    return i == null ? 0 : num(r[i]);
  };
  const need: [string, string][] = [['Sales', 'Total Units Sold'], ['Sales', 'Total Sales (Revenue)']];
  for (const [g, h] of need) if (c(g, h) == null) throw new FeeReportError(`Column "${h}" under "${g}" is missing. Export the full Revenue and fees report.`);

  // product columns are the first four: ASIN, SKU, Product Name, Brand
  const agg = new Map<string, {
    asin: string; name: string; skus: Map<string, number>;
    sold: number; returned: number; sales: number; aspW: number; aspU: number;
    fba: number; fbaU: number; ref: number; refU: number; admin: number; adminU: number; close: number; closeU: number;
    ads: number; place: number; placeU: number; trans: number; transU: number; storage: number;
  }>();
  for (const r of rows.slice(hi + 1)) {
    const asin = String(r?.[0] ?? '').trim();
    if (!/^B0[0-9A-Z]{8}$/i.test(asin)) continue; // skips the Total row and blanks
    const a = agg.get(asin) || {
      asin, name: '', skus: new Map(), sold: 0, returned: 0, sales: 0, aspW: 0, aspU: 0,
      fba: 0, fbaU: 0, ref: 0, refU: 0, admin: 0, adminU: 0, close: 0, closeU: 0, ads: 0, place: 0, placeU: 0, trans: 0, transU: 0, storage: 0,
    };
    const sku = String(r[1] ?? '').trim();
    const sold = at(r, 'Sales', 'Total Units Sold');
    if (!a.name && r[2]) a.name = String(r[2]).trim();
    if (sku) a.skus.set(sku, (a.skus.get(sku) || 0) + sold + 0.001);
    a.sold += sold;
    a.returned += at(r, 'Sales', 'Units Refunded');
    a.sales += at(r, 'Sales', 'Total Sales (Revenue)');
    const avg = at(r, 'Sales', 'Avg. Sales Price');
    if (avg > 0 && sold > 0) { a.aspW += avg * sold; a.aspU += sold; }
    a.fba += at(r, 'Fulfilment by Amazon Fulfilment Fees', 'Total');
    a.fbaU += at(r, 'Fulfilment by Amazon Fulfilment Fees', 'Units Charged');
    a.ref += at(r, 'Referral Fee', 'Total');
    a.refU += at(r, 'Referral Fee', 'Units Charged');
    a.admin += at(r, 'Refund Administration Fees', 'Total');
    a.adminU += at(r, 'Refund Administration Fees', 'Units Charged');
    a.close += at(r, 'Per-item Selling Fees', 'Total');
    a.closeU += at(r, 'Per-item Selling Fees', 'Units Charged');
    a.ads += at(r, 'Advertising Cost of Sales', 'Total');
    a.place += at(r, 'FBA Inbound Placement Fees', 'Total');
    a.placeU += at(r, 'FBA Inbound Placement Fees', 'Units Charged');
    a.trans += at(r, 'Shipping Transportation Charges', 'Total');
    a.transU += at(r, 'Shipping Transportation Charges', 'Units Charged');
    a.storage += at(r, 'Storage Cost', 'Total');
    agg.set(asin, a);
  }
  if (!agg.size) throw new FeeReportError('No product rows found in this report.');

  const out: ParsedSkuRow[] = [];
  let place = 0, placeU = 0, trans = 0, transU = 0, storage = 0, soldAll = 0, salesAll = 0, refundsAll = 0, adsAll = 0;
  for (const a of agg.values()) {
    // Amazon's own average selling price (weighted by units), else sales ÷ units
    const asp = a.aspU > 0 ? a.aspW / a.aspU : a.sold > 0 ? a.sales / a.sold : null;
    // referral is only charged above the price band; trust the rate only when most units paid it,
    // otherwise the charged units sold at a different price than the average and the % is skewed
    const refPct = a.refU > 0 && asp && a.refU >= 0.8 * a.sold ? a.ref / (a.refU * asp) : null;
    const sku = [...a.skus.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
    out.push({
      asin: a.asin,
      name: a.name,
      sku: (sku.split(/\s|-hcore|-FBM/i)[0] || sku).replace(/-+$/, ''),
      sold: a.sold,
      returned: a.returned,
      sales: r2(a.sales),
      asp: asp ? r2(asp) : null,
      fba: a.fbaU > 0 ? r2(a.fba / a.fbaU) : null,
      admin: a.adminU > 0 ? r2(a.admin / a.adminU) : null,
      refPct: refPct ? r4(refPct) : null,
      closing: a.closeU > 0 ? r2(a.close / a.closeU) : null,
      // per unit sent in: placement and transport are each charged on the units in their shipments
      inbound: a.placeU || a.transU ? r2((a.placeU ? a.place / a.placeU : 0) + (a.transU ? a.trans / a.transU : 0)) : null,
      ads: r2(a.ads),
      tacos: a.sales > 0 ? r4(a.ads / a.sales) : null,
    });
    place += a.place; placeU += a.placeU; trans += a.trans; transU += a.transU; storage += a.storage;
    soldAll += a.sold; salesAll += a.sales; refundsAll += a.returned; adsAll += a.ads;
  }
  out.sort((x, y) => y.sales - x.sales);
  return {
    id: `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
    fileName: file.name.slice(0, 120),
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    rows: out,
    totals: { sales: r2(salesAll), units: soldAll, refunds: refundsAll, ads: r2(adsAll) },
    observed: {
      placement: placeU > 0 ? r2(place / placeU) : undefined,
      transport: transU > 0 ? r2(trans / transU) : undefined,
      storage: soldAll > 0 && storage > 0 ? r2(storage / soldAll) : undefined,
    },
  };
}
