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
//     shared pro rata and flagged as an estimate, units not known).
// ----------------------------------------------------------------------------

import { MONTHLY_MIS, SALES_CHANNELS, type MonthlyMIS, type SalesChannel } from './misDeckData';
import { SKU_CELLS, type SkuCell } from './skuChannelPnl';

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
    out.push({ ...c, rev: r2(c.rev - rev), cogs: r2(c.cogs - cogs), oth: r2(c.oth - oth), con: r2((c.rev - rev) - (c.cogs - cogs) - (c.oth - oth)), u: r2(c.u * (1 - share)) });
    out.push({ m: c.m, ch: 'Amazon', p: AMAZON_NO_SKU_SPLIT, rev, cogs, oth, con: r2(rev - cogs - oth), u: 0, costEst: true });
  }
  return out;
}

const RAW_BY_KEY = new Map(MONTHLY_MIS.map((m) => [m.key, m]));

/** The published months, oldest first, channel rows ex-GST. The one list every reader uses. */
export const PUBLISHED_MONTHS: MonthlyMIS[] = [...MONTHLY_MIS]
  .sort((a, b) => a.key.localeCompare(b.key))
  .map(exGstChannels);

/** The published SKU cells with early Amazon as its own cell. */
export const PUBLISHED_CELLS: SkuCell[] = (() => {
  const byMonth = new Map<string, SkuCell[]>();
  for (const c of SKU_CELLS) byMonth.set(c.m, [...(byMonth.get(c.m) ?? []), c]);
  return [...byMonth.entries()].flatMap(([k, cells]) => recutAmazonCells(cells, RAW_BY_KEY.get(k)));
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
