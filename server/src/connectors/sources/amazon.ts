// ----------------------------------------------------------------------------
// Amazon Seller connector — daily sales via SP-API Sales (orderMetrics).
//
// orderMetrics returns aggregated ordered sales / units / orders per day for a
// marketplace in one call, which is exactly the run-rate shape — far cheaper
// than paging every order. Fees and the per-SKU settlement come from the
// finance/settlement report (async, a follow-up); here fetchPeriod holds the
// gross ordered sales against Tally's Ecommerce line.
//
// Auth is LWA only (x-amz-access-token) — current SP-API does not require AWS
// SigV4 for non-restricted operations like orderMetrics.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { monthBounds } from '../types.js';
import { type ConnectorSource } from '../schema.js';
import type { DailyFact, FactResult } from '../facts.js';

const SPAPI_HOSTS: Record<string, string> = {
  na: 'https://sellingpartnerapi-na.amazon.com',
  eu: 'https://sellingpartnerapi-eu.amazon.com',
  fe: 'https://sellingpartnerapi-fe.amazon.com',
};
const DEFAULT_MARKETPLACE = 'A21TJRUUN4KGV'; // Amazon.in
const IST_OFFSET = '+05:30';
const TZ = 'Asia/Kolkata';

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

function host(creds: Credentials): string {
  return SPAPI_HOSTS[(creds.region || 'eu').trim().toLowerCase()] ?? SPAPI_HOSTS.eu;
}
function marketplace(creds: Credentials): string {
  return (creds.marketplaceId || DEFAULT_MARKETPLACE).trim();
}

// LWA access tokens last ~1h; cache per refresh token.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function lwaToken(creds: Credentials): Promise<string> {
  const clientId = (creds.lwaClientId || '').trim();
  const clientSecret = (creds.lwaClientSecret || '').trim();
  const refreshToken = (creds.refreshToken || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Amazon needs lwaClientId, lwaClientSecret and refreshToken.');
  }
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Amazon LWA failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Amazon LWA returned no access_token.');
  tokenCache.set(refreshToken, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

async function spapiGet(creds: Credentials, path: string): Promise<unknown> {
  const token = await lwaToken(creds);
  const res = await fetch(`${host(creds)}${path}`, { headers: { 'x-amz-access-token': token } });
  if (!res.ok) {
    throw new Error(`Amazon SP-API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/** Day after an ISO date (orderMetrics interval end is exclusive). */
function nextDay(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface OrderMetric {
  interval?: string;
  unitCount?: number;
  orderItemCount?: number;
  orderCount?: number;
  totalSales?: { amount?: string | number; currencyCode?: string };
}

const amazon: ConnectorDef = {
  id: 'amazon',
  label: 'Amazon Seller Central',
  group: 'marketplace',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    { key: 'lwaClientId', label: 'LWA client ID', type: 'text', placeholder: 'amzn1.application-oa2-client.…', help: 'Login with Amazon client ID from the SP-API app.' },
    { key: 'lwaClientSecret', label: 'LWA client secret', type: 'password' },
    { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: 'Atzr|…', help: 'From authorising the SP-API app on the seller account.' },
    { key: 'marketplaceId', label: 'Marketplace ID', type: 'text', placeholder: DEFAULT_MARKETPLACE, optional: true, help: 'India = A21TJRUUN4KGV.' },
    { key: 'region', label: 'Region endpoint', type: 'text', placeholder: 'eu', optional: true, help: 'na / eu / fe. India = eu.' },
  ],
  note: 'Daily ordered sales / units / orders via SP-API Sales (orderMetrics). App needs the role covering Sales/Orders. Fees & per-SKU settlement (async reports) are the next step.',

  async test(creds: Credentials): Promise<TestResult> {
    await spapiGet(creds, '/sellers/v1/marketplaceParticipations');
    return { ok: true, detail: 'Connected to SP-API.' };
  },

  async fetchFacts(creds: Credentials, fromISO: string, toISO: string): Promise<FactResult> {
    const mp = marketplace(creds);
    const interval = `${fromISO}T00:00:00${IST_OFFSET}--${nextDay(toISO)}T00:00:00${IST_OFFSET}`;
    const q = new URLSearchParams({
      marketplaceIds: mp,
      interval,
      granularity: 'Day',
      granularityTimeZone: TZ,
    });
    const body = (await spapiGet(creds, `/sales/v1/orderMetrics?${q.toString()}`)) as { payload?: OrderMetric[] };
    const facts: DailyFact[] = (body.payload ?? [])
      .map((m) => {
        const date = String(m.interval ?? '').slice(0, 10);
        return {
          source: 'amazon',
          channel: 'Amazon',
          date,
          revenue: r2(num(m.totalSales?.amount)),
          units: m.unitCount ?? 0,
          orders: m.orderCount ?? 0,
          fees: 0,
        } as DailyFact;
      })
      .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date));

    const dates = facts.map((f) => f.date).sort();
    const trace = [
      `Minted LWA access token`,
      `Called Sales API orderMetrics (marketplace ${mp}, daily) ${fromISO}→${toISO}`,
      `Extracted ${facts.length} daily sales facts${dates.length ? ` spanning ${dates[0]} → ${dates[dates.length - 1]}` : ''}`,
    ];
    return { facts, warnings: [], trace };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { startISO, endISO } = monthBounds(periodKey);
    const { facts, warnings } = await this.fetchFacts!(creds, startISO.slice(0, 10), endISO.slice(0, 10));
    const revenue = facts.reduce((a, f) => a + f.revenue, 0);
    const source: ConnectorSource = {
      label: `Amazon sales ${periodKey}`,
      kind: 'amazonSales',
      method: 'connector',
      nodes: [],
      skuRows: [],
      bomCosts: [],
      crossChecks: [
        {
          label: 'Amazon ordered product sales (orderMetrics)',
          amount: r2(revenue),
          against: 'rev_amazon',
          note: 'Gross ordered sales from the Sales API. Fees come from the settlement report — not included here.',
        },
      ],
      warnings,
    };
    return { sources: [source], warnings };
  },
};

export default amazon;
