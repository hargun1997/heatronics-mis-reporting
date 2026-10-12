// ----------------------------------------------------------------------------
// Shopify connector — D2C sales by variant, via the Admin REST API.
//
// Pulls every order placed in the month and rolls line items up per variant
// SKU, mirroring what the shopifySales file adapter produces from an export:
// SkuRow[] on the 'shopify' platform, plus a net-sales CrossCheck to hold
// against Tally's D2C line. Orders with a blank variant SKU fall back to the
// product title, exactly as the file adapter does — July had 30% of D2C
// revenue on blank-SKU rows, so this is not an edge case.
//
// Written against the documented Admin API (2024-10). Validate the first real
// pull against a known month's Shopify "Total sales" before trusting it, the
// same way the file adapters were corrected against the July exports.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { monthBounds } from '../types.js';
import { connectorProvenance, type ConnectorSource, type SkuRow } from '../schema.js';
import type { DailyFact, FactResult } from '../facts.js';

const DEFAULT_VERSION = '2024-10';

function base(creds: Credentials): string {
  const shop = (creds.shopDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!shop) throw new Error('Shopify shopDomain is required (e.g. heatronics.myshopify.com).');
  const version = (creds.apiVersion || DEFAULT_VERSION).trim();
  return `https://${shop}/admin/api/${version}`;
}

function headers(creds: Credentials): Record<string, string> {
  const token = (creds.accessToken || '').trim();
  if (!token) throw new Error('Shopify Admin API access token is required.');
  return { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
}

/** Pull the `page_info` out of a Shopify Link header's rel="next", if any. */
function nextPageInfo(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const m = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (m) {
      try {
        return new URL(m[1]).searchParams.get('page_info');
      } catch {
        return null;
      }
    }
  }
  return null;
}

interface ShopifyLineItem {
  sku?: string | null;
  title?: string | null;
  name?: string | null;
  quantity?: number;
  price?: string;
  total_discount?: string;
}
interface ShopifyOrder {
  created_at?: string;
  line_items?: ShopifyLineItem[];
}

/**
 * Page orders created in [startISO, endISO] and hand each to `onOrder`.
 * Shared by the monthly rollup (fetchPeriod) and the dated stream (fetchFacts).
 */
async function eachOrder(
  creds: Credentials,
  startISO: string,
  endISO: string,
  fields: string,
  onOrder: (o: ShopifyOrder) => void,
): Promise<{ pages: number; count: number }> {
  let pageInfo: string | null = null;
  let pages = 0;
  let count = 0;
  do {
    const url = new URL(`${base(creds)}/orders.json`);
    if (pageInfo) {
      url.searchParams.set('page_info', pageInfo);
      url.searchParams.set('limit', '250');
    } else {
      url.searchParams.set('status', 'any');
      url.searchParams.set('created_at_min', startISO);
      url.searchParams.set('created_at_max', endISO);
      url.searchParams.set('limit', '250');
      url.searchParams.set('fields', fields);
    }
    const res = await fetch(url, { headers: headers(creds) });
    if (!res.ok) throw new Error(`Shopify orders request failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { orders?: ShopifyOrder[] };
    for (const o of body.orders ?? []) {
      onOrder(o);
      count += 1;
    }
    pageInfo = nextPageInfo(res.headers.get('link'));
    pages += 1;
  } while (pageInfo && pages < 200);
  return { pages, count };
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const shopify: ConnectorDef = {
  implemented: true,
  id: 'shopify',
  label: 'Shopify (D2C)',
  group: 'd2c',
  fetchMode: 'api',
  credentialFields: [
    {
      key: 'shopDomain',
      label: 'Shop domain',
      type: 'text',
      placeholder: 'heatronics.myshopify.com',
      help: 'Your .myshopify.com domain, not the custom storefront domain.',
    },
    {
      key: 'accessToken',
      label: 'Admin API access token',
      type: 'password',
      placeholder: 'shpat_…',
      help: 'Custom app → API credentials → Admin API access token. Needs read_orders, read_products.',
    },
    {
      key: 'apiVersion',
      label: 'API version',
      type: 'text',
      placeholder: DEFAULT_VERSION,
      optional: true,
      help: `Defaults to ${DEFAULT_VERSION}.`,
    },
  ],
  note: 'Reads orders for the month and rolls them up per variant SKU. Payment-gateway fees are not in this feed — those come from Easebuzz/Shopflo.',

  async test(creds: Credentials): Promise<TestResult> {
    const res = await fetch(`${base(creds)}/shop.json`, { headers: headers(creds) });
    if (res.ok) {
      const body = (await res.json()) as { shop?: { myshopify_domain?: string } };
      return { ok: true, detail: `Connected to ${body.shop?.myshopify_domain ?? 'shop'}.` };
    }
    if (res.status === 401) return { ok: false, detail: 'Access token rejected (401).' };
    return { ok: false, detail: `Shopify returned ${res.status}.` };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { startISO, endISO } = monthBounds(periodKey);
    const warnings: string[] = [];

    // Aggregate per key: prefer variant SKU, fall back to product title.
    const agg = new Map<string, { name: string; kind: 'sku' | 'title'; revenue: number; units: number }>();
    let net = 0;
    let blankSku = 0;

    const { pages, count: orderCount } = await eachOrder(creds, startISO, endISO, 'id,line_items', (order) => {
      for (const li of order.line_items ?? []) {
        const qty = num(li.quantity);
        const gross = num(li.price) * qty - num(li.total_discount);
        net += gross;

        const sku = (li.sku ?? '').trim();
        const title = (li.title ?? li.name ?? '').trim() || '(untitled)';
        const key = sku || title;
        const kind: 'sku' | 'title' = sku ? 'sku' : 'title';
        if (!sku) blankSku += gross;

        const row = agg.get(key) ?? { name: title, kind, revenue: 0, units: 0 };
        row.revenue += gross;
        row.units += qty;
        agg.set(key, row);
      }
    });

    if (pages >= 200) warnings.push('Stopped after 200 pages of orders — the month may be truncated.');
    if (blankSku > 0) {
      warnings.push(
        `₹${Math.round(blankSku).toLocaleString('en-IN')} of D2C revenue sat on line items with no variant SKU ` +
          `and was keyed on product title instead.`,
      );
    }

    const skuRows: SkuRow[] = [...agg.entries()].map(([key, r]) => ({
      platform: 'shopify',
      key,
      keyKind: r.kind,
      name: r.name,
      revenue: Math.round(r.revenue * 100) / 100,
      units: r.units,
      fees: 0,
      provenance: connectorProvenance('shopify', 'Shopify Admin API', 'exact'),
    }));

    const source: ConnectorSource = {
      label: `Shopify orders ${periodKey}`,
      kind: 'shopifySales',
      method: 'connector',
      nodes: [],
      skuRows,
      bomCosts: [],
      crossChecks: [
        {
          label: 'Shopify net sales (line items − discounts)',
          amount: Math.round(net * 100) / 100,
          against: 'rev_d2c',
          note: `${orderCount} orders across ${pages} page(s).`,
        },
      ],
      warnings,
    };

    return { sources: [source], warnings };
  },

  async fetchFacts(creds: Credentials, fromISO: string, toISO: string): Promise<FactResult> {
    const startISO = `${fromISO}T00:00:00Z`;
    const endISO = `${toISO}T23:59:59Z`;
    const warnings: string[] = [];

    // One fact per (day, sku). Orders are counted once on their own day even
    // though they fan out into several line-item facts.
    const byDaySku = new Map<string, DailyFact>();
    const orderDays = new Map<string, Set<string>>(); // day -> order ids, to count orders

    const { pages } = await eachOrder(creds, startISO, endISO, 'id,created_at,line_items', (order) => {
      const day = (order.created_at ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      const oid = String((order as { id?: unknown }).id ?? Math.random());
      (orderDays.get(day) ?? orderDays.set(day, new Set()).get(day)!).add(oid);

      for (const li of order.line_items ?? []) {
        const qty = num(li.quantity);
        const gross = num(li.price) * qty - num(li.total_discount);
        const sku = (li.sku ?? '').trim();
        const title = (li.title ?? li.name ?? '').trim() || '(untitled)';
        const key = sku || title;
        const id = `${day}||${key}`;
        let fact = byDaySku.get(id);
        if (!fact) {
          fact = {
            source: 'shopify',
            channel: 'D2C',
            date: day,
            sku: key,
            skuName: title,
            skuKind: sku ? 'sku' : 'title',
            revenue: 0,
            units: 0,
            orders: 0,
            fees: 0,
          };
          byDaySku.set(id, fact);
        }
        fact.revenue = Math.round((fact.revenue + gross) * 100) / 100;
        fact.units += qty;
      }
    });

    // Attribute each day's order count to that day's largest-revenue fact, so
    // order totals are right per period without double counting across SKUs.
    for (const [day, ids] of orderDays) {
      const dayFacts = [...byDaySku.values()].filter((f) => f.date === day);
      const top = dayFacts.sort((a, b) => b.revenue - a.revenue)[0];
      if (top) top.orders = ids.size;
    }

    if (pages >= 200) warnings.push('Stopped after 200 pages of orders — the range may be truncated.');

    return { facts: [...byDaySku.values()], warnings };
  },
};

export default shopify;
