// ----------------------------------------------------------------------------
// GST basis for connector sales — ONE place for "what is this fact ex-GST?".
//
// Tally books sales ex-GST. Some sources only know the customer-paid amount
// (GMV, incl. GST) and cannot split the tax (Amazon Sales API). For those the
// ex-GST figure is ESTIMATED with the product GST rate: Heatronics devices are
// 5 % (audit 10 Nov 2026: legacy tax ÷ gross = 5/105 in 20 of 25 months;
// Shopify GMV ÷ Tally D2C = 1.06). Change the default, or add a source to
// GST_RATE_BY_SOURCE, here only. Pure.
// ----------------------------------------------------------------------------
import type { DailyFact } from '../liveMis/facts';

/** Product GST rate used when a source cannot split tax (devices: 5 %). */
export const DEFAULT_GST_RATE = 0.05;
/** Per-source override of the rate (source id → rate). Empty = every source uses the default. */
export const GST_RATE_BY_SOURCE: Record<string, number> = {};
export const gstRateFor = (source: string): number => GST_RATE_BY_SOURCE[source] ?? DEFAULT_GST_RATE;
export const gstRateLabel = (rate = DEFAULT_GST_RATE): string => `${Math.round(rate * 1000) / 10}%`;

/** Sources whose `gmv` is GST-inclusive and whose feed has no tax split. */
export const GST_INCLUSIVE_UNSPLIT = new Set(['shopify', 'amazon']);

/** reported = the source split the tax; estimated = GMV ÷ (1 + rate); booked = taken as is (settlement / invoice). */
export type NetBasis = 'reported' | 'booked' | 'estimated';

/** A fact's sales ex-GST and how it was obtained. */
export function exGstOf(f: DailyFact): { net: number; basis: NetBasis } {
  if (typeof f.netExGst === 'number') return { net: f.netExGst, basis: 'reported' };
  if (typeof f.gmv === 'number' && GST_INCLUSIVE_UNSPLIT.has(f.source)) return { net: f.gmv / (1 + gstRateFor(f.source)), basis: 'estimated' };
  return { net: f.revenue, basis: 'booked' };
}

/** The same fact with `revenue` on the ex-GST basis (GMV kept). Used for months that have no Tally sales to anchor on. */
export function toExGstFact(f: DailyFact): DailyFact {
  if (!f.revenue) return f;
  const { net, basis } = exGstOf(f);
  return basis === 'booked' ? f : { ...f, revenue: Math.round(net * 100) / 100 };
}

/** Sources of a month's facts whose ex-GST sales had to be estimated. */
export function estimatedSources(facts: DailyFact[]): string[] {
  const out = new Set<string>();
  for (const f of facts) if (f.revenue && exGstOf(f).basis === 'estimated') out.add(f.source);
  return [...out].sort();
}
