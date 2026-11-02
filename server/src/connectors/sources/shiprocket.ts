// ----------------------------------------------------------------------------
// Shiprocket connector — the wallet statement (passbook) for the close.
//
// Same API user as Ops (shared secrets shiprocket-email / shiprocket-password).
// Endpoints: POST /v1/external/auth/login (mints the JWT) and
// GET /v1/external/account/details/statement?from&to&page&per_page — the
// passbook lines (debit / credit, description, channel order id, created at).
// The statement path and its field names come from Shiprocket's API spec and
// are not yet checked against a live answer: the mapper reads them defensively
// and the passbook upload stays as the fallback.
//
// READ ONLY: assertReadOnly() allows the login POST and GETs, nothing else —
// no order, pickup, label, NDR or cancel call can leave this file.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import type { ConnectorSource } from '../schema.js';
import type { ShiprocketStatementRow } from '../slots/map/feeds.js';
import { shiprocketStatementFacts } from '../slots/map/feeds.js';
import { monthDays } from '../slots/map/common.js';

const SR = 'https://apiv2.shiprocket.in/v1/external';
const PER_PAGE = 200;

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

/** Every statement line between two ISO days (inclusive), all pages. */
export async function statementLines(creds: Credentials, from: string, to: string, deadline: number): Promise<{ rows: ShiprocketStatementRow[]; pages: number }> {
  const rows: ShiprocketStatementRow[] = [];
  let pages = 0;
  for (let page = 1; page <= 500; page++) {
    if (Date.now() > deadline) throw new Error('Shiprocket statement paging ran out of time — Pull again.');
    const j = await srGet<{ data?: ShiprocketStatementRow[]; meta?: { pagination?: { total_pages?: number } } }>(
      creds, `/account/details/statement?from=${from}&to=${to}&page=${page}&per_page=${PER_PAGE}`,
    );
    const data = Array.isArray(j.data) ? j.data : [];
    rows.push(...data);
    pages = page;
    const total = j.meta?.pagination?.total_pages;
    if (data.length === 0 || (total != null ? page >= total : data.length < PER_PAGE)) break;
  }
  return { rows, pages };
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
  note: 'Wallet statement (passbook) for the close: D2C freight & charges by day (recharges, COD remittances and credits excluded). Read only. Same API user as Ops.',

  async test(creds: Credentials): Promise<TestResult> {
    await login(creds);
    return { ok: true, detail: 'Logged in to Shiprocket.' };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { first, last } = monthDays(periodKey);
    const { rows } = await statementLines(creds, first, last, Date.now() + 60_000);
    const out = shiprocketStatementFacts(rows, periodKey);
    const freight = out.facts?.reduce((s, f) => s + f.fees, 0) ?? 0;
    const source: ConnectorSource = {
      label: `Shiprocket freight ${periodKey}`,
      kind: 'shiprocketFreight',
      method: 'connector',
      nodes: [], skuRows: [], bomCosts: [],
      crossChecks: [{ label: 'Shiprocket freight & charges (wallet debits)', amount: Math.round(freight * 100) / 100, note: 'From the wallet statement API.' }],
      warnings: out.warnings,
    };
    return { sources: [source], warnings: out.warnings };
  },
};

export default shiprocket;
