// ----------------------------------------------------------------------------
// SKU × channel cells footed to the Channel P&L (10 Nov 2026, audit round 8 C1 / C2 / C3, PR #403 review). Pure;
// tests server/test/channelFoot.test.ts.
//
// The SKU cells carry what the connectors know: BOM material, a factory figure, the report's fees (`oth`) and the
// measured ad spend. Summed per channel they did not foot to the P&L: no manufacturing cost / inward freight / cost of
// sales with no BOM, report fees above what Tally booked (₹28.5 L Nov–Mar), published Amazon cells with ads inside
// their fees. Here every channel-month's cells are footed to that channel's anchored row (anchoredChannelPnl):
//   • revenue: the books win. Books above the SKU data → a "Not mapped" cell per channel holds the difference;
//     SKU data above positive books (GMV incl. GST, double reports) → the cells are scaled down to the books; books
//     at or below zero (net returns) → the "Not mapped" cell holds the negative difference.
//   • COGM: material stays per cell (scaled down, flagged costEst, when it is above the channel's booked COGM — so
//     `fac` is never negative); the rest of the channel's COGM (factory, manufacturing, inward freight, stock
//     true-up, cost-less sales) goes into `fac`, by each cell's material (cost-less cells at the month's rate).
//   • fees / ad spend: scaled to the channel's booked fees / marketing, in proportion to each cell's own report figure
//     (else by revenue). Amazon ads inside a published cell's fees move to marketing this way.
// So Σ cells per channel = the Channel P&L to CM2, and Σ channels = the company P&L. Footed cells carry `footed`.
// ----------------------------------------------------------------------------

import type { SalesChannel } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';
import type { PeriodAgg } from './liveAnalytics';
import { cellFactory } from './liveAnalytics';
import type { PeriodCompleteness } from './liveDeck';
import { anchoredChannelPnl, isReal } from './liveViews';

export const NOT_MAPPED = 'Not mapped (books vs SKU data)';

export interface ChannelTarget { revenue: number; cogm: number; channelFulfillment: number; salesMarketing: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/** Split `total` by non-negative weights (falls back to `fallback`, then equally). */
function split(total: number, weights: number[], fallback: number[]): number[] {
  for (const w of [weights.map((v) => Math.max(0, v)), fallback.map((v) => Math.max(0, v)), weights.map(() => 1)]) {
    const t = sum(w);
    if (t > 0) return w.map((v) => (total * v) / t);
  }
  return weights.map(() => 0);
}

/** One month × channel's cells footed to its target (see header). */
export function footChannelCells(cells: SkuCell[], t: ChannelTarget, month: string, ch: SalesChannel): SkuCell[] {
  if (!cells.length && Math.abs(t.revenue) < 0.5) return [];
  const cellRev = sum(cells.map((c) => c.rev));
  let out: SkuCell[] = cells.map((c) => ({ ...c }));
  const residual = t.revenue - cellRev;
  if (residual < -0.5 && cellRev > 0 && t.revenue > 0) {
    const k = t.revenue / cellRev;
    out = out.map((c) => ({ ...c, rev: c.rev * k }));
  } else if (Math.abs(residual) > 0.5) {   // books above the SKU data, or net returns booked (negative)
    out.push({ m: month, ch, p: NOT_MAPPED, rev: residual, cogs: 0, oth: 0, con: 0, u: 0, ad: 0, noCost: true });
  }
  const costed = out.filter((c) => !c.noCost && c.cogs > 0);
  const rate = sum(costed.map((c) => c.rev)) > 0 ? sum(costed.map((c) => c.cogs)) / sum(costed.map((c) => c.rev)) : 0;
  const material = out.map((c) => (c.noCost ? (c.p === 'Accessory (excl)' ? 0 : c.rev * rate) : c.cogs));
  // Material for cost-less cells (and the not-mapped sales) is part of what they carry in `fac` below.
  // Cells' material above the channel's booked COGM (the books cost the sales lower than the BOM): material is scaled
  // down to the books and flagged costEst — the factory / conversion line is never negative.
  const mat = sum(out.map((c) => c.cogs));
  if (mat > Math.max(0, t.cogm) && mat > 0) {
    const k = Math.max(0, t.cogm) / mat;
    out = out.map((c) => (c.cogs ? { ...c, cogs: c.cogs * k, costEst: true } : c));
  }
  const gap = Math.max(0, t.cogm - sum(out.map((c) => c.cogs)));
  const facs = split(gap, out.map((c, i) => material[i] + (c.p === NOT_MAPPED ? 0 : cellFactory(c))), out.map((c) => c.rev));
  const fees = split(t.channelFulfillment, out.map((c) => c.oth), out.map((c) => c.rev));
  const ads = split(t.salesMarketing, out.map((c) => c.ad ?? 0), out.map((c) => c.rev));
  return out.map((c, i) => {
    const fac = r2(facs[i]), oth = r2(fees[i]), ad = r2(ads[i]), rev = r2(c.rev);
    const cogs = r2(c.cogs);
    return { ...c, rev, cogs, fac, oth, ad, con: r2(rev - cogs - fac - oth - ad), footed: true };
  });
}

/** Footed cells for the given months (others returned unchanged). `months` = single-month aggregates on the view's basis. */
export function footCellsToChannels(cells: SkuCell[], months: PeriodAgg[], completeness: Record<string, PeriodCompleteness>): SkuCell[] {
  const byMonth = new Map<string, SkuCell[]>();
  for (const c of cells) byMonth.set(c.m, [...(byMonth.get(c.m) ?? []), c]);
  const done = new Set<string>();
  const out: SkuCell[] = [];
  for (const p of months) {
    if (p.members.length !== 1 || !isReal(p.level, 'cm2')) continue;
    const key = p.members[0];
    const mine = byMonth.get(key) ?? [];
    const rows = anchoredChannelPnl(p, mine, completeness);
    if (!rows.length) continue;
    done.add(key);
    const chans = new Set<SalesChannel>([...rows.map((r) => r.channel), ...mine.map((c) => c.ch)]);
    for (const ch of chans) {
      const r = rows.find((x) => x.channel === ch);
      const own = mine.filter((c) => c.ch === ch);
      if (!r) { out.push(...own); continue; }
      out.push(...footChannelCells(own, r, key, ch));
    }
  }
  for (const c of cells) if (!done.has(c.m)) out.push(c);
  return out;
}
