// ----------------------------------------------------------------------------
// Shiprocket connector — shipment charges for the close.
//
// Same API user as Ops (shared secrets shiprocket-email / shiprocket-password).
// Endpoints: POST /v1/external/auth/login (mints the JWT) and
// GET /v1/external/orders?page&per_page&from&to&sort&sort_by — the orders list
// Ops' D2C sync reads live (lib/d2c/shiprocketApi.ts listOrders), whose
// awb_data.charges carry freight / COD / RTO charges per order.
// The wallet statement API (GET /account/details/statement) was dropped: for
// October 2026 it answered one money-in line and no debits, so it is not the
// shipment-charge passbook. The pull computes the debits (slots/map/shiprocket.ts).
//
// READ ONLY: assertShiprocketReadOnly() allows the login POST and GETs, nothing
// else — no order, pickup, label, NDR or cancel call can leave this file.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import type { ConnectorSource } from '../schema.js';
import type { SlotPull } from '../slots/types.js';
import { shiprocketChargeFacts, shiprocketChargeLines } from '../slots/map/shiprocket.js';
import { addDays, monthDays, rangeEnd } from '../slots/map/common.js';

const SR = 'https://apiv2.shiprocket.in/v1/external';
const PER_PAGE = 100;
/** Orders created this many days before the month can still get their AWB / RTO inside it. */
export const LOOKBACK_DAYS = 20;

export function assertShiprocketReadOnly(method: string, url: string): void {
  const path = url.replace(/^https:\/\/apiv2\.shiprocket\.in/, '').split('?')[0];
  if (!url.startsWith('https://apiv2.shiprocket.in/')) throw new Error(`Blocked: ${url.split('?')[0]} is not Shiprocket.`);
  if (method === 'GET') return;
  if (method === 'POST' && path === '/v1/external/auth/login') return;
  throw new Error(`Blocked: Shiprocket ${method} ${path} is not a read-only call.`);
}

const tokens = new Map<string, { token: string; exp: number }>();

async function login(creds: Credentials): Promise<string> {
  const email = (creds.email || '').trim();
  const password = (creds.password || '').trim();
  if (!email || !password) throw new Error('Shiprocket needs the API user email + password (shared secrets shiprocket-email / -password).');
  const hit = tokens.get(email);
  if (hit && Date.now() < hit.exp) return hit.token;
  const url = `${SR}/auth/login`;
  assertShiprocketReadOnly('POST', url);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !j.token) throw new Error(`Shiprocket login failed (${res.status}${j.message ? `: ${j.message}` : ''}).`);
  tokens.set(email, { token: j.token, exp: Date.now() + 9 * 86_400_000 }); // JWT lasts 10 days
  return j.token;
}

async function srGet<T>(creds: Credentials, path: string, retry = true): Promise<T> {
  const url = `${SR}${path}`;
  assertShiprocketReadOnly('GET', url);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await login(creds)}`, 'Content-Type': 'application/json' } });
  if (res.status === 401 && retry) { tokens.delete((creds.email || '').trim()); return srGet<T>(creds, path, false); }
  const text = await res.text();
  if (!res.ok) throw new Error(`Shiprocket ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Every order created between two ISO days (inclusive), all pages (Ops' listOrders call). */
export async function ordersBetween(creds: Credentials, from: string, to: string, deadline: number): Promise<{ orders: any[]; pages: number }> {
  const orders: any[] = [];
  let pages = 0;
  for (let page = 1; page <= 1000; page++) {
    if (Date.now() > deadline) throw new Error(`Shiprocket orders paging ran out of time after ${pages} page(s) — Pull again.`);
    const j = await srGet<{ data?: any[]; meta?: { pagination?: { current_page?: number; total_pages?: number } } }>(
      creds, `/orders?page=${page}&per_page=${PER_PAGE}&from=${from}&to=${to}&sort=ASC&sort_by=id`,
    );
    const data = Array.isArray(j.data) ? j.data : [];
    orders.push(...data);
    pages = page;
    const total = j.meta?.pagination?.total_pages;
    if (data.length === 0 || (total != null ? page >= total : data.length < PER_PAGE)) break;
  }
  return { orders, pages };
}

/** The close slot pull: orders (month + lookback) → charge lines → passbook-parser facts. */
export async function computedCharges(creds: Credentials, periodKey: string, deadline: number): Promise<SlotPull> {
  const { first } = monthDays(periodKey);
  const end = rangeEnd(periodKey);
  const from = addDays(first, -LOOKBACK_DAYS);
  const { orders, pages } = await ordersBetween(creds, from, end, deadline);
  const { lines, counts } = shiprocketChargeLines(orders);
  const out = shiprocketChargeFacts(lines, periodKey, counts);
  out.trace.unshift(`Shiprocket orders API (read only), orders created ${from} → ${end} (${LOOKBACK_DAYS}-day lookback for AWBs / RTOs landing in ${periodKey}), ${pages} page(s)`);
  out.note = 'Computed from shipment charges (freight + COD + RTO), not the wallet statement — compare with the passbook once. Dated on the AWB assign day (RTO on the RTO day). Weight-dispute debits, refunds and other adhoc wallet lines are only in the passbook; whether the API charges include GST is unverified.';
  return out;
}

const shiprocket: ConnectorDef = {
  id: 'shiprocket',
  label: 'Shiprocket',
  group: 'logistics',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    { key: 'email', label: 'API user email', type: 'text', help: 'Filled from the shared shiprocket-email secret when blank.' },
    { key: 'password', label: 'API user password', type: 'password' },
  ],
  note: 'Shipment charges for the close, computed from the orders list (freight + COD + RTO by day), not the wallet statement. Read only. Same API user as Ops.',

  async test(creds: Credentials): Promise<TestResult> {
    await login(creds);
    return { ok: true, detail: 'Logged in to Shiprocket.' };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const out = await computedCharges(creds, periodKey, Date.now() + 60_000);
    const freight = out.facts?.reduce((s, f) => s + f.fees, 0) ?? 0;
    const source: ConnectorSource = {
      label: `Shiprocket freight ${periodKey}`,
      kind: 'shiprocketFreight',
      method: 'connector',
      nodes: [], skuRows: [], bomCosts: [],
      crossChecks: [{ label: 'Shiprocket freight & charges (computed)', amount: Math.round(freight * 100) / 100, note: out.note }],
      warnings: out.warnings,
    };
    return { sources: [source], warnings: out.warnings };
  },
};

export default shiprocket;
