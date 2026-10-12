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
  line_items?: ShopifyLineItem[];
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
    let orderCount = 0;
    let blankSku = 0;

    let pageInfo: string | null = null;
    let pages = 0;
    do {
      const url = new URL(`${base(creds)}/orders.json`);
      if (pageInfo) {
        // Cursor pages reject every filter except limit — carry only page_info.
        url.searchParams.set('page_info', pageInfo);
        url.searchParams.set('limit', '250');
      } else {
        url.searchParams.set('status', 'any');
        url.searchParams.set('created_at_min', startISO);
        url.searchParams.set('created_at_max', endISO);
        url.searchParams.set('limit', '250');
        url.searchParams.set('fields', 'id,line_items');
      }

      const res = await fetch(url, { headers: headers(creds) });
      if (!res.ok) {
        throw new Error(`Shopify orders request failed (${res.status}): ${await res.text()}`);
      }
      const body = (await res.json()) as { orders?: ShopifyOrder[] };
      const orders = body.orders ?? [];
      orderCount += orders.length;

      for (const order of orders) {
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
      }

      pageInfo = nextPageInfo(res.headers.get('link'));
      pages += 1;
    } while (pageInfo && pages < 200);

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
};

export default shopify;
