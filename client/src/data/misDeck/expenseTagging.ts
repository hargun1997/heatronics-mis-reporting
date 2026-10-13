// ----------------------------------------------------------------------------
// Expense tagging & channel reconciliation.
//
// Tally is the authority for the P&L: every expense bucket total is Tally's own
// figure and is never recomputed from the connectors. What the connector facts
// add is *attribution* — the evidence for how much of a Tally bucket belongs to
// each channel (Amazon's commission off the Amazon settlement, Meta/Google
// spend by channel, and so on). Whatever the facts cannot attribute stays
// visible as a company-wide "blended" remainder rather than being smeared
// across channels.
//
// Two rules make this honest:
//   • Attribution only ever lands on a Tally line that EXISTS this month. If
//     Tally booked no platform/brand cost (September does not), the payment-
//     gateway evidence has nowhere to go and is simply not applied — we never
//     invent a line Tally did not carry.
//   • `blended = total − Σ byChannel` is left UNCLAMPED. When the connectors
//     report more cost than Tally booked on a line (timing, coverage), blended
//     flips sign instead of hiding the overflow. The identity
//     Σ byChannel + blended === total always holds.
//
// The channel reconciliation carries the same spirit for the top line and COGM:
// the connector channel/SKU view is kept as-is and its gap to Tally is named
// (revenueResidue per channel, cogmVariance overall), not reconciled away.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../liveMis/facts';
import type { ChannelRecon, TallyBucketLine } from '../monthClose/schema';
import type { SalesChannel } from './misDeckData';
import { SALES_CHANNELS } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---- Channel normalisation (single source of truth) ------------------------

const CHANNEL_ALIASES: Record<string, SalesChannel> = {
  d2c: 'D2C', shopify: 'D2C',
  amazon: 'Amazon',
  blinkit: 'Blinkit',
  flipkart: 'Flipkart',
  gt: 'GT', b2b: 'B2B',
  oem: 'OEM', offline: 'Offline', export: 'Export',
};

/** Normalise a fact's channel to a deck channel, or null when it is outside the fixed set. */
export function toSalesChannel(channel: string): SalesChannel | null {
  return CHANNEL_ALIASES[channel.trim().toLowerCase()] ?? null;
}

// ---- Cost tags -------------------------------------------------------------

/** How a tagged cost resolves to a channel. */
type ChannelResolver =
  | SalesChannel // fixed channel for this source
  | 'byFact' // use the fact's own channel
  | 'bySales'; // split across all channels pro-rata by net revenue (warranty)

interface CostTag {
  /** The Tally close line this connector's cost is booked under. */
  lineKey: string;
  /** Which fact field carries the cost magnitude. */
  field: 'fees' | 'spend';
  channel: ChannelResolver;
}

/**
 * Which connector cost attributes to which Tally line. Sources NOT listed are
 * deliberately left untagged so the double-count traps of the facts-only path
 * stay closed:
 *   • `googleadsproducts` is a per-item breakdown of the `googleads` grand
 *     total, so only `googleads` is tagged.
 *   • The Amazon settlement's lumped "cost of advertising" is never tagged —
 *     only `amazonads` carries Amazon spend — so settlement ad never doubles
 *     the ad report.
 */
const COST_TAGS: Record<string, CostTag> = {
  // CM1 — marketplace fees & commissions (Tally: Channel Fees & Commissions)
  amazon: { lineKey: 'ff_channel_fees', field: 'fees', channel: 'Amazon' },
  flipkart: { lineKey: 'ff_channel_fees', field: 'fees', channel: 'Flipkart' },
  blinkit: { lineKey: 'ff_channel_fees', field: 'fees', channel: 'Blinkit' },
  shiprocket: { lineKey: 'ff_channel_fees', field: 'fees', channel: 'byFact' },
  shopify: { lineKey: 'ff_channel_fees', field: 'fees', channel: 'D2C' },
  // CM2 — advertising (Tally: Sales & Marketing)
  meta: { lineKey: 'sm_total', field: 'spend', channel: 'D2C' },
  googleads: { lineKey: 'sm_total', field: 'spend', channel: 'D2C' },
  amazonads: { lineKey: 'sm_total', field: 'spend', channel: 'Amazon' },
  flipkartads: { lineKey: 'sm_total', field: 'spend', channel: 'Flipkart' },
  // CM3 — payment / checkout / BNPL (D2C basket cost) + warranty courier
  easebuzz: { lineKey: 'pf_platform', field: 'fees', channel: 'D2C' },
  shopflo: { lineKey: 'pf_platform', field: 'fees', channel: 'D2C' },
  snapmint: { lineKey: 'pf_platform', field: 'fees', channel: 'D2C' },
  delhivery: { lineKey: 'pf_platform', field: 'fees', channel: 'bySales' },
};

export interface TagTotals {
  /** lineKey → channel → attributed cost magnitude (always positive). */
  byLineChannel: Record<string, Partial<Record<SalesChannel, number>>>;
  /** lineKey → cost to spread across channels pro-rata by net sales (warranty). */
  bySalesByLine: Record<string, number>;
}

/**
 * Fold a month's facts into per-line, per-channel cost evidence. Magnitudes are
 * kept positive here; `tagTallyLines` applies the cascade's cost sign.
 */
export function accumulateTags(facts: DailyFact[]): TagTotals {
  const byLineChannel: Record<string, Partial<Record<SalesChannel, number>>> = {};
  const bySalesByLine: Record<string, number> = {};

  for (const f of facts) {
    const tag = COST_TAGS[f.source];
    if (!tag) continue;
    const amount = tag.field === 'fees' ? f.fees ?? 0 : f.spend ?? 0;
    if (!amount) continue;

    if (tag.channel === 'bySales') {
      bySalesByLine[tag.lineKey] = r2((bySalesByLine[tag.lineKey] ?? 0) + amount);
      continue;
    }
    const ch = tag.channel === 'byFact' ? toSalesChannel(f.channel) : tag.channel;
    if (!ch) continue;
    const line = (byLineChannel[tag.lineKey] ??= {});
    line[ch] = r2((line[ch] ?? 0) + amount);
  }

  return { byLineChannel, bySalesByLine };
}

/**
 * Split each Tally bucket's authoritative total into the channel slice the
 * facts support and the company-wide remainder. Returns a NEW array; the input
 * totals are never changed, so the headline cascade is untouched.
 */
export function tagTallyLines(
  tallyLines: TallyBucketLine[],
  tags: TagTotals,
  netByChannel: Partial<Record<SalesChannel, number>>,
): TallyBucketLine[] {
  // Positive net revenue is the base for the warranty pro-rata — a channel that
  // ran net-negative (returns > sales) does not carry a share of warranty cost.
  const posNet: Partial<Record<SalesChannel, number>> = {};
  let posTotal = 0;
  for (const ch of SALES_CHANNELS) {
    const v = netByChannel[ch] ?? 0;
    if (v > 0) {
      posNet[ch] = v;
      posTotal = r2(posTotal + v);
    }
  }

  return tallyLines.map((line) => {
    const perChannel = tags.byLineChannel[line.lineKey];
    const bySales = tags.bySalesByLine[line.lineKey] ?? 0;
    if (!perChannel && !bySales) return line; // no evidence → stays fully blended

    const byChannel: Partial<Record<SalesChannel, number>> = {};
    for (const ch of SALES_CHANNELS) {
      let mag = perChannel?.[ch] ?? 0;
      if (bySales && posTotal > 0 && (posNet[ch] ?? 0) > 0) {
        mag = r2(mag + bySales * ((posNet[ch] ?? 0) / posTotal));
      }
      if (mag) byChannel[ch] = r2(-mag); // cost sign, matching `total`
    }

    const attributed = Object.values(byChannel).reduce((s, v) => s + (v ?? 0), 0);
    return { ...line, byChannel, blended: r2(line.total - attributed) };
  });
}

/**
 * Name the gaps between the connector channel/SKU view and Tally's authority.
 *
 * `revenueResidue[ch]` is Tally's net revenue for the channel minus what the
 * connector SkuCells add up to — the "one recon line" that keeps the connectors
 * shown as-is while still tying the channel to Tally. `cogmVariance` is Tally's
 * COGM minus the bottoms-up estimate (BOM-costed SkuCell COGS plus the factory
 * overhead convention on net revenue); it is large exactly where the per-SKU
 * cost model and the books disagree.
 */
export function buildChannelRecon(
  netByChannel: Partial<Record<SalesChannel, number>>,
  skuCells: SkuCell[],
  cogm: number,
  netRevenue: number,
  factoryPct: number,
): ChannelRecon {
  const revByChannel: Partial<Record<SalesChannel, number>> = {};
  let skuCogs = 0;
  for (const c of skuCells) {
    revByChannel[c.ch] = r2((revByChannel[c.ch] ?? 0) + c.rev);
    skuCogs = r2(skuCogs + c.cogs);
  }

  const revenueResidue: Partial<Record<SalesChannel, number>> = {};
  for (const ch of SALES_CHANNELS) {
    const tally = netByChannel[ch] ?? 0;
    const sku = revByChannel[ch] ?? 0;
    if (tally !== 0 || sku !== 0) revenueResidue[ch] = r2(tally - sku);
  }

  const cogmVariance = r2(cogm - (skuCogs + factoryPct * netRevenue));
  return { revenueResidue, cogmVariance };
}
