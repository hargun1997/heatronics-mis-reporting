// ----------------------------------------------------------------------------
// Channel cost allocation rules for the Channel P&L (pure; tests server/test/channelAlloc.test.ts).
//
//   1. Marketing follows the money: ad spend sits on the channel it was spent for (Amazon Ads → Amazon, Meta + Google
//      → D2C, Flipkart Ads → Flipkart, Blinkit ads → Blinkit). The rest of Tally's Sales & Marketing (agency, brand,
//      other) goes ONLY to the consumer channels, in proportion to their ad spend (else their revenue). B2B / OEM / GT /
//      Offline / Export carry marketing only when something attributes it to them directly.
//   2. A report can never put more cost on a channel than Tally booked on the line: attribution is capped at Tally's
//      total, pro rata, so nothing negative is spread to the other channels and the P&L still foots to Tally. The
//      excess is kept on the line (`over`) and raised as a Fix item.
// ----------------------------------------------------------------------------

import type { TallyBucketLine } from '../monthClose/schema';
import type { SalesChannel } from './misDeckData';

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/** Channels that advertise to consumers: the only ones that share unattributed marketing. */
export const CONSUMER_CHANNELS: readonly SalesChannel[] = ['D2C', 'Amazon', 'Flipkart', 'Blinkit'];
export const isConsumerChannel = (ch: SalesChannel): boolean => CONSUMER_CHANNELS.includes(ch);

/** Scale attributed costs (positive = cost) down, pro rata, so they never exceed the booked total. */
export function capToTotal(attributed: number[], total: number): { values: number[]; excess: number } {
  const att = attributed.map((v) => Math.max(0, v));
  const a = sum(att);
  const cap = Math.max(0, total);
  if (a <= cap + 0.005) return { values: att, excess: 0 };
  const k = a > 0 ? cap / a : 0;
  return { values: att.map((v) => v * k), excess: a - cap };
}

/** Attributed cost + a share of the rest. A negative rest (reports above the books) is never spread: attribution is capped. */
export function spreadWithCap(total: number, attributed: number[], share: (i: number) => number): number[] {
  const { values } = capToTotal(attributed, total);
  const rest = total - sum(values);
  return values.map((a, i) => a + rest * share(i));
}

export interface MarketingSplit {
  values: number[];
  /** 'spend' = follows ad spend; 'estimated' = no ad-spend split, the rest went by revenue. */
  basis: 'spend' | 'estimated';
}

/**
 * Sales & Marketing by channel. `attributed` = ad spend known for each channel (positive = cost), `revenue` = the
 * channel's net revenue, `fallbackRevenue` = connector sales (used only when no consumer channel has Tally revenue).
 * Σ values = total, always.
 */
export function allocateMarketing(
  channels: readonly SalesChannel[], total: number, attributed: number[], revenue: number[], fallbackRevenue?: number[],
): MarketingSplit {
  const { values } = capToTotal(attributed, total);
  const rest = total - sum(values);
  if (Math.abs(rest) < 0.005 || channels.length === 0) return { values, basis: 'spend' };

  const consumer = channels.map(isConsumerChannel);
  const pick = (w: number[], onlyConsumer: boolean) => w.map((v, i) => (!onlyConsumer || consumer[i] ? Math.max(0, v) : 0));
  const candidates: { w: number[]; basis: MarketingSplit['basis'] }[] = [
    { w: pick(values, true), basis: 'spend' },                                   // consumer channels by their ad spend
    { w: pick(revenue, true), basis: 'estimated' },                              // … else by their revenue
    { w: pick(fallbackRevenue ?? [], true), basis: 'estimated' },                // … else by their connector sales
    { w: channels.map((_, i) => (consumer[i] ? 1 : 0)), basis: 'estimated' },    // … else equally
    { w: pick(revenue, false), basis: 'estimated' },                             // no consumer channel at all: every channel by revenue
    { w: channels.map(() => 1), basis: 'estimated' },
  ];
  for (const c of candidates) {
    const tot = sum(c.w);
    if (tot > 0) return { values: values.map((a, i) => a + rest * (c.w[i] / tot)), basis: c.basis };
  }
  return { values, basis: 'estimated' };
}

/**
 * One month's tagged Tally lines with attribution capped at Tally's total per line. Where the reports say more than the
 * books, each channel is scaled down pro rata, `blended` becomes 0 and `over` keeps what was cut (₹, positive).
 */
export function capTallyLines(lines: TallyBucketLine[]): TallyBucketLine[] {
  return lines.map((line) => {
    const chans = (Object.keys(line.byChannel) as SalesChannel[]).filter((ch) => (line.byChannel[ch] ?? 0) < 0);
    if (chans.length === 0) return line;
    const raw = chans.map((ch) => -(line.byChannel[ch] ?? 0));
    const { values, excess } = capToTotal(raw, -line.total);
    if (excess <= 0) return line;
    const byChannel: Partial<Record<SalesChannel, number>> = { ...line.byChannel };
    const over: Partial<Record<SalesChannel, number>> = {};
    chans.forEach((ch, i) => { byChannel[ch] = r2(-values[i]); over[ch] = r2(raw[i] - values[i]); });
    // Rounding: keep Σ byChannel + blended = total by putting the paise on the biggest channel.
    const big = chans[raw.indexOf(Math.max(...raw))];
    const drift = r2(-Math.max(0, -line.total) - chans.reduce((t, ch) => t + (byChannel[ch] ?? 0), 0));
    if (drift) byChannel[big] = r2((byChannel[big] ?? 0) + drift);
    const all = Object.values(byChannel).reduce((t: number, v) => t + (v ?? 0), 0);
    return { ...line, byChannel, blended: r2(line.total - all), over };
  });
}

export interface OverAttribution {
  month: string; lineKey: string; label: string; cascadeLine: string;
  /** Channel with the biggest report figure on the line. */
  channel: SalesChannel;
  /** Report total above Tally's line (₹, positive). */
  excess: number;
  /** Tally's booked cost on the line (₹, positive). */
  tally: number;
  /** What the reports say (₹, positive). */
  reported: number;
}

const KIND: Record<string, string> = { channel_fulfilment: 'fees', sales_marketing: 'ad spend', platform_payment: 'platform costs' };
export const overKind = (cascadeLine: string): string => KIND[cascadeLine] ?? 'costs';

/** Months × Tally lines where the reports attribute more than Tally booked (≥ `min` ₹). */
export function overAttributions(months: { key: string; tallyLines?: TallyBucketLine[] }[], min = 1000): OverAttribution[] {
  const out: OverAttribution[] = [];
  for (const m of months) {
    for (const l of m.tallyLines ?? []) {
      const entries = Object.entries(l.over ?? {}) as [SalesChannel, number][];
      const excess = r2(entries.reduce((s, [, v]) => s + v, 0));
      if (excess < min) continue;
      const channel = entries.sort((a, b) => b[1] - a[1])[0][0];
      const tally = Math.max(0, -l.total);
      out.push({ month: m.key, lineKey: l.lineKey, label: l.label, cascadeLine: l.cascadeLine, channel, excess, tally, reported: r2(tally + excess) });
    }
  }
  return out;
}
