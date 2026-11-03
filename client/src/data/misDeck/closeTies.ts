// ----------------------------------------------------------------------------
// Month-close ties — how well a live month agrees with Tally, and the lock rule.
//
// Two checks per month, both shown with their residual:
//   1. Profit: Tally's own Nett Profit/Loss vs the net income the MIS cascade
//      produced from the same ledgers (the engine's reconciliation residual).
//   2. Sales by channel: what the connectors saw (Amazon, Shopify, Flipkart,
//      Blinkit, Tranzact GT / B2B) vs Tally's channel sales ledgers. Tally is
//      ex-GST, so the connector side is compared ex-GST; GMV (customer-paid,
//      incl. GST) is shown next to it for the sources that have it.
//
// A month "breaches" when any residual is above 1% of its net revenue. Locking
// a breaching month needs a written reason. Pure — tests in server/test.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../liveMis/facts';
import type { SalesChannel } from './misDeckData';
import { SALES_CHANNELS } from './misDeckData';
import { toSalesChannel } from './expenseTagging';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const TIE_LIMIT_PCT = 1;
/** GST used only to estimate ex-GST sales for a GST-inclusive source that cannot split tax. */
export const ASSUMED_GST_RATE = 0.18;

/** The shared lock record (mirror of server/src/ingest/closeLocks.ts MonthLock). */
export interface MonthLock {
  periodKey: string;
  lockedAt: string;
  lockedBy: string;
  verifiedUser?: boolean;
  overrideReason?: string;
  worstResidualPct?: number | null;
  note?: string;
}

/** How the connector's ex-GST figure was obtained. */
export type NetBasis = 'reported' | 'booked' | 'estimated';

export interface ChannelTie {
  channel: SalesChannel;
  /** Connector sources behind the figure, e.g. ['shopify']. Empty = no connector for this channel. */
  sources: string[];
  /** Customer-paid incl. GST — only where a source reports it. */
  gmv: number | null;
  /** Connector sales ex-GST (null when no connector covers the channel). */
  net: number | null;
  netBasis: NetBasis | null;
  /** Tally's channel sales ledger total (ex-GST, net of returns). */
  tally: number;
  /** tally − net; null when there is no connector side to compare. */
  residual: number | null;
}

export interface ProfitTie {
  tallyNett: number | null;
  misProfit: number;
  /** misProfit − tallyNett after the engine's named structural items. */
  residual: number | null;
}

export interface CloseTie {
  periodKey: string;
  netRevenue: number;
  profit: ProfitTie;
  channels: ChannelTie[];
  /** Worst |residual| over the profit tie and every channel, as % of net revenue. */
  worstResidualPct: number | null;
  /** What the worst residual is. */
  worstLabel: string | null;
  breach: boolean;
  /** Plain sentences naming each residual above the limit. */
  breaches: string[];
}

/** Sources whose `revenue` is a settlement / invoice amount already ex-GST or not splittable: taken as booked. */
const GST_INCLUSIVE_UNSPLIT = new Set(['shopify', 'amazon']);

interface Acc { gmv: number; haveGmv: boolean; net: number; basis: Set<NetBasis>; sources: Set<string> }

/** Fold a month's connector facts into per-channel GMV and ex-GST sales. */
export function connectorSales(facts: DailyFact[]): Map<SalesChannel, Acc> {
  const out = new Map<SalesChannel, Acc>();
  for (const f of facts) {
    if (!f.revenue) continue;
    const ch = toSalesChannel(f.channel);
    if (!ch) continue;
    const a = out.get(ch) ?? { gmv: 0, haveGmv: false, net: 0, basis: new Set<NetBasis>(), sources: new Set<string>() };
    a.sources.add(f.source);
    if (typeof f.gmv === 'number') { a.gmv += f.gmv; a.haveGmv = true; }
    if (typeof f.netExGst === 'number') { a.net += f.netExGst; a.basis.add('reported'); }
    else if (typeof f.gmv === 'number' && GST_INCLUSIVE_UNSPLIT.has(f.source)) { a.net += f.gmv / (1 + ASSUMED_GST_RATE); a.basis.add('estimated'); }
    else { a.net += f.revenue; a.basis.add('booked'); }
    out.set(ch, a);
  }
  return out;
}

export function buildCloseTie(args: {
  periodKey: string;
  netRevenue: number;
  netByChannel: Partial<Record<SalesChannel, number>>;
  tallyNett: number | null;
  misProfit: number;
  profitResidual: number | null;
  facts: DailyFact[];
}): CloseTie {
  const { periodKey, netRevenue, netByChannel } = args;
  const sales = connectorSales(args.facts);
  const channels: ChannelTie[] = [];
  for (const ch of SALES_CHANNELS) {
    const tally = r2(netByChannel[ch] ?? 0);
    const a = sales.get(ch);
    if (!a && !tally) continue;
    const net = a ? r2(a.net) : null;
    channels.push({
      channel: ch,
      sources: a ? [...a.sources].sort() : [],
      gmv: a?.haveGmv ? r2(a.gmv) : null,
      net,
      netBasis: !a ? null : a.basis.has('estimated') ? 'estimated' : a.basis.has('booked') && !a.basis.has('reported') ? 'booked' : 'reported',
      tally,
      residual: net === null ? null : r2(tally - net),
    });
  }

  const pct = (v: number | null) => (v === null || !netRevenue ? null : (Math.abs(v) / Math.abs(netRevenue)) * 100);
  const cands: { label: string; pct: number }[] = [];
  const profitPct = pct(args.profitResidual);
  if (profitPct !== null) cands.push({ label: 'Net profit vs Tally', pct: profitPct });
  for (const c of channels) {
    const p = pct(c.residual);
    if (p !== null) cands.push({ label: `${c.channel} sales vs Tally`, pct: p });
  }
  const worst = cands.reduce<{ label: string; pct: number } | null>((w, c) => (!w || c.pct > w.pct ? c : w), null);
  const breaches = cands.filter((c) => c.pct > TIE_LIMIT_PCT).map((c) => `${c.label}: ${c.pct.toFixed(1)}% of revenue`);
  return {
    periodKey, netRevenue,
    profit: { tallyNett: args.tallyNett, misProfit: args.misProfit, residual: args.profitResidual },
    channels,
    worstResidualPct: worst ? r2(worst.pct) : null,
    worstLabel: worst?.label ?? null,
    breach: breaches.length > 0,
    breaches,
  };
}
