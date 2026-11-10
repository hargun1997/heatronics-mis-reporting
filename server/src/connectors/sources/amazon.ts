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

/** GET — every SP-API read the MIS makes (Sales, Finances, report status / documents). */
export async function spapiGet(creds: Credentials, path: string, retries = 0): Promise<unknown> {
  for (let i = 0; ; i++) {
    const token = await lwaToken(creds);
    const res = await fetch(`${host(creds)}${path}`, { headers: { 'x-amz-access-token': token } });
    if ((res.status === 429 || res.status >= 500) && i < retries) {
      const ra = Number(res.headers.get('retry-after'));
      await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : 2000 * 2 ** i));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Amazon SP-API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }
}

/** The ONE SP-API write the MIS makes: requesting a report (createReport). Nothing else is ever POSTed. */
const CREATE_REPORT_PATH = '/reports/2021-06-30/reports';
export function assertSpapiPostAllowed(path: string): void {
  if (path !== CREATE_REPORT_PATH) throw new Error(`Blocked: SP-API POST ${path} — the MIS only requests reports.`);
}

/** POST createReport (one call; used for the Business Report slot once a month). */
export async function spapiCreateReport(creds: Credentials, body: Record<string, unknown>): Promise<string> {
  assertSpapiPostAllowed(CREATE_REPORT_PATH);
  const token = await lwaToken(creds);
  const res = await fetch(`${host(creds)}${CREATE_REPORT_PATH}`, {
    method: 'POST',
    headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, marketplaceIds: [marketplace(creds)] }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Amazon createReport ${res.status}: ${text.slice(0, 300)}`);
  const id = (JSON.parse(text) as { reportId?: string }).reportId;
  if (!id) throw new Error('Amazon createReport returned no reportId.');
  return id;
}

/** Download a report document (presigned S3 URL from getReportDocument), gunzipped when Amazon compressed it. */
export async function downloadReportDocument(doc: { url?: string; compressionAlgorithm?: string }): Promise<string> {
  if (!doc.url || !/^https:\/\/[^/]+\.amazonaws\.com\//.test(doc.url)) throw new Error('Amazon report document has no download URL.');
  const res = await fetch(doc.url);
  if (!res.ok) throw new Error(`Amazon report download ${res.status}.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (doc.compressionAlgorithm === 'GZIP') {
    const { gunzipSync } = await import('node:zlib');
    return gunzipSync(buf).toString('utf8');
  }
  return buf.toString('utf8');
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

// ---- Sales API windows -------------------------------------------------------
// One orderMetrics call may not span more than 821 days ("Metrics Interval … (821D) exceeded", seen live Nov 2026), and
// Amazon keeps about two years of daily sales. A long range (a back-filled old month makes Live MIS ask from that month
// to today) is therefore asked in windows of ≤ 365 days, never older than SALES_MAX_AGE_DAYS; days Amazon no longer
// keeps are left out with a note — they must never fail the whole source (that blanked every Amazon live month).
export const SALES_WINDOW_DAYS = 365;
export const SALES_MAX_AGE_DAYS = 820;

const addDays = (dateISO: string, n: number) => {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const istToday = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** [from, to] cut into windows Amazon accepts. `skipped` = the days too old to ask (null when none). */
export function salesWindows(fromISO: string, toISO: string, todayISO: string): { windows: { from: string; to: string }[]; skipped: { from: string; to: string } | null } {
  const oldest = addDays(todayISO, -SALES_MAX_AGE_DAYS);
  const end = toISO > todayISO ? todayISO : toISO;
  let skipped: { from: string; to: string } | null = null;
  let from = fromISO;
  if (from < oldest) {
    skipped = { from, to: end < oldest ? end : addDays(oldest, -1) };
    from = oldest;
  }
  const windows: { from: string; to: string }[] = [];
  while (from <= end) {
    const last = addDays(from, SALES_WINDOW_DAYS - 1);
    const to = last > end ? end : last;
    windows.push({ from, to });
    from = addDays(to, 1);
  }
  return { windows, skipped };
}

/** Daily ordered sales for [from, to], one orderMetrics call per window. `get` = spapiGet with the creds bound (tests inject it). */
export async function orderMetricsFacts(
  get: (path: string) => Promise<unknown>, mp: string, fromISO: string, toISO: string, now = Date.now(),
): Promise<FactResult> {
  const today = istToday(now);
  const { windows, skipped } = salesWindows(fromISO, toISO, today);
  const warnings: string[] = [];
  if (skipped) warnings.push(`Amazon keeps about 2 years of daily sales: ${skipped.from} to ${skipped.to} not asked.`);
  const facts: DailyFact[] = [];
  const seen = new Set<string>();
  let calls = 0;
  for (const w of windows) {
    const q = new URLSearchParams({
      marketplaceIds: mp,
      interval: `${w.from}T00:00:00${IST_OFFSET}--${nextDay(w.to)}T00:00:00${IST_OFFSET}`,
      granularity: 'Day',
      granularityTimeZone: TZ,
    });
    let body: { payload?: OrderMetric[] };
    try {
      body = (await get(`/sales/v1/orderMetrics?${q.toString()}`)) as { payload?: OrderMetric[] };
      calls++;
    } catch (e) {
      // A window Amazon refuses because it is too old (400) is left out; anything else (login, limit, outage) is a real error.
      const msg = e instanceof Error ? e.message : String(e);
      const old = w.from < addDays(today, -700);
      if (old && / 400\b|interval/i.test(msg) && windows.length > 1) {
        warnings.push(`Amazon would not give ${w.from} to ${w.to} (older than it keeps): left out.`);
        continue;
      }
      throw e;
    }
    for (const m of body.payload ?? []) {
      const date = String(m.interval ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
      seen.add(date);
      facts.push({
        source: 'amazon',
        channel: 'Amazon',
        date,
        revenue: r2(num(m.totalSales?.amount)),
        // Sales API "total sales" is the customer-paid amount (GST inclusive); it carries no tax split.
        gmv: r2(num(m.totalSales?.amount)),
        units: m.unitCount ?? 0,
        orders: m.orderCount ?? 0,
        fees: 0,
      } as DailyFact);
    }
  }
  const dates = facts.map((f) => f.date).sort();
  const trace = [
    `Minted LWA access token`,
    `Called Sales API orderMetrics (marketplace ${mp}, daily) ${fromISO}→${toISO}${windows.length > 1 ? ` in ${calls} calls of ≤ ${SALES_WINDOW_DAYS} days` : ''}`,
    `Extracted ${facts.length} daily sales facts${dates.length ? ` spanning ${dates[0]} → ${dates[dates.length - 1]}` : ''}`,
  ];
  return { facts, warnings, trace };
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
    return orderMetricsFacts((path) => spapiGet(creds, path), marketplace(creds), fromISO, toISO);
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
