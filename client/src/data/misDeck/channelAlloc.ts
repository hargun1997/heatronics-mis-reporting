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
import { AMAZON_ACTUALS, BLINKIT_ACTUALS, D2C_COSTS } from './channelActuals';

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

// ---- Fees, platform and COGM by channel (audit round 9 B2 / A9-2, round 8 C3 / C8; 10 Nov 2026) ----------------------

export interface CostSplit {
  values: number[];
  /** 'attributed' = what the reports / fee feeds put on each channel (capped at the books); 'estimated' = part of the line went by revenue. */
  basis: 'attributed' | 'estimated';
}

/**
 * Channel & fulfilment (marketplace fees, couriers) or Platform & Payment by channel. The fees a report puts on a
 * channel stay there (capped at the booked total). The rest goes ONLY to the consumer channels (they are the ones that
 * pay marketplace / courier / gateway fees), by their revenue; B2B / GT / OEM / Export carry such costs only when a
 * report attributes them directly. With no consumer revenue at all, every channel by revenue. Σ values = total.
 */
export function allocateChannelCost(
  channels: readonly SalesChannel[], total: number, attributed: number[], revenue: number[], fallbackRevenue?: number[],
): CostSplit {
  const { values } = capToTotal(attributed, total);
  const rest = total - sum(values);
  if (Math.abs(rest) < 0.005 || channels.length === 0) return { values, basis: 'attributed' };
  const consumer = channels.map(isConsumerChannel);
  const pick = (w: number[], onlyConsumer: boolean) => w.map((v, i) => (!onlyConsumer || consumer[i] ? Math.max(0, v) : 0));
  const candidates = [
    pick(revenue, true), pick(fallbackRevenue ?? [], true), channels.map((_, i) => (consumer[i] ? 1 : 0)),
    pick(revenue, false), channels.map(() => 1),
  ];
  // A rest under 1 % of the line is rounding / timing on attributed channels, not an estimate.
  const basis: CostSplit['basis'] = Math.abs(rest) > 0.01 * Math.abs(total) ? 'estimated' : 'attributed';
  for (const w of candidates) {
    const tot = sum(w);
    if (tot > 0) return { values: values.map((a, i) => a + rest * (w[i] / tot)), basis };
  }
  return { values, basis: 'estimated' };
}

/** Per channel: COGS of its SKU cells, their revenue, and the revenue of cells with no BOM cost (accessories excluded). */
export interface ChannelCogsInput { cogs: number; cellRev: number; uncostedRev: number }

export interface CogsSplit {
  /** Weights (₹ of material, coverage-scaled) — the company COGM is split in these proportions. */
  weights: number[];
  /** Per channel: true when its weight is an estimate (no cells, cost-less sales, or cells far from the booked revenue). */
  estimated: boolean[];
  /** Plain-English notes for the estimated channels. */
  notes: string[];
}

/**
 * COGM weights by channel on ONE basis: the booked (Tally) revenue. A channel's SKU cells give its material cost per ₹
 * of sales; that is applied to the channel's booked revenue (cell COGS × booked ÷ cell revenue), so a channel whose
 * connector covers only part of what Tally booked (e.g. Tranzact vs Tally OEM) still carries the cost of all of it.
 * Sales with no BOM cost are costed at the month's material rate (never at ₹0), and a channel with booked revenue but
 * no cells at that same rate — both flagged estimated. Coverage ratio is clamped to 0.2–5.
 */
export function cogsWeights(channels: readonly SalesChannel[], booked: number[], cells: ChannelCogsInput[]): CogsSplit {
  const costedRev = cells.map((c) => Math.max(0, c.cellRev - c.uncostedRev));
  const totCogs = sum(cells.map((c) => Math.max(0, c.cogs)));
  const totCosted = sum(costedRev);
  const rate = totCosted > 0 ? totCogs / totCosted : 0;
  const estimated = channels.map(() => false);
  const notes: string[] = [];
  const weights = channels.map((ch, i) => {
    const b = Math.max(0, booked[i] ?? 0);
    const c = cells[i] ?? { cogs: 0, cellRev: 0, uncostedRev: 0 };
    const material = Math.max(0, c.cogs) + Math.max(0, c.uncostedRev) * rate;
    if (c.uncostedRev > 0 && rate > 0) { estimated[i] = true; notes.push(`${ch}: ₹${(c.uncostedRev / 1e5).toFixed(2)} L of sales with no BOM cost costed at the month's material rate`); }
    if (b <= 0) return 0;                                  // nothing booked on the channel: no COGM (the revenue sits elsewhere)
    if (c.cellRev > 0 && material > 0) {
      const k = Math.min(5, Math.max(0.2, b / c.cellRev));
      if (k < 0.9 || k > 1.1) { estimated[i] = true; notes.push(`${ch}: SKU data covers ${Math.round(100 / k)}% of booked sales — cost scaled to the booked sales`); }
      return material * k;
    }
    estimated[i] = true;
    notes.push(`${ch}: no SKU cost data — costed at the month's average material rate`);
    return b * rate;
  });
  // No material rate at all (no costed cells): booked revenue share, every channel estimated.
  if (sum(weights) <= 0) return { weights: channels.map((_, i) => Math.max(0, booked[i] ?? 0)), estimated: channels.map(() => true), notes: ['No SKU cost data — COGM split by revenue'] };
  return { weights, estimated, notes };
}

/**
 * Sum per-channel rows over months (a year / quarter / range = Σ its months, never split once at period level: costs
 * booked in one half of a year must not land on a channel that sold in the other half). Numeric fields are added;
 * `pick` keeps the non-numeric fields of the first row seen.
 */
export function sumChannelRows<T extends { channel: SalesChannel }>(monthRows: T[][]): T[] {
  const by = new Map<SalesChannel, T>();
  for (const rows of monthRows) {
    for (const r of rows) {
      const prev = by.get(r.channel);
      if (!prev) { by.set(r.channel, { ...r }); continue; }
      const next = { ...prev } as Record<string, unknown>;
      for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && typeof next[k] === 'number') next[k] = (next[k] as number) + v;
      by.set(r.channel, next as T);
    }
  }
  return [...by.values()];
}

/** Fee feeds of the published history (no Tally tags behind them), by channel and month: marketplace / courier fees. */
export function feedFees(ch: SalesChannel, month: string): number {
  if (ch === 'Amazon') { const a = AMAZON_ACTUALS[month]; return a ? a.referral + a.fba : 0; }
  if (ch === 'D2C') return D2C_COSTS[month]?.shiprocket ?? 0;
  if (ch === 'Blinkit') return BLINKIT_ACTUALS[month]?.fulfilment ?? 0;
  return 0;
}
/** Platform & payment feeds of the published history: checkout (Shopflo) + payment gateway, D2C only. */
export function feedPlatform(ch: SalesChannel, month: string): number {
  if (ch !== 'D2C') return 0;
  const d = D2C_COSTS[month];
  return d ? d.shopflo + d.gateway : 0;
}
