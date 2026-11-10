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
import { DEFAULT_GST_RATE, exGstOf, type NetBasis } from './gstBasis';

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

export const TIE_LIMIT_PCT = 1;
/** GST used only to estimate ex-GST sales for a GST-inclusive source that cannot split tax (the product rate, gstBasis.ts). */
export const ASSUMED_GST_RATE = DEFAULT_GST_RATE;

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
export type { NetBasis };

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
  /** false = shown, not judged against the 1 % limit (connector side is an orders estimate, not booked sales). */
  judged?: boolean;
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
    const x = exGstOf(f);
    a.net += x.net; a.basis.add(x.basis);
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
      // Orders GMV ÷ (1 + GST) is before returns / cancellations: not like for like with Tally's booked ledger, so it is
      // shown but never judged against the 1 % limit (a channel Tally has not booked at all is named by monthCompleteness).
      ...(a && !a.basis.has('reported') && !a.basis.has('booked') ? { judged: false } : {}),
    });
  }

  const pct = (v: number | null) => (v === null || !netRevenue ? null : (Math.abs(v) / Math.abs(netRevenue)) * 100);
  const cands: { label: string; pct: number; detail?: string }[] = [];
  const profitPct = pct(args.profitResidual);
  if (profitPct !== null) cands.push({ label: 'Net profit vs Tally', pct: profitPct });
  for (const c of channels) {
    const p = pct(c.residual);
    if (p === null || c.judged === false) continue;
    // Say which side is lower and by how much (Tally − connectors).
    const side = c.residual! < 0 ? `Tally ${inr(c.residual!)} lower (${inr(c.tally)} vs ${inr(c.net!)} from ${c.sources.join(', ')})`
      : `Tally ${inr(c.residual!)} higher (${inr(c.tally)} vs ${inr(c.net!)} from ${c.sources.join(', ')})`;
    cands.push({ label: `${c.channel} sales vs Tally`, pct: p, detail: side });
  }
  const worst = cands.reduce<{ label: string; pct: number } | null>((w, c) => (!w || c.pct > w.pct ? c : w), null);
  const breaches = cands.filter((c) => c.pct > TIE_LIMIT_PCT).map((c) => `${c.label}: ${c.pct.toFixed(1)}% of revenue${c.detail ? ` — ${c.detail}` : ''}`);
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
