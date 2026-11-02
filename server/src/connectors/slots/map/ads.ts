// ----------------------------------------------------------------------------
// Ad-platform API answers → the facts the ad-report uploads give. Pure; the
// conventions are the client parsers' (uploadParsers.ts):
//   Amazon Ads  parseAmazonAdvertisedProduct  source 'amazonads', channel 'Amazon', dated YYYY-MM-01,
//               per base SKU (SP advertised product) + one channel-level fact (SB + SD, no SKU)
//   Meta        parseMetaAds                  source 'meta', channel 'D2C', dated YYYY-MM-01, per
//               catalog product id + one residual fact (account total − product rows)
//   Google      parseGoogleAdsCampaigns       source 'googleads', channel 'D2C', one total fact at the range end
//               parseGoogleAdsProducts        source 'googleadsproducts', per Shopify variant id (item id's last part)
// ----------------------------------------------------------------------------

import type { DailyFact } from '../../facts.js';
import type { SlotPull } from '../types.js';
import { amazonBaseSku, inr, num, r2, str } from './common.js';

// ---- Amazon Ads: spAdvertisedProduct (+ SB / SD totals) ----------------------

/** spAdvertisedProduct report row (reporting v3, GZIP_JSON). */
export interface AdvertisedProductRow { advertisedSku?: string; advertisedAsin?: string; cost?: number | string; date?: string }

export function amazonAdsProductFacts(
  spRows: AdvertisedProductRow[],
  channelSpend: { SB: number; SD: number },
  periodKey: string,
): SlotPull {
  const date = `${periodKey}-01`;
  const bySku = new Map<string, number>();
  let noSku = 0;
  for (const r of spRows) {
    const cost = num(r.cost);
    if (cost === 0) continue;
    const raw = str(r.advertisedSku);
    if (!raw) { noSku += cost; continue; }
    const { base } = amazonBaseSku(raw);
    bySku.set(base, (bySku.get(base) ?? 0) + cost);
  }
  const facts: DailyFact[] = [];
  for (const [base, spend] of bySku) {
    if (r2(spend) === 0) continue;
    facts.push({ source: 'amazonads', channel: 'Amazon', date, sku: base, skuName: base, skuKind: 'sku', revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(spend) });
  }
  const channel = r2(channelSpend.SB + channelSpend.SD + noSku);
  if (channel !== 0) facts.push({ source: 'amazonads', channel: 'Amazon', date, revenue: 0, units: 0, orders: 0, fees: 0, spend: channel });
  const total = r2(facts.reduce((s, f) => s + (f.spend ?? 0), 0));
  return {
    facts,
    rowCount: spRows.length,
    trace: [
      `${spRows.length} Sponsored Products advertised-product row(s) → ${bySku.size} per-SKU facts`,
      `Sponsored Brands ${inr(channelSpend.SB)} + Display ${inr(channelSpend.SD)}${noSku ? ` + SP rows without a SKU ${inr(noSku)}` : ''} stay channel-level`,
      `Total Amazon ad spend ${inr(total)} for ${periodKey}`,
    ],
    warnings: [],
    emptyOk: facts.length === 0,
  };
}

// ---- Meta: ad-level insights with the product_id breakdown -------------------

/** Meta "Product ID" value "48268188418262, Neck Heating Pad" → { id, name } (parser metaProduct). */
export function metaProduct(raw: string): { id: string; name: string } {
  const m = raw.match(/^(\d+)\s*,\s*(.+)$/);
  return m ? { id: m[1], name: m[2].trim() } : { id: raw, name: raw };
}

/** One insights row of `level=ad&breakdowns=product_id`. */
export interface MetaProductRow { product_id?: string; spend?: string | number }

/**
 * `accountSpend` is the account's true total for the month (level=account), the
 * export's grand-total row. Product rows sum to less (Meta drops spend it can't
 * tie to a product); the gap becomes one residual fact, exactly as the parser does.
 */
export function metaProductFacts(rows: MetaProductRow[], accountSpend: number | null, periodKey: string): SlotPull {
  const date = `${periodKey}-01`;
  const bySku = new Map<string, { name: string; spend: number }>();
  let leaf = 0;
  let leafRows = 0;
  for (const r of rows) {
    const raw = str(r.product_id);
    const spend = num(r.spend);
    if (!raw || raw === 'unknown' || spend === 0) continue;
    const { id, name } = metaProduct(raw);
    const e = bySku.get(id) ?? { name, spend: 0 };
    e.spend += spend; e.name = name;
    bySku.set(id, e);
    leaf += spend; leafRows += 1;
  }
  const facts: DailyFact[] = [];
  for (const [id, { name, spend }] of bySku) {
    if (r2(spend) === 0) continue;
    facts.push({ source: 'meta', channel: 'D2C', date, sku: id, skuName: name, skuKind: 'sku', revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(spend) });
  }
  const residual = accountSpend != null ? r2(accountSpend - leaf) : 0;
  if (residual > 0) facts.push({ source: 'meta', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: 0, spend: residual });
  const total = r2(facts.reduce((s, f) => s + (f.spend ?? 0), 0));
  return {
    facts,
    rowCount: rows.length,
    trace: [
      `${leafRows} ad × product row(s) → ${bySku.size} products, ${inr(leaf)} attributed`,
      accountSpend != null
        ? `Account total ${inr(accountSpend)} → residual ${inr(residual)} unattributed (spread across D2C products by revenue)`
        : 'No account total — total is the sum of product rows',
      `Total Meta ad spend ${inr(total)}`,
    ],
    warnings: accountSpend != null && residual < 0 ? [`Product rows (${inr(leaf)}) exceed the account total (${inr(accountSpend)}) — check the month.`] : [],
    emptyOk: facts.length === 0,
  };
}

// ---- Google Ads: campaign total + shopping products -------------------------

/** searchStream row (REST JSON, camelCase). */
export interface GadsRow { metrics?: { costMicros?: string | number }; segments?: { productItemId?: string; productTitle?: string }; campaign?: { name?: string } }

const cost = (r: GadsRow) => num(r.metrics?.costMicros) / 1_000_000;

export function googleCampaignFacts(rows: GadsRow[], date: string): SlotPull {
  const total = r2(rows.reduce((s, r) => s + cost(r), 0));
  const campaigns = new Set(rows.filter((r) => cost(r) > 0).map((r) => r.campaign?.name ?? '')).size;
  const facts: DailyFact[] = total > 0
    ? [{ source: 'googleads', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: 0, spend: total }]
    : [];
  return {
    facts,
    rowCount: rows.length,
    trace: [
      `GAQL campaign report: ${rows.length} row(s), ${campaigns} campaign(s) with spend`,
      `Total Google ad spend ${inr(total)}, dated ${date} → D2C Sales & Marketing (spread across D2C products by revenue)`,
    ],
    warnings: [],
    emptyOk: total === 0,
  };
}

/** Merchant item id "shopify_in_9355519066326_48268187533526" → the Shopify variant id (last part). */
export const googleItemVariant = (itemId: string) => {
  const parts = itemId.split('_');
  return parts[parts.length - 1] || itemId;
};

export function googleProductFacts(rows: GadsRow[], date: string): SlotPull {
  const bySku = new Map<string, { name: string; spend: number }>();
  for (const r of rows) {
    const item = str(r.segments?.productItemId);
    const c = cost(r);
    if (!item || item === '--' || c <= 0) continue;
    const v = googleItemVariant(item);
    const e = bySku.get(v) ?? { name: str(r.segments?.productTitle) || item, spend: 0 };
    e.spend += c;
    bySku.set(v, e);
  }
  const facts: DailyFact[] = [...bySku.entries()].map(([variant, { name, spend }]) => ({
    source: 'googleadsproducts', channel: 'D2C', date, sku: variant, skuName: name, skuKind: 'sku',
    revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(spend),
  }));
  const total = r2(facts.reduce((s, f) => s + (f.spend ?? 0), 0));
  return {
    facts,
    rowCount: rows.length,
    trace: [`${facts.length} products with spend → ${inr(total)} measured per-product (Shopping / PMax), dated ${date}`],
    warnings: [],
    emptyOk: facts.length === 0,
  };
}
