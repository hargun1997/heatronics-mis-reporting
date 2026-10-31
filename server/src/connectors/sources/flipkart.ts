// ----------------------------------------------------------------------------
// Flipkart connector — Marketplace Seller API (self-access app), orders by day.
//
// Same app and secrets as Ops (flipkart-app-id / flipkart-app-secret, see
// sharedSecrets.ts) and the same calls as Ops' lib/server/flipkart.ts +
// lib/flipkart/{api,core}.ts:
//   token  GET  https://api.flipkart.net/oauth-service/oauth/token?grant_type=client_credentials&scope=Seller_Api
//          (Basic appId:appSecret, ~60-day token, cached per instance, renewed 1 day early or on a 401)
//   orders POST /sellers/v3/shipments/filter  (+ GET nextPageUrl), 15-day order-date windows
//
// READ ONLY. assertReadOnly() runs before every request: the token call, the
// filter search and its next-page GETs only — never dispatch, labels, cancel,
// returns actions, listing / price / stock updates.
//
// Buyer data is dropped at the boundary: only ids, SKU, quantity, status, order
// date and the price components are kept. Revenue per line = customerPrice,
// else sellingPrice (Ops' rule; Flipkart's docs don't say line vs unit).
// Flipkart commission / fees are not in this API → fees stay 0 (warned).
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { monthBounds } from '../types.js';
import { connectorProvenance, type ConnectorSource, type SkuRow } from '../schema.js';
import type { DailyFact, FactResult } from '../facts.js';

const HOST = 'api.flipkart.net';
const BASE = `https://${HOST}`;
const TOKEN_URL = `${BASE}/oauth-service/oauth/token?grant_type=client_credentials&scope=Seller_Api`;
const WINDOW_DAYS = 15;
const PAGE_SIZE = 20; // Flipkart: 1–20
const MAX_PER_FILTER = 5000; // Flipkart: maxDataRetrievalAllowed
// Kept short: the Live MIS page waits on this. Finished windows are cached, so each pull goes further.
const PULL_BUDGET_MS = Number(process.env.FLIPKART_PULL_MS) || 20_000;

const POST_DISPATCH = ['SHIPPED', 'DELIVERED', 'PICKUP_COMPLETE'];
const PRE_DISPATCH = ['APPROVED', 'PACKING_IN_PROGRESS', 'PACKED', 'FORM_FAILED', 'READY_TO_DISPATCH'];
interface FilterSpec { type: 'preDispatch' | 'postDispatch'; states: string[]; shipmentTypes?: string[]; label: string }
// Sales only: cancelled orders are not revenue, so the three cancellation searches Ops runs are skipped.
const FILTERS: FilterSpec[] = [
  { type: 'postDispatch', states: POST_DISPATCH, shipmentTypes: ['NORMAL'], label: 'dispatched (Flipkart logistics)' },
  { type: 'postDispatch', states: POST_DISPATCH, shipmentTypes: ['SELF'], label: 'dispatched (self-ship)' },
  { type: 'preDispatch', states: PRE_DISPATCH, label: 'pre-dispatch' },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const istDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(0, 10);

// ---- read-only guard --------------------------------------------------------

function assertReadOnly(method: string, url: string): void {
  const u = new URL(url);
  if (u.host !== HOST) throw new Error(`Blocked: Flipkart call to another host (${u.host}).`);
  const p = u.pathname;
  if (method === 'GET' && (p === '/oauth-service/oauth/token' || p === '/sellers/v3/shipments/filter' || p.startsWith('/sellers/v3/shipments/filter/'))) return;
  if (method === 'POST' && p === '/sellers/v3/shipments/filter') return;
  throw new Error(`Blocked: Flipkart ${method} ${p} is not an allowed read-only call.`);
}

// ---- auth + request ---------------------------------------------------------

const tokenCache = new Map<string, { token: string; exp: number }>();

async function accessToken(creds: Credentials, force = false): Promise<string> {
  const id = (creds.appId || '').trim();
  const secret = (creds.appSecret || '').trim();
  if (!id || !secret) {
    throw new Error('Flipkart needs the Seller API Application ID and secret (shared secrets flipkart-app-id / flipkart-app-secret).');
  }
  const hit = tokenCache.get(id);
  if (!force && hit && Date.now() < hit.exp - 24 * 3_600_000) return hit.token;
  assertReadOnly('GET', TOKEN_URL);
  const res = await fetch(TOKEN_URL, {
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, Accept: 'application/json' },
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) {
    throw new Error(`Flipkart login failed (${res.status}${j.error_description || j.error ? `: ${j.error_description || j.error}` : ''}).`);
  }
  tokenCache.set(id, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 30 * 86_400) * 1000 });
  return j.access_token;
}

async function fkRequest<T>(creds: Credentials, path: string, opts: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = /^https:\/\//i.test(path) ? path : `${BASE}${path}`;
  assertReadOnly(method, url);
  let refreshed = false;
  for (let i = 0; ; i++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken(creds)}`,
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && !refreshed) { refreshed = true; await accessToken(creds, true); continue; }
    if ((res.status === 429 || res.status >= 500) && i < 3) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : 2000 * 2 ** i);
      continue;
    }
    const text = await res.text();
    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { message: text.slice(0, 300) }; }
    if (!res.ok) {
      const e0 = Array.isArray(j?.errors) ? j.errors[0] : null;
      const msg = j?.message || e0?.message || e0?.description || j?.error_description || j?.error || '';
      throw new Error(`Flipkart ${res.status} on ${method} ${new URL(url).pathname}${msg ? `: ${String(msg).slice(0, 300)}` : ''}`);
    }
    return j as T;
  }
}

/** Flipkart's next-page links are relative to /sellers. */
function sellersPath(next: string): string {
  if (/^https:\/\//i.test(next)) return next;
  if (next.startsWith('/sellers/')) return next;
  return `/sellers${next.startsWith('/') ? '' : '/'}${next}`;
}

// ---- orders -----------------------------------------------------------------

interface Item {
  orderItemId: string; sku: string | null; quantity: number; status: string; day: string | null; updatedAt: string; revenue: number;
}

function mapItems(s: any): Item[] {
  const updatedAt = String(s?.updatedAt ?? '');
  return (Array.isArray(s?.orderItems) ? s.orderItems : []).flatMap((i: any): Item[] => {
    const orderItemId = str(i?.orderItemId);
    if (!orderItemId) return [];
    const pc = i.priceComponents && typeof i.priceComponents === 'object' ? i.priceComponents : {};
    const orderDate = str(i.orderDate);
    const t = orderDate ? Date.parse(orderDate) : NaN;
    return [{
      orderItemId,
      sku: str(i.sku),
      quantity: Math.max(0, Number(i.quantity) || 0),
      status: str(i.status) ?? '',
      day: Number.isFinite(t) ? istDay(new Date(t).toISOString()) : null,
      updatedAt,
      revenue: numOrNull(pc.customerPrice) ?? numOrNull(pc.sellingPrice) ?? 0,
    }];
  });
}

function windows(fromISO: string, toISO: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let s = Date.parse(`${fromISO}T00:00:00Z`);
  const last = Date.parse(`${toISO}T00:00:00Z`);
  while (s <= last) {
    const e = Math.min(last, s + (WINDOW_DAYS - 1) * 86_400_000);
    out.push({ start: new Date(s).toISOString().slice(0, 10), end: new Date(e).toISOString().slice(0, 10) });
    s = e + 86_400_000;
  }
  return out;
}

async function filterSearch(creds: Credentials, f: FilterSpec, w: { start: string; end: string }, deadline: number): Promise<Item[]> {
  const filter: Record<string, unknown> = {
    type: f.type,
    states: f.states,
    orderDate: { from: `${w.start}T00:00:00+05:30`, to: `${w.end}T23:59:59+05:30` },
  };
  if (f.shipmentTypes) filter.shipmentTypes = f.shipmentTypes;
  const items: Item[] = [];
  let shipments = 0;
  let j: any = await fkRequest(creds, '/sellers/v3/shipments/filter', { method: 'POST', body: { filter, pagination: { pageSize: PAGE_SIZE } } });
  for (let page = 0; ; page++) {
    for (const s of Array.isArray(j?.shipments) ? j.shipments : []) { shipments++; items.push(...mapItems(s)); }
    if (shipments >= MAX_PER_FILTER) throw new Error(`Flipkart caps a search at ${MAX_PER_FILTER} shipments; ${w.start}…${w.end} (${f.label}) has more.`);
    if (!j?.hasMore || !j?.nextPageUrl || page > 300) break;
    if (Date.now() > deadline) throw new Error('out of time');
    j = await fkRequest(creds, sellersPath(String(j.nextPageUrl)));
  }
  return items;
}

/** Cache of finished windows (15 min) so a page reload doesn't re-read Flipkart. */
const done = new Map<string, { items: Item[]; at: number }>();

async function pull(creds: Credentials, fromISO: string, toISO: string): Promise<{ items: Item[]; warnings: string[]; trace: string[] }> {
  const warnings: string[] = [];
  const trace: string[] = [];
  const deadline = Date.now() + PULL_BUDGET_MS;
  const all: Item[] = [];
  const wins = windows(fromISO, toISO).reverse(); // newest first, so a short budget fills the latest dates
  let calls = 0;
  let cached = 0;
  let firstError: Error | null = null;
  // Fail loudly when the app can't log in at all, instead of reporting "ok" with no rows.
  await accessToken(creds);
  for (const w of wins) {
    for (const f of FILTERS) {
      const k = `${(creds.appId || '').trim()}|${f.label}|${w.start}|${w.end}`;
      const hit = done.get(k);
      if (hit && Date.now() - hit.at < 15 * 60_000) { all.push(...hit.items); cached++; continue; }
      if (Date.now() > deadline) {
        warnings.push(`Flipkart: ran out of time before ${w.start}…${w.end} (${f.label}) — pull again to finish (done windows are cached).`);
        continue;
      }
      try {
        const items = await filterSearch(creds, f, w, deadline);
        calls++;
        done.set(k, { items, at: Date.now() });
        all.push(...items);
      } catch (e) {
        firstError ??= e instanceof Error ? e : new Error(String(e));
        warnings.push(`Flipkart ${f.label} ${w.start}…${w.end}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
  }
  // Nothing read at all and something failed → the source is down, not empty.
  if (calls === 0 && cached === 0 && firstError) throw firstError;
  // One row per order item; the most recently updated copy wins (an item can move between searches).
  const by = new Map<string, Item>();
  for (const i of all) { const c = by.get(i.orderItemId); if (!c || i.updatedAt >= c.updatedAt) by.set(i.orderItemId, i); }
  const items = [...by.values()].filter((i) => !/^CANCELL?ED$/i.test(i.status) && i.day && i.day >= fromISO && i.day <= toISO);
  trace.push(`Authenticated to Flipkart Seller API`);
  trace.push(`${wins.length} window(s) × ${FILTERS.length} searches (${calls} live, rest cached)`);
  trace.push(`Kept ${items.length} order line(s) (cancelled excluded)`);
  warnings.push('Flipkart commission and fees are not in the Seller API — fees show as 0; take them from the settlement upload.');
  return { items, warnings, trace };
}

// ---- connector ----------------------------------------------------------------

const flipkart: ConnectorDef = {
  id: 'flipkart',
  label: 'Flipkart',
  group: 'marketplace',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    { key: 'appId', label: 'Application ID', type: 'text', help: 'Seller Hub → Manage Profile → Developer Access. Filled from the shared flipkart-app-id secret when blank.' },
    { key: 'appSecret', label: 'Application secret', type: 'password' },
  ],
  note: 'Flipkart Seller API, read only. Orders per SKU per day (dispatched + awaiting dispatch, cancelled excluded) → Flipkart revenue and units. Commission / fees still come from the settlement file.',

  async test(creds: Credentials): Promise<TestResult> {
    await accessToken(creds, true);
    const today = istDay(new Date().toISOString());
    const items = await filterSearch(creds, FILTERS[2], { start: today, end: today }, Date.now() + 20_000);
    return { ok: true, detail: `Connected — ${items.length} order line(s) awaiting dispatch from today.` };
  },

  async fetchFacts(creds: Credentials, fromISO: string, toISO: string): Promise<FactResult> {
    const { items, warnings, trace } = await pull(creds, fromISO, toISO);
    const by = new Map<string, DailyFact>();
    for (const i of items) {
      const sku = i.sku ?? 'unknown';
      const k = `${i.day}|${sku}`;
      const f = by.get(k) ?? { source: 'flipkart', channel: 'Flipkart', date: i.day!, sku, skuKind: 'sku' as const, revenue: 0, units: 0, orders: 0, fees: 0 };
      f.revenue += i.revenue;
      f.units += i.quantity;
      f.orders += 1;
      by.set(k, f);
    }
    const facts = [...by.values()].map((f) => ({ ...f, revenue: r2(f.revenue) })).sort((a, b) => a.date.localeCompare(b.date));
    return { facts, warnings, trace };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { startISO, endISO } = monthBounds(periodKey);
    const { items, warnings } = await pull(creds, startISO.slice(0, 10), endISO.slice(0, 10));
    const prov = connectorProvenance('flipkart', 'Flipkart Seller API', 'read', 'Order value per line; Flipkart fees not included.');
    const bySku = new Map<string, SkuRow>();
    for (const i of items) {
      const key = i.sku ?? 'unknown';
      const row = bySku.get(key) ?? { platform: 'flipkart' as const, key, keyKind: 'sku' as const, revenue: 0, units: 0, fees: 0, provenance: prov };
      row.revenue += i.revenue;
      row.units += i.quantity;
      bySku.set(key, row);
    }
    const skuRows = [...bySku.values()].map((r) => ({ ...r, revenue: r2(r.revenue) }));
    const total = r2(skuRows.reduce((a, r) => a + r.revenue, 0));
    const source: ConnectorSource = {
      label: `Flipkart orders ${periodKey}`,
      kind: 'channelRevenue',
      method: 'connector',
      nodes: [],
      skuRows,
      bomCosts: [],
      crossChecks: [{ label: 'Flipkart order value (gross, before returns)', amount: total, note: 'Holds against Flipkart sales booked in Tally; returns and fees reconcile from the settlement.' }],
      warnings,
    };
    return { sources: [source], warnings };
  },
};

export default flipkart;
