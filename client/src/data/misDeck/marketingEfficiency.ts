// Marketing efficiency for the Live MIS P&L (founder, 25 Nov 2026: the MIS shows MER and CAC only; campaign, ad set and
// creative detail (CPM, CTR, ROAS by ad) stays in Ops → D2C → Ads, so each number lives in one place).
// Pure: period columns (PeriodAgg) + new D2C buyers per month (Shopify history) → rows. No value = null, never 0.

import type { PeriodAgg } from './liveAnalytics';

/** Ad platforms of `marketingByPlatform` that pay for the website (D2C). */
export const D2C_AD_PLATFORMS = ['Google Ads', 'Meta (FB / Instagram)'] as const;

/** Where each ad line's detail lives in Ops (campaigns, ad sets, creatives, search terms). */
export const OPS_AD_LINKS: Record<string, string> = {
  'Google Ads': 'https://ops.heatronics.in/d2c/ads/google',
  'Meta (FB / Instagram)': 'https://ops.heatronics.in/d2c/ads/meta',
  'Amazon Ads': 'https://ops.heatronics.in/amazon/ads',
  'Flipkart Ads': 'https://ops.heatronics.in/flipkart/ads',
};
export const OPS_ADS_HOME = 'https://ops.heatronics.in/d2c/ads';

export interface EfficiencyCol {
  key: string;
  label: string;
  /** All marketing (Tally S&M), ₹. */
  marketing: number | null;
  /** Net revenue ÷ all marketing. */
  mer: number | null;
  /** Google + Meta spend, ₹ (live months only: published months have no split). */
  d2cAds: number | null;
  /** D2C net revenue ÷ Google + Meta spend. */
  d2cMer: number | null;
  /** First-time website buyers in the period (every member month must be known). */
  newBuyers: number | null;
  /** Google + Meta spend ÷ new website buyers, ₹. */
  cac: number | null;
}

const ratio = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null);

/** Google + Meta spend of a period; null when no member month carries the platform split. */
export function d2cAdSpend(p: PeriodAgg): number | null {
  const split = p.marketingByPlatform ?? {};
  if (!Object.keys(split).length) return null;
  return D2C_AD_PLATFORMS.reduce((t, k) => t + Math.max(0, split[k] ?? 0), 0);
}

/** New buyers summed over the period's months; null when any month is missing from the history. */
export function newBuyersOf(members: string[], byMonth: Record<string, number> | null): number | null {
  if (!byMonth || !members.length) return null;
  let t = 0;
  for (const m of members) {
    const v = byMonth[m];
    if (v == null) return null;
    t += v;
  }
  return t;
}

export function efficiencyCols(cols: PeriodAgg[], newBuyersByMonth: Record<string, number> | null): EfficiencyCol[] {
  return cols.map((p) => {
    const marketing = p.salesMarketing > 0 ? p.salesMarketing : null;
    const d2cAds = d2cAdSpend(p);
    const d2cNet = p.netByChannel.D2C ?? null;
    const newBuyers = newBuyersOf(p.members, newBuyersByMonth);
    return {
      key: p.key,
      label: p.label,
      marketing,
      mer: ratio(p.netRevenue > 0 ? p.netRevenue : null, marketing),
      d2cAds,
      d2cMer: ratio(d2cNet, d2cAds),
      newBuyers,
      cac: d2cAds != null && d2cAds > 0 ? ratio(d2cAds, newBuyers) : null,
    };
  });
}

/** Shopify history months → { 'YYYY-MM': new buyers }. The month the history was taken in is left out (part month). */
export function newBuyersMap(history: { asOf?: string; history?: { month: string; newCustomers: number }[] } | null): Record<string, number> | null {
  if (!history?.history?.length) return null;
  const cut = history.asOf ? history.asOf.slice(0, 7) : null;
  const out: Record<string, number> = {};
  for (const h of history.history) if (!cut || h.month < cut) out[h.month] = h.newCustomers;
  return out;
}
