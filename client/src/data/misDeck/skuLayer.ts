// The SKU layer, made to foot (audit rounds 6 / 8 / 10, 10 Nov 2026). Pure helpers; tests in server/test/skuLayer.test.ts.
//
//  • "Not mapped" cells (R6 A6-1/3): sales whose platform key no product map knows still get a cell per channel
//    (revenue, units, fees; no cost → `noCost`), so the SKU P&L and Units sold never drop them silently.
//  • Modelled cells (R6 B6-5): the workbook's OEM / Offline / Blinkit cells are a model (product assumed, units =
//    revenue ÷ an assumed price). They are flagged `modelled`; views rank products by measured revenue and show
//    those units as estimated.
//  • Static cells on the books' basis (R8 C1 / C9): D2C ad spend ex-GST (Google was carried with 18 % GST) and a
//    month's cell channel fees + ads capped at the P&L's channel & fulfilment + S&M (cells never cost more than booked).
//  • COGM shares (R6 B6-7): a channel with sales but no SKU cells gets the company COGM rate, a channel with ₹0 or
//    negative sales gets no COGM (never a 100 % margin, never COGS on no sales).
//  • Period = sum of months (R6 B6-6): a multi-month channel P&L is the sum of its monthly ones.

import type { MonthlyMIS, SalesChannel } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Product label for sales no product map knows (one cell per channel and month). */
export const NO_PRODUCT_LABEL = 'Not mapped (sales with no product)';

/** Buckets that are not a product (accessories, early Amazon with no SKU split, unmapped sales): ranked after the products. */
export const rankLast = (p: string): boolean => p.startsWith('Accessory') || p === 'Amazon (no SKU split)' || p === NO_PRODUCT_LABEL;

/** Channels whose workbook SKU cells are a model, not measured (product + units assumed from the channel total). */
export const MODELLED_CHANNELS: readonly SalesChannel[] = ['OEM', 'Offline', 'Blinkit'];

/** Units on a cell that were not counted (modelled cell, or units estimated from revenue). */
export const estimatedUnits = (c: Pick<SkuCell, 'u' | 'modelled' | 'uEst'>): number => (c.modelled || c.uEst ? c.u : 0);

/** Revenue of a cell whose product is assumed (modelled), else 0. */
export const modelledRevenue = (c: Pick<SkuCell, 'rev' | 'modelled'>): number => (c.modelled ? c.rev : 0);

/** Flag the workbook's model-cut cells (OEM / Offline / Blinkit). Pure. */
export function markModelled(cells: SkuCell[]): SkuCell[] {
  return cells.map((c) => (MODELLED_CHANNELS.includes(c.ch) ? { ...c, modelled: true } : c));
}

/** One "Not mapped" cell per channel from the month's unmapped sales rows. Pure. */
export function notMappedCells(
  rows: { platform: string; revenue: number; units: number; fees?: number }[],
  periodKey: string,
  channelOf: (platform: string) => SalesChannel | undefined,
): SkuCell[] {
  const by = new Map<SalesChannel, { rev: number; u: number; fees: number }>();
  for (const r of rows) {
    const ch = channelOf(r.platform);
    if (!ch) continue;
    const e = by.get(ch) ?? { rev: 0, u: 0, fees: 0 };
    e.rev += r.revenue; e.u += r.units; e.fees += r.fees ?? 0;
    by.set(ch, e);
  }
  const out: SkuCell[] = [];
  for (const [ch, e] of by) {
    if (Math.abs(e.rev) < 0.005 && Math.abs(e.u) < 0.005) continue;
    out.push({ m: periodKey, ch, p: NO_PRODUCT_LABEL, rev: r2(e.rev), cogs: 0, oth: r2(e.fees), con: r2(e.rev - e.fees), u: r2(e.u), ad: 0, noCost: true });
  }
  return out;
}

/**
 * A static (published) month's cells on the books' basis. `oth` = channel & fulfilment, `ad` = ads (already split).
 *  1. D2C `ad` × `d2cAdExGst ÷ d2cAdGross` when that is below 1 (the feed's Google carried 18 % GST; the P&L's ad feeds are ex-GST).
 *  2. Σ ad never above the P&L's S&M; Σ oth never above what is left of the P&L's channel & fulfilment + S&M after the ads,
 *     so Σ (oth + ad) ≤ booked C&F + S&M. Ads (measured feeds) are kept first; the fees, the less certain split, give way.
 * Below the P&L stays as it is (the rest is company cost the SKU view shows in its "Recon → Tally" column). Pure.
 */
export function bookedStaticCells(
  cells: SkuCell[],
  month: Pick<MonthlyMIS, 'channelFulfillment' | 'salesMarketing'> | undefined,
  d2cAd?: { exGst: number; gross: number } | null,
): SkuCell[] {
  const d2cF = d2cAd && d2cAd.gross > 0 && d2cAd.exGst > 0 && d2cAd.exGst < d2cAd.gross ? d2cAd.exGst / d2cAd.gross : 1;
  let out = d2cF === 1 ? cells : cells.map((c) => (c.ch === 'D2C' && c.ad ? { ...c, ad: r2(c.ad * d2cF) } : c));
  if (month) {
    const sm = Math.max(0, month.salesMarketing), cf = Math.max(0, month.channelFulfillment);
    // ads are measured (platform feeds): kept, only never above the booked S&M
    const adOn = out.reduce((s, c) => s + Math.max(0, c.ad ?? 0), 0);
    if (adOn > sm + 1) {
      const k = adOn > 0 ? sm / adOn : 0;
      out = out.map((c) => (c.ad && c.ad > 0 ? { ...c, ad: r2(c.ad * k) } : c));
    }
    // channel fees take what is left of the booked C&F + S&M (the fee split is the less certain one, R8 C2 / C3)
    const room = Math.max(0, cf + sm - Math.min(adOn, sm));
    const cfOn = out.reduce((s, c) => s + Math.max(0, c.oth), 0);
    if (cfOn > room + 1) {
      const k = cfOn > 0 ? room / cfOn : 0;
      out = out.map((c) => (c.oth > 0 ? { ...c, oth: r2(c.oth * k) } : c));
    }
  }
  return out.map((c) => ({ ...c, con: r2(c.rev - c.cogs - c.oth - (c.ad ?? 0)) }));
}

/**
 * Share of a period's COGM per channel. Channels with SKU cells split the COGM by their cell COGS; a channel with
 * sales but no cells (or no cell cost) takes the company rate (COGM ÷ net revenue × its sales); ₹0 or negative
 * sales = no COGM. Shares sum to 1 whenever any channel has positive sales. Pure.
 */
export function cellCogmShares(revenue: number[], cellCogs: number[], hasCells: boolean[], fallback: (i: number) => number): number[] {
  const n = revenue.length;
  const totPos = revenue.reduce((s, v) => s + Math.max(0, v), 0);
  if (totPos <= 0) return revenue.map(() => 0);
  const noCell = (i: number) => revenue[i] > 0 && (!hasCells[i] || cellCogs[i] <= 0);
  const fixed = Array.from({ length: n }, (_, i) => (noCell(i) ? revenue[i] / totPos : 0));
  const rest = 1 - fixed.reduce((s, v) => s + v, 0);
  const pool = Array.from({ length: n }, (_, i) => (revenue[i] > 0 && !noCell(i) ? Math.max(0, cellCogs[i]) : 0));
  const tot = pool.reduce((s, v) => s + v, 0);
  if (tot <= 1) {
    // no usable cell cost at all: the old fallback (revenue share), still nothing on ₹0 / negative sales
    const fb = Array.from({ length: n }, (_, i) => (revenue[i] > 0 ? Math.max(0, fallback(i)) : 0));
    const ft = fb.reduce((s, v) => s + v, 0);
    return ft > 0 ? fb.map((v) => v / ft) : fb;
  }
  return Array.from({ length: n }, (_, i) => fixed[i] + (pool[i] / tot) * rest);
}

/** Row shape summed by `sumMonthlyChannelRows` (the anchored channel P&L row). */
export interface ChannelRowLike {
  channel: SalesChannel;
  revenue: number; cogm: number; grossMargin: number; channelFulfillment: number; cm1: number;
  salesMarketing: number; cm2: number; platformCosts: number; cm3: number; opex: number; ebitda: number;
  nonOperating: number; costOfFundraising: number; netIncome: number;
  revShare: number; cogsShare: number; smShare: number;
  basis: 'tally' | 'shares' | 'estimated';
}

const SUM_KEYS = ['revenue', 'cogm', 'grossMargin', 'channelFulfillment', 'cm1', 'salesMarketing', 'cm2', 'platformCosts', 'cm3', 'opex', 'ebitda', 'nonOperating', 'costOfFundraising', 'netIncome'] as const;

/** A period's channel P&L as the sum of its months' (R6 B6-6). Shares are re-derived from the summed figures. Pure. */
export function sumMonthlyChannelRows<R extends ChannelRowLike>(byMonth: R[][], order: readonly SalesChannel[]): R[] {
  const by = new Map<SalesChannel, R>();
  for (const rows of byMonth) {
    for (const r of rows) {
      const e = by.get(r.channel);
      if (!e) { by.set(r.channel, { ...r }); continue; }
      for (const k of SUM_KEYS) (e[k] as number) = e[k] + r[k];
      if (r.basis === 'estimated' || (r.basis === 'tally' && e.basis === 'shares')) e.basis = r.basis;
    }
  }
  const rows = order.filter((ch) => by.has(ch)).map((ch) => by.get(ch)!);
  const pos = rows.reduce((s, r) => s + Math.max(0, r.revenue), 0);
  const cogm = rows.reduce((s, r) => s + r.cogm, 0);
  const sm = rows.reduce((s, r) => s + r.salesMarketing, 0);
  for (const r of rows) {
    r.revShare = pos > 0 ? Math.max(0, r.revenue) / pos : 0;
    r.cogsShare = cogm ? r.cogm / cogm : 0;
    r.smShare = sm ? r.salesMarketing / sm : 0;
  }
  return rows;
}
