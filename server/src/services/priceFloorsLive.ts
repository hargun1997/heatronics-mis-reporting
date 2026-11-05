// ----------------------------------------------------------------------------
// Amazon price floors, LIVE: the same per-ASIN economics the Seller Central "Revenue and fees" report gives
// (client/src/utils/sellerCentralFees.ts → ParsedSkuRow), built from what Ops already stores in BigQuery
// (dataset `ops`, READ ONLY): Finances events `amz_fin_events` (orders + refunds, per order item), SP ads
// `ads_sp_product` and the SKU → ASIN map from `amz_orders_items_latest`. Last 30 full IST days.
//
//   liveFloorsReport()   reads Ops (3 SELECTs) → mapFloorRows() (pure, tested) → a FeeReport-shaped object
//
// Conventions (Ops lib/amazon/money/finances.ts): amounts are signed INR (order fees negative, refunded
// principal negative, RefundCommission = the refund administration fee, negative); units ride on the item's
// Principal line (`qty`); Principal is ex-GST and its GST is a separate `Tax` line. The fee report's fees
// include the GST Amazon charges on them: when the events itemise that GST (`fee_gst`) it is added back per
// ASIN; when they don't, fees are grossed up by 18 % and the report says so (`notes`).
// ----------------------------------------------------------------------------

import { opsQuery } from '../connectors/sources/opsAdsStore.js';

/** Per seller SKU × kind aggregates (one row per SKU for orders, one for refunds) — what the SQL returns. */
export interface SkuAgg {
  kind: 'order' | 'refund';
  sku: string;
  items: number;
  units: number;
  principal: number;
  tax: number;
  commission: number;
  refUnits: number;
  refBase: number;
  fba: number;
  /** pick & pack part of fba (Amazon IN fee type names with "pick"); 0 when not split */
  pick?: number;
  fbaUnits: number;
  closing: number;
  closeUnits: number;
  admin: number;
  adminItems: number;
  feeAll: number;
  feeGst: number;
}
export interface LiveInputs {
  skus: SkuAgg[];
  /** seller SKU → ASIN (+ a product name when known). */
  asinOf: Map<string, { asin: string; name?: string }>;
  /** SP ad spend per ASIN (₹, as Ops stores it). */
  adsByAsin: Map<string, number>;
  /** FBA storage fees in the window (signed, negative). */
  storage: number;
}
export interface LiveRow {
  asin: string; name: string; sku: string; sold: number; returned: number; sales: number; asp: number | null;
  fba: number | null; pick?: number | null; admin: number | null; refPct: number | null; closing: number | null; inbound: number | null; ads: number; tacos: number | null;
}
export interface LiveReport {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string | null;
  rows: LiveRow[];
  totals: { sales: number; units: number; refunds: number; ads: number };
  observed: { placement?: number; transport?: number; storage?: number };
  live: { from: string; to: string; notes: string[]; feesGst: 'itemised' | 'assumed' };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const BUY_GST = 0.18;
/** Same SKU clean-up as the fee report parser (drops "-FBM", "-hcore", trailing text). */
export const cleanSku = (sku: string) => (sku.split(/\s|-hcore|-FBM/i)[0] || sku).replace(/-+$/, '');

export function mapFloorRows(x: LiveInputs, window: { from: string; to: string }, now = new Date()): LiveReport {
  const notes: string[] = [];
  type Acc = { asin: string; name: string; skus: Map<string, number>; o: SkuAgg[]; r: SkuAgg[] };
  const by = new Map<string, Acc>();
  let unmappedUnits = 0;
  for (const s of x.skus) {
    const m = x.asinOf.get(s.sku);
    if (!m) { if (s.kind === 'order') unmappedUnits += s.units; continue; }
    const a = by.get(m.asin) || { asin: m.asin, name: m.name || '', skus: new Map(), o: [], r: [] };
    if (!a.name && m.name) a.name = m.name;
    (s.kind === 'order' ? a.o : a.r).push(s);
    if (s.kind === 'order') a.skus.set(s.sku, (a.skus.get(s.sku) || 0) + s.units + 0.001);
    by.set(m.asin, a);
  }
  if (unmappedUnits) notes.push(`${unmappedUnits} units sold on SKUs Ops couldn't link to an ASIN were left out.`);

  const sum = (list: SkuAgg[], k: keyof SkuAgg) => list.reduce((t, s) => t + (Number(s[k]) || 0), 0);
  const feeAllT = x.skus.reduce((t, s) => t + s.feeAll, 0);
  const feeGstT = x.skus.reduce((t, s) => t + s.feeGst, 0);
  const itemised = feeGstT !== 0 && feeAllT !== 0;
  if (!itemised) notes.push('GST on Amazon fees is not itemised in the Finances events: fees are grossed up by 18 % (the fee report shows them with GST).');

  const rows: LiveRow[] = [];
  let soldAll = 0, salesAll = 0, refundsAll = 0, adsAll = 0;
  for (const a of by.values()) {
    const o = a.o, r = a.r;
    const sold = sum(o, 'units');
    if (!sold) continue;
    // GST on fees: this ASIN's own itemised ratio, else the account's, else 18 %
    const fa = sum(o, 'feeAll') + sum(r, 'feeAll'), fg = sum(o, 'feeGst') + sum(r, 'feeGst');
    const gross = itemised ? 1 + (fa ? fg / fa : feeGstT / feeAllT) : 1 + BUY_GST;
    const sales = sum(o, 'principal') + sum(o, 'tax');                    // GST-inclusive, as the report's "Total Sales"
    const refundUnits = Math.abs(sum(r, 'units'));
    const returned = refundUnits || sum(r, 'items');                       // refunds without a unit count: one per item
    const fbaU = sum(o, 'fbaUnits'), closeU = sum(o, 'closeUnits'), refU = sum(o, 'refUnits'), refBase = sum(o, 'refBase');
    const adminItems = sum(r, 'adminItems');
    const asp = sold > 0 ? sales / sold : null;
    // referral only above the price band: trust the rate when most units paid it (same rule as the report parser)
    const refPct = refU > 0 && refBase > 0 && refU >= 0.8 * sold ? (Math.abs(sum(o, 'commission')) * gross) / refBase : null;
    const ads = x.adsByAsin.get(a.asin) || 0;
    const sku = [...a.skus.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] || '';
    rows.push({
      asin: a.asin,
      name: a.name,
      sku: cleanSku(sku),
      sold,
      returned,
      sales: r2(sales),
      asp: asp ? r2(asp) : null,
      fba: fbaU > 0 ? r2((Math.abs(sum(o, 'fba')) * gross) / fbaU) : null,
      pick: fbaU > 0 && sum(o, 'pick') ? r2((Math.abs(sum(o, 'pick')) * gross) / fbaU) : null,
      admin: adminItems > 0 ? r2((Math.abs(sum(r, 'admin')) * gross) / adminItems) : null,
      refPct: refPct ? r4(refPct) : null,
      closing: closeU > 0 ? r2((Math.abs(sum(o, 'closing')) * gross) / closeU) : null,
      inbound: null, // inbound placement / transport are account-level service fees, not per SKU: settings keep their own
      ads: r2(ads),
      tacos: sales > 0 ? r4(ads / sales) : null,
    });
    soldAll += sold; salesAll += sales; refundsAll += returned; adsAll += ads;
  }
  rows.sort((p, q) => q.sales - p.sales);
  const storagePerUnit = soldAll > 0 && x.storage ? r2((Math.abs(x.storage) * (itemised ? 1 + feeGstT / feeAllT : 1 + BUY_GST)) / soldAll) : undefined;
  return {
    id: `live-${window.to}`,
    fileName: `Live from Amazon (via Ops), ${window.from} → ${window.to}`,
    uploadedAt: now.toISOString(),
    uploadedBy: 'auto',
    rows,
    totals: { sales: r2(salesAll), units: soldAll, refunds: refundsAll, ads: r2(adsAll) },
    observed: { storage: storagePerUnit },
    live: { ...window, notes, feesGst: itemised ? 'itemised' : 'assumed' },
  };
}

/** The last `days` full IST days, ending yesterday. */
export function liveWindow(days = 30, now = Date.now()): { from: string; to: string } {
  const today = Date.parse(`${new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10)}T00:00:00Z`);
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: day(today - days * 86_400_000), to: day(today - 86_400_000) };
}

// Fee type patterns (Amazon IN ItemFeeList names). Commission = referral; RefundCommission = refund admin fee.
const SQL_SKUS = `
WITH it AS (
  SELECT kind, sku, order_item_id,
    SUM(IF(category = 'sales' AND charge_type = 'Principal', qty, 0)) AS units,
    SUM(IF(category = 'sales' AND charge_type = 'Principal', amount, 0)) AS principal,
    SUM(IF(category = 'gst' AND charge_type = 'Tax', amount, 0)) AS tax,
    SUM(IF(category = 'fee' AND charge_type = 'Commission', amount, 0)) AS commission,
    SUM(IF(category = 'fee' AND REGEXP_CONTAINS(LOWER(charge_type), r'^fba|fulfil|pickandpack|weightbased|weight_based'), amount, 0)) AS fba,
    SUM(IF(category = 'fee' AND REGEXP_CONTAINS(LOWER(charge_type), r'pick'), amount, 0)) AS pick,
    SUM(IF(category = 'fee' AND REGEXP_CONTAINS(LOWER(charge_type), r'closing'), amount, 0)) AS closing,
    SUM(IF(category = 'fee' AND REGEXP_CONTAINS(LOWER(charge_type), r'refundcommission|refund.?admin'), amount, 0)) AS admin,
    SUM(IF(category = 'fee', amount, 0)) AS fee_all,
    SUM(IF(category = 'fee_gst', amount, 0)) AS fee_gst
  FROM amz_fin_events
  WHERE date BETWEEN DATE(@from) AND DATE(@to) AND kind IN ('order', 'refund') AND sku IS NOT NULL
  GROUP BY 1, 2, 3)
SELECT kind, sku, COUNT(*) AS items, SUM(ABS(units)) AS units, SUM(principal) AS principal, SUM(tax) AS tax,
  SUM(commission) AS commission, SUM(IF(commission < 0, units, 0)) AS ref_units, SUM(IF(commission < 0, principal + tax, 0)) AS ref_base,
  SUM(fba) AS fba, SUM(pick) AS pick, SUM(IF(fba < 0, units, 0)) AS fba_units, SUM(closing) AS closing, SUM(IF(closing < 0, units, 0)) AS close_units,
  SUM(admin) AS admin, COUNTIF(admin < 0) AS admin_items, SUM(fee_all) AS fee_all, SUM(fee_gst) AS fee_gst
FROM it GROUP BY 1, 2`;

const n = (v: string | null | undefined) => Number(v) || 0;

/** Reads Ops (READ ONLY) and maps. Throws when BigQuery is unreachable (not on Cloud Run, no access). */
export async function liveFloorsReport(window = liveWindow()): Promise<LiveReport> {
  const p = { from: window.from, to: window.to };
  const [skus, map, ads, storage] = await Promise.all([
    opsQuery(SQL_SKUS, p),
    opsQuery(`SELECT sku, ANY_VALUE(asin) AS asin FROM amz_orders_items_latest WHERE sku IS NOT NULL AND asin IS NOT NULL GROUP BY sku`, {}),
    opsQuery(`SELECT asin, sku, SUM(cost) AS cost FROM ads_sp_product WHERE date BETWEEN DATE(@from) AND DATE(@to) GROUP BY 1, 2`, p),
    opsQuery(`SELECT SUM(amount) AS amount FROM amz_fin_events WHERE date BETWEEN DATE(@from) AND DATE(@to) AND category = 'storage_fee'`, p),
  ]);
  const asinOf = new Map<string, { asin: string }>();
  for (const r of map) if (r.sku && r.asin) asinOf.set(r.sku, { asin: r.asin });
  const adsByAsin = new Map<string, number>();
  for (const r of ads) {
    const asin = r.asin || (r.sku ? asinOf.get(r.sku)?.asin : undefined);
    if (asin) adsByAsin.set(asin, (adsByAsin.get(asin) || 0) + n(r.cost));
    if (r.sku && r.asin && !asinOf.has(r.sku)) asinOf.set(r.sku, { asin: r.asin });
  }
  return mapFloorRows({
    skus: skus.map((r) => ({
      kind: r.kind === 'refund' ? 'refund' : 'order', sku: String(r.sku), items: n(r.items), units: n(r.units), principal: n(r.principal), tax: n(r.tax),
      commission: n(r.commission), refUnits: n(r.ref_units), refBase: n(r.ref_base), fba: n(r.fba), pick: n(r.pick), fbaUnits: n(r.fba_units), closing: n(r.closing),
      closeUnits: n(r.close_units), admin: n(r.admin), adminItems: n(r.admin_items), feeAll: n(r.fee_all), feeGst: n(r.fee_gst),
    })),
    asinOf, adsByAsin, storage: n(storage[0]?.amount),
  }, window);
}
