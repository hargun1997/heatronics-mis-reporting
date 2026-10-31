// ----------------------------------------------------------------------------
// Google Ads connector — daily ad spend via the Google Ads API (GAQL).
//
// Feeds Sales & Marketing and MER/ROAS. Google Ads' one friction is the
// developer token, which Google must approve; everything else is a standard
// OAuth refresh-token flow.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { monthBounds } from '../types.js';
import { type ConnectorSource } from '../schema.js';
import type { DailyFact, FactResult } from '../facts.js';

// v18 is sunset; Ops runs v25 (GOOGLE_ADS_API_VERSION overrides, same env name as Ops).
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const ADS_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

const digits = (s: string) => (s || '').replace(/[^0-9]/g, '');

// Access tokens last ~1h; cache per refresh token.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(creds: Credentials): Promise<string> {
  const clientId = (creds.clientId || '').trim();
  const clientSecret = (creds.clientSecret || '').trim();
  const refreshToken = (creds.refreshToken || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Ads needs clientId, clientSecret and refreshToken.');
  }
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Google OAuth returned no access_token.');
  tokenCache.set(refreshToken, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

async function searchStream(creds: Credentials, query: string): Promise<Record<string, unknown>[]> {
  const customerId = digits(creds.customerId || '');
  if (!customerId) throw new Error('Google Ads customerId is required (10 digits, no dashes).');
  // Optional: the Heatronics Cloud project holds API access itself (as in Ops); sent only when set.
  const devToken = (creds.developerToken || '').trim();
  const loginCustomerId = digits(creds.loginCustomerId || '');

  const token = await accessToken(creds);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (devToken) headers['developer-token'] = devToken;
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const res = await fetch(`${ADS_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Google Ads query failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  // searchStream returns an array of batches, each with a `results` array.
  const batches = (await res.json()) as { results?: Record<string, unknown>[] }[];
  return batches.flatMap((b) => b.results ?? []);
}

const googleAds: ConnectorDef = {
  id: 'googleads',
  label: 'Google Ads',
  group: 'marketing',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    { key: 'developerToken', label: 'Developer token', type: 'password', optional: true, help: 'Optional — the Heatronics Cloud project has API access (as in Ops). Shared secret google-ads-developer-token if set.' },
    { key: 'clientId', label: 'OAuth client ID', type: 'text', placeholder: '…apps.googleusercontent.com' },
    { key: 'clientSecret', label: 'OAuth client secret', type: 'password' },
    { key: 'refreshToken', label: 'Refresh token', type: 'password', help: 'From authorising the OAuth client with the adwords scope.' },
    { key: 'customerId', label: 'Customer ID', type: 'text', placeholder: '1234567890', help: '10 digits, no dashes — the account being reported.' },
    { key: 'loginCustomerId', label: 'Login customer ID', type: 'text', optional: true, help: 'The manager (MCC) account ID, if access is via one.' },
  ],
  note: 'Daily ad spend → Sales & Marketing and MER/ROAS. The developer token needs one-time Google approval; the rest is standard OAuth.',

  async test(creds: Credentials): Promise<TestResult> {
    const rows = await searchStream(creds, 'SELECT customer.id FROM customer LIMIT 1');
    return { ok: true, detail: `Connected (${rows.length} row probe).` };
  },

  async fetchFacts(creds: Credentials, fromISO: string, toISO: string): Promise<FactResult> {
    const query =
      `SELECT segments.date, metrics.cost_micros FROM customer ` +
      `WHERE segments.date BETWEEN '${fromISO}' AND '${toISO}'`;
    const rows = await searchStream(creds, query);
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const date = (r as { segments?: { date?: string } }).segments?.date ?? '';
      const costMicros = Number((r as { metrics?: { costMicros?: string } }).metrics?.costMicros ?? 0);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      byDay.set(date, (byDay.get(date) ?? 0) + costMicros / 1_000_000);
    }
    const facts: DailyFact[] = [...byDay.entries()].map(([date, spend]) => ({
      source: 'googleads',
      channel: 'Google Ads',
      date,
      revenue: 0,
      units: 0,
      orders: 0,
      fees: 0,
      spend: Math.round(spend * 100) / 100,
    }));
    const dates = facts.map((f) => f.date).sort();
    const trace = [
      `Minted OAuth access token (refresh grant)`,
      `Ran GAQL cost-by-date query for customer ${digits(creds.customerId || '')} — ${rows.length} rows`,
      `Extracted ${facts.length} daily spend facts${dates.length ? ` spanning ${dates[0]} → ${dates[dates.length - 1]}` : ''}`,
    ];
    return { facts, warnings: [], trace };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { startISO, endISO } = monthBounds(periodKey);
    const { facts, warnings } = await this.fetchFacts!(creds, startISO.slice(0, 10), endISO.slice(0, 10));
    const spend = facts.reduce((a, f) => a + (f.spend ?? 0), 0);
    const source: ConnectorSource = {
      label: `Google ad spend ${periodKey}`,
      kind: 'adSpend',
      method: 'connector',
      nodes: [],
      skuRows: [],
      bomCosts: [],
      crossChecks: [
        { label: 'Google ad spend', amount: Math.round(spend * 100) / 100, against: 'sm_total' },
      ],
      warnings,
    };
    return { sources: [source], warnings };
  },
};

export default googleAds;
