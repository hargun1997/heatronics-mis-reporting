// ----------------------------------------------------------------------------
// The published (workbook) history on the SAME basis as the live months.
//
// MONTHLY_MIS is the raw extract of MIS-Sheet_FINAL_channels.xlsx. Two things
// in it differ from how the live (Tally) months are built, and both are put
// right HERE, once, at read time — every reader (Live MIS, exports, the AI
// context) takes PUBLISHED_MONTHS / PUBLISHED_CELLS, never the raw arrays:
//
//  1. GST. In the workbook a channel's "net" row is net of returns but still
//     carries GST: Σ channels − net revenue = totalTaxes, to the rupee, in
//     every month Dec 2023 → Dec 2025 (Jan–Mar 2026 were restated and are
//     within 0.5 %). Company net revenue, and every live month's channel row
//     (Tally sales ledgers), are ex-GST. The workbook has no ex-GST figure per
//     channel, so each month's channel rows are scaled by
//     netRevenue ÷ Σ channels (≈ 100/105: every product is at 5 % GST), which
//     makes Σ channels = net revenue exactly. The customer-paid figure is kept
//     as `gmvByChannel` (net of returns, incl. GST). `grossByChannel` /
//     `returnsByChannel` stay as booked: the build-up reads
//     gross (incl. GST) − returns − GST = net.
//     Apr–Jul 2026 in the workbook are already ex-GST (taxes 0); Apr / May are
//     rounded to ₹1,000 there, so the same scale only removes the rounding and
//     no GMV is set (not known for them).
//
//  2. Amazon, Dec 2023 – Sep 2024. Founder decision, 10 Nov 2026: Amazon is
//     shown as Amazon, as the workbook books it (FY24-25 Amazon ₹2.61 Cr incl.
//     GST, 65 % of sales). The months need no change. The workbook's SKU cells
//     for those months, though, were cut with that Amazon revenue folded into
//     the single "OEM Heating Pad" model cell; `recutAmazonCells` takes it back
//     out as its own Amazon cell (no SKU split exists for those months: cost
//     at Amazon's own Oct 2024 – Mar 2025 cost rate, units = revenue ÷ its
//     revenue per unit; flagged `costEst` / `uEst`). The OEM part keeps the
//     model's 67.7 % cost; the model cost on the Amazon revenue is dropped.
//
//  3. SKU cells. Groups cut from the workbook rows (OEM, Offline, early Amazon,
//     some Blinkit months) carried GST like the rows: `exGstCells` scales them
//     to the ex-GST channel row. Groups from other sources (Amazon net
//     proceeds from Oct 2024, Shopify per product) are already ex-GST and stay.
// ----------------------------------------------------------------------------

import { MONTHLY_MIS, SALES_CHANNELS, type MonthlyMIS, type SalesChannel } from './misDeckData';
import { SKU_CELLS, type SkuCell } from './skuChannelPnl';
import { markModelled } from './skuLayer';
import { tieToAudit } from './auditTie';

const r2 = (n: number) => Math.round(n * 100) / 100;
type ByChannel = Partial<Record<SalesChannel, number>>;
const sumOf = (o: ByChannel) => SALES_CHANNELS.reduce((s, c) => s + (o[c] ?? 0), 0);

/** Product label of the Amazon cell cut back out of the OEM model cell (no SKU detail for those months). */
export const AMAZON_NO_SKU_SPLIT = 'Amazon (no SKU split)';

/**
 * One published month with its channel rows ex-GST: scaled so they sum to the month's net revenue.
 * Pure and idempotent. A month with no channel rows, or whose rows already foot, is returned as is.
 */
export function exGstChannels(m: MonthlyMIS): MonthlyMIS {
  if (m.gmvByChannel) return m;
  const total = sumOf(m.netByChannel);
  if (!total || !m.netRevenue || Math.abs(total - m.netRevenue) < 0.005) return m;
  const f = m.netRevenue / total;
  const net: ByChannel = {};
  let biggest: SalesChannel | null = null;
  for (const c of SALES_CHANNELS) {
    const v = m.netByChannel[c];
    if (v === undefined) continue;
    net[c] = r2(v * f);
    if (biggest === null || Math.abs(v) > Math.abs(m.netByChannel[biggest] ?? 0)) biggest = c;
  }
  // paise left over from rounding go on the biggest channel, so the rows foot exactly
  if (biggest) net[biggest] = r2((net[biggest] ?? 0) + (m.netRevenue - sumOf(net)));
  return { ...m, netByChannel: net, ...(m.totalTaxes ? { gmvByChannel: { ...m.netByChannel } } : {}) };
}

/**
 * A month's SKU cells with Amazon cut back out of the OEM model cell. Applies only where the workbook month has
 * Amazon revenue, no Amazon cell, and OEM cells that hold exactly OEM + Amazon (the old fold): no date rule.
 * `raw` = the month as booked in the workbook (cells are on that basis).
 */
export function recutAmazonCells(cells: SkuCell[], raw: MonthlyMIS | undefined): SkuCell[] {
  const amazon = raw?.netByChannel.Amazon ?? 0;
  if (!raw || amazon <= 0 || cells.some((c) => c.ch === 'Amazon')) return cells;
  const oem = cells.filter((c) => c.ch === 'OEM');
  const oemRev = oem.reduce((s, c) => s + c.rev, 0);
  if (oemRev <= 0 || Math.abs(oemRev - ((raw.netByChannel.OEM ?? 0) + amazon)) > 2) return cells;
  const share = amazon / oemRev;
  const out: SkuCell[] = [];
  for (const c of cells) {
    if (c.ch !== 'OEM') { out.push(c); continue; }
    const rev = r2(c.rev * share), cogs = r2(c.cogs * share), oth = r2(c.oth * share);
    // what stays OEM keeps the model's own unit maths (units = revenue ÷ OEM price)
    out.push({ ...c, rev: r2(c.rev - rev), cogs: r2(c.cogs - cogs), oth: r2(c.oth - oth), con: r2((c.rev - rev) - (c.cogs - cogs) - (c.oth - oth)), u: r2(c.u * (1 - share)), costEst: true });
    out.push({ m: c.m, ch: 'Amazon', p: AMAZON_NO_SKU_SPLIT, rev, cogs, oth, con: r2(rev - cogs - oth), u: 0, costEst: true });
  }
  return out;
}

const RAW_BY_KEY = new Map(MONTHLY_MIS.map((m) => [m.key, m]));

/** The published months, oldest first, channel rows ex-GST, tied to the audited accounts (auditTie.ts). The one list every reader uses. */
export const PUBLISHED_MONTHS: MonthlyMIS[] = tieToAudit([...MONTHLY_MIS]
  .sort((a, b) => a.key.localeCompare(b.key))
  .map(exGstChannels));

/**
 * A month's SKU cells on the ex-GST basis (review of #401, 10 Nov 2026). Only a (month, channel) group whose cells add up to
 * the workbook's GST-incl channel row (±₹2: the model-cut groups — OEM, Offline, Blinkit some months, and Amazon before
 * Oct 2024) is scaled by that channel's ex-GST ÷ workbook factor, so it then equals the ex-GST channel row. Groups cut from
 * another source (Amazon net proceeds from Oct 2024, Shopify per-product) are already ex-GST and are left as booked.
 * `con` is recomputed; cost, fees and units are unchanged. Pure.
 */
export function exGstCells(cells: SkuCell[], raw: MonthlyMIS | undefined, pub: MonthlyMIS | undefined): SkuCell[] {
  if (!raw || !pub || !pub.gmvByChannel) return cells;
  const factor: Partial<Record<SalesChannel, number>> = {};
  for (const ch of SALES_CHANNELS) {
    const gross = raw.netByChannel[ch] ?? 0;
    const sum = cells.filter((c) => c.ch === ch).reduce((s, c) => s + c.rev, 0);
    if (gross && Math.abs(sum - gross) <= 2) factor[ch] = (pub.netByChannel[ch] ?? 0) / gross;
  }
  return cells.map((c) => {
    const f = factor[c.ch];
    if (f === undefined) return c;
    const rev = r2(c.rev * f);
    return { ...c, rev, con: r2(rev - c.cogs - c.oth) };
  });
}

const firstAmazon = (cells: SkuCell[]) => cells.filter((c) => c.ch === 'Amazon' && c.m >= '2024-10' && c.m <= '2025-03' && c.p !== AMAZON_NO_SKU_SPLIT);

/** Amazon revenue per unit (ex-GST) over its first months with SKU detail (Oct 2024 – Mar 2025): used to estimate early units. */
export function earlyAmazonAsp(cells: SkuCell[]): number | null {
  const a = firstAmazon(cells).filter((c) => c.u > 0);
  const u = a.reduce((s, c) => s + c.u, 0);
  return u > 0 ? a.reduce((s, c) => s + c.rev, 0) / u : null;
}

/** Amazon cost of goods ÷ revenue (ex-GST) over the same first months: costs the early Amazon cells (≈ 24 %, not OEM's 67.7 %). */
export function earlyAmazonCogsRate(cells: SkuCell[]): number | null {
  const a = firstAmazon(cells);
  const rev = a.reduce((s, c) => s + c.rev, 0);
  return rev > 0 ? a.reduce((s, c) => s + c.cogs, 0) / rev : null;
}

/**
 * The early Amazon cells (cut out of the OEM model cell) costed and counted like Amazon (round 6 B6-1/2, 10 Nov 2026):
 * cost = revenue × Amazon's Oct 2024 – Mar 2025 cost rate, units = revenue ÷ its revenue per unit; both flagged estimated.
 * The OEM part keeps the model's own cost (67.7 % of its real revenue). The model's extra cost on the Amazon revenue came from
 * units that never existed (revenue ÷ the ₹325 OEM price), so it is dropped, not moved to OEM: cell COGS only go down. Pure.
 */
export function costEarlyAmazon(cells: SkuCell[], rate: number | null, asp: number | null): SkuCell[] {
  if (rate === null && asp === null) return cells;
  return cells.map((c) => {
    if (c.p !== AMAZON_NO_SKU_SPLIT) return c;
    const cogs = rate === null ? c.cogs : r2(c.rev * rate);
    return { ...c, cogs, con: r2(c.rev - cogs - c.oth), costEst: true, ...(asp && c.u === 0 ? { u: r2(c.rev / asp), uEst: true } : {}) };
  });
}

const PUB_BY_KEY = new Map(PUBLISHED_MONTHS.map((m) => [m.key, m]));

/** The published SKU cells: ex-GST where cut from the workbook rows, early Amazon as its own cell costed and counted like Amazon. */
export const PUBLISHED_CELLS: SkuCell[] = (() => {
  const byMonth = new Map<string, SkuCell[]>();
  for (const c of SKU_CELLS) byMonth.set(c.m, [...(byMonth.get(c.m) ?? []), c]);
  const cells = [...byMonth.entries()].flatMap(([k, cs]) => exGstCells(recutAmazonCells(cs, RAW_BY_KEY.get(k)), RAW_BY_KEY.get(k), PUB_BY_KEY.get(k)));
  // OEM / Offline / Blinkit cells are a model (product + units assumed): flagged so views never rank them as counted (R6 B6-5).
  return markModelled(costEarlyAmazon(cells, earlyAmazonCogsRate(cells), earlyAmazonAsp(cells)));
})();

/** A month the published workbook also had, now shown from Tally: the workbook's figures and live − published (₹). */
export interface PublishedGap { netRevenue: number; netIncome: number; dNetRevenue: number; dNetIncome: number }

export function publishedGap(published: MonthlyMIS, live: MonthlyMIS): PublishedGap {
  return {
    netRevenue: r2(published.netRevenue), netIncome: r2(published.netIncome),
    dNetRevenue: r2(live.netRevenue - published.netRevenue), dNetIncome: r2(live.netIncome - published.netIncome),
  };
}

/** The months shown from Tally that the published workbook also had, oldest first, with live − published (₹). */
export function publishedGapRows(completeness: Record<string, { vsPublished?: PublishedGap }>): ({ key: string } & PublishedGap)[] {
  return Object.keys(completeness).sort()
    .flatMap((key) => { const g = completeness[key]?.vsPublished; return g ? [{ key, ...g }] : []; });
}
