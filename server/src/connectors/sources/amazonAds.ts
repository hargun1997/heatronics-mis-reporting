// ----------------------------------------------------------------------------
// Amazon Ads connector — Sponsored Products / Brands / Display daily spend.
//
// Same app and secrets as Ops (adsapi-lwa-client-id / -secret /
// adsapi-refresh-token-in, see sharedSecrets.ts), same endpoints as Ops'
// lib/server/amazonAds.ts: EU token host api.amazon.co.uk, API host
// advertising-api-eu.amazon.com, reporting v3.
//
// READ ONLY. assertReadOnly() runs before every request: GET, or POST to
// /reporting/reports (creating a *report* changes nothing in the ad account).
// No campaign, bid, budget or keyword call can leave this file.
//
// Reports are asynchronous (create → poll → download gzip JSON) and take from
// seconds to a few minutes. So a pull waits at most ADS_WAIT_MS; anything still
// processing is remembered by report id and picked up on the next pull (Amazon
// also answers 425 "duplicate of <id>" for the same request, which we reuse).
// Finished windows are cached in memory for 30 min.
// ----------------------------------------------------------------------------

import { gunzipSync } from 'node:zlib';
import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { monthBounds } from '../types.js';
import type { ConnectorSource } from '../schema.js';
import type { DailyFact, FactResult } from '../facts.js';

const REGION_HOSTS: Record<string, string> = {
  na: 'https://advertising-api.amazon.com',
  eu: 'https://advertising-api-eu.amazon.com',
  fe: 'https://advertising-api-fe.amazon.com',
};
const TOKEN_HOSTS: Record<string, string> = {
  na: 'https://api.amazon.com/auth/o2/token',
  eu: 'https://api.amazon.co.uk/auth/o2/token',
  fe: 'https://api.amazon.co.jp/auth/o2/token',
};
const REPORT_CT = 'application/vnd.createasyncreportrequest.v3+json';
const ADS_WAIT_MS = Number(process.env.AMAZON_ADS_WAIT_MS) || 45_000;
const MAX_SPAN_DAYS = 31;

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- read-only guard --------------------------------------------------------

function assertReadOnly(method: string, url: string): void {
  if (method === 'GET') return;
  const path = url.replace(/^https:\/\/[^/]+/, '').split('?')[0];
  if (method === 'POST' && path === '/reporting/reports') return;
  throw new Error(`Blocked: Amazon Ads ${method} ${path} is not a read-only call.`);
}

// ---- auth + request ---------------------------------------------------------

const region = (c: Credentials) => {
  const r = (c.region || 'eu').trim().toLowerCase();
  return REGION_HOSTS[r] ? r : 'eu';
};
const tokenCache = new Map<string, { token: string; exp: number }>();

async function lwaToken(creds: Credentials): Promise<string> {
  const clientId = (creds.clientId || '').trim();
  const clientSecret = (creds.clientSecret || '').trim();
  const refreshToken = (creds.refreshToken || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Amazon Ads needs clientId, clientSecret and refreshToken (shared secrets adsapi-*).');
  }
  const hit = tokenCache.get(refreshToken);
  if (hit && Date.now() < hit.exp - 60_000) return hit.token;
  const res = await fetch(TOKEN_HOSTS[region(creds)], {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`Amazon Ads login failed (${res.status}${j.error ? `: ${j.error}` : ''}).`);
  tokenCache.set(refreshToken, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

class AdsError extends Error {
  constructor(message: string, readonly status: number, readonly detail: string) { super(message); }
}

async function adsRequest<T>(
  creds: Credentials,
  path: string,
  opts: { method?: 'GET' | 'POST'; profileId?: string; body?: unknown; contentType?: string } = {},
): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = `${REGION_HOSTS[region(creds)]}${path}`;
  assertReadOnly(method, url);
  for (let i = 0; ; i++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await lwaToken(creds)}`,
      'Amazon-Advertising-API-ClientId': (creds.clientId || '').trim(),
      Accept: 'application/json',
    };
    if (opts.profileId) headers['Amazon-Advertising-API-Scope'] = opts.profileId;
    if (opts.body !== undefined) headers['Content-Type'] = opts.contentType ?? 'application/json';
    const res = await fetch(url, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    if (res.status === 401 && i === 0) { tokenCache.delete((creds.refreshToken || '').trim()); continue; }
    if ((res.status === 429 || res.status >= 500) && i < 3) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : 2000 * 2 ** i);
      continue;
    }
    const text = await res.text();
    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { detail: text.slice(0, 300) }; }
    if (!res.ok) {
      const detail = String(j?.detail || j?.details || j?.message || j?.errors?.[0]?.message || j?.code || '');
      throw new AdsError(`Amazon Ads ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`, res.status, detail);
    }
    return j as T;
  }
}

// ---- profiles ---------------------------------------------------------------

interface Profile { profileId: string; countryCode: string; type: string; name: string }

async function profiles(creds: Credentials): Promise<Profile[]> {
  const list = await adsRequest<any[]>(creds, '/v2/profiles');
  const all: Profile[] = (Array.isArray(list) ? list : []).map((p) => ({
    profileId: String(p.profileId),
    countryCode: String(p.countryCode || ''),
    type: String(p.accountInfo?.type || ''),
    name: String(p.accountInfo?.name || ''),
  }));
  const pinned = (creds.profileId || '').trim();
  if (pinned) return all.filter((p) => pinned.split(/[,\s]+/).includes(p.profileId));
  return all.filter((p) => p.countryCode === 'IN'); // Amazon.in seller + vendor (AMS), as in Ops
}

// ---- reports ----------------------------------------------------------------

type AdType = 'SP' | 'SB' | 'SD';
const REPORTS: Record<AdType, { adProduct: string; reportTypeId: string; columns: string[]; sales: string; orders: string }> = {
  SP: { adProduct: 'SPONSORED_PRODUCTS', reportTypeId: 'spCampaigns', columns: ['date', 'cost', 'sales14d', 'purchases14d'], sales: 'sales14d', orders: 'purchases14d' },
  SB: { adProduct: 'SPONSORED_BRANDS', reportTypeId: 'sbCampaigns', columns: ['date', 'cost', 'sales', 'purchases'], sales: 'sales', orders: 'purchases' },
  SD: { adProduct: 'SPONSORED_DISPLAY', reportTypeId: 'sdCampaigns', columns: ['date', 'cost', 'sales', 'purchases'], sales: 'sales', orders: 'purchases' },
};

interface DayRow { date: string; spend: number; sales: number; orders: number }
interface Job { profileId: string; type: AdType; start: string; end: string }
const jobKey = (j: Job) => `${j.profileId}|${j.type}|${j.start}|${j.end}`;

/** In-flight report ids (2 h) and finished rows (30 min), per profile × type × window. */
const pending = new Map<string, { reportId: string; at: number }>();
const done = new Map<string, { rows: DayRow[]; at: number }>();

function windows(fromISO: string, toISO: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let s = Date.parse(`${fromISO}T00:00:00Z`);
  const last = Date.parse(`${toISO}T00:00:00Z`);
  while (s <= last) {
    const e = Math.min(last, s + (MAX_SPAN_DAYS - 1) * 86_400_000);
    out.push({ start: new Date(s).toISOString().slice(0, 10), end: new Date(e).toISOString().slice(0, 10) });
    s = e + 86_400_000;
  }
  return out;
}

const DUP = /duplicate of\s*:?\s*([0-9a-f-]{8,})/i;

async function createReport(creds: Credentials, j: Job): Promise<string> {
  const d = REPORTS[j.type];
  const body = {
    name: `mis ${j.type} ${j.profileId} ${j.start}..${j.end}`,
    startDate: j.start,
    endDate: j.end,
    configuration: { adProduct: d.adProduct, groupBy: ['campaign'], columns: d.columns, reportTypeId: d.reportTypeId, timeUnit: 'DAILY', format: 'GZIP_JSON' },
  };
  try {
    const r = await adsRequest<{ reportId?: string }>(creds, '/reporting/reports', { method: 'POST', profileId: j.profileId, body, contentType: REPORT_CT });
    if (!r.reportId) throw new Error('Amazon Ads returned no report id.');
    return String(r.reportId);
  } catch (e) {
    const m = e instanceof AdsError && e.status === 425 ? (e.detail || e.message).match(DUP) : null;
    if (m) return m[1];
    throw e;
  }
}

async function download(url: string): Promise<any[]> {
  assertReadOnly('GET', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Amazon Ads report download failed (${res.status}).`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const text = buf.toString('utf8').trim();
  if (!text) return [];
  const j = JSON.parse(text);
  return Array.isArray(j) ? j : Array.isArray(j?.rows) ? j.rows : [];
}

function toDays(type: AdType, rows: any[]): DayRow[] {
  const d = REPORTS[type];
  const by = new Map<string, DayRow>();
  for (const r of rows) {
    const date = String(r.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const a = by.get(date) ?? { date, spend: 0, sales: 0, orders: 0 };
    a.spend += num(r.cost);
    a.sales += num(r[d.sales]);
    a.orders += num(r[d.orders]);
    by.set(date, a);
  }
  return [...by.values()];
}

interface PullResult { days: Map<string, DayRow & { byType: Record<AdType, number> }>; warnings: string[]; trace: string[]; complete: boolean }

async function pull(creds: Credentials, fromISO: string, toISO: string): Promise<PullResult> {
  const warnings: string[] = [];
  const trace: string[] = [];
  const profs = await profiles(creds);
  if (!profs.length) throw new Error('No Amazon.in advertising profile on this Ads login (countryCode IN).');
  trace.push(`Authenticated; ${profs.length} Amazon.in profile(s): ${profs.map((p) => `${p.name || p.profileId} (${p.type || '?'})`).join(', ')}`);

  const jobs: Job[] = [];
  for (const p of profs) for (const w of windows(fromISO, toISO)) for (const t of Object.keys(REPORTS) as AdType[]) jobs.push({ profileId: p.profileId, type: t, ...w });

  const now = Date.now();
  const results = new Map<string, DayRow[]>();
  const live: { job: Job; reportId: string }[] = [];
  for (const j of jobs) {
    const k = jobKey(j);
    const hit = done.get(k);
    if (hit && now - hit.at < 30 * 60_000) { results.set(k, hit.rows); continue; }
    const p = pending.get(k);
    try {
      const reportId = p && now - p.at < 2 * 3_600_000 ? p.reportId : await createReport(creds, j);
      pending.set(k, { reportId, at: p?.at ?? now });
      live.push({ job: j, reportId });
    } catch (e) {
      // A type a profile doesn't run (e.g. SD on a vendor profile) is a note, not a failure.
      warnings.push(`${j.type} ${j.start}…${j.end} (profile ${j.profileId}): ${e instanceof Error ? e.message : 'report refused'}`);
      results.set(k, []);
    }
  }
  trace.push(`Reports: ${jobs.length - live.length} cached/skipped, ${live.length} requested or in flight`);

  const deadline = Date.now() + ADS_WAIT_MS;
  let waiting = live;
  for (let round = 0; waiting.length; round++) {
    const still: typeof live = [];
    for (const w of waiting) {
      const k = jobKey(w.job);
      try {
        const st = await adsRequest<{ status?: string; url?: string; failureReason?: string }>(creds, `/reporting/reports/${encodeURIComponent(w.reportId)}`, { profileId: w.job.profileId });
        if (st.status === 'COMPLETED' && st.url) {
          const rows = toDays(w.job.type, await download(st.url));
          results.set(k, rows);
          done.set(k, { rows, at: Date.now() });
          pending.delete(k);
        } else if (st.status === 'FAILED') {
          warnings.push(`${w.job.type} report ${w.job.start}…${w.job.end} failed: ${st.failureReason || 'no reason given'}`);
          pending.delete(k);
          results.set(k, []);
        } else {
          still.push(w);
        }
      } catch (e) {
        warnings.push(`${w.job.type} report status: ${e instanceof Error ? e.message : 'failed'}`);
        still.push(w);
      }
    }
    waiting = still;
    if (!waiting.length || Date.now() + 5000 > deadline) break;
    await sleep(Math.min(5000 + round * 2000, 15_000));
  }
  if (waiting.length) {
    warnings.push(`Amazon Ads: ${waiting.length} report(s) still processing at Amazon — pull again in a minute or two to complete these dates.`);
  }

  const days = new Map<string, DayRow & { byType: Record<AdType, number> }>();
  for (const j of jobs) {
    for (const r of results.get(jobKey(j)) ?? []) {
      const a = days.get(r.date) ?? { date: r.date, spend: 0, sales: 0, orders: 0, byType: { SP: 0, SB: 0, SD: 0 } };
      a.spend += r.spend; a.sales += r.sales; a.orders += r.orders; a.byType[j.type] += r.spend;
      days.set(r.date, a);
    }
  }
  trace.push(`Extracted ${days.size} day(s) of spend${waiting.length ? ' (partial)' : ''}`);
  return { days, warnings, trace, complete: waiting.length === 0 };
}

// ---- connector ----------------------------------------------------------------

const amazonAds: ConnectorDef = {
  id: 'amazonads',
  label: 'Amazon Ads',
  group: 'marketing',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    { key: 'clientId', label: 'LWA client ID', type: 'text', placeholder: 'amzn1.application-oa2-client.…', help: 'Filled from the shared adsapi-lwa-client-id secret when blank.' },
    { key: 'clientSecret', label: 'LWA client secret', type: 'password' },
    { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: 'Atzr|…' },
    { key: 'profileId', label: 'Profile ID(s)', type: 'text', optional: true, help: 'Blank = every Amazon.in profile (seller + vendor/AMS). Comma-separate to pin.' },
    { key: 'region', label: 'Region', type: 'text', placeholder: 'eu', optional: true, help: 'na / eu / fe. India = eu. Default eu.' },
  ],
  note: 'Sponsored Products + Brands + Display daily spend across every Amazon.in profile → Sales & Marketing and MER/ROAS. Read only. Runs on the shared Ops Ads app; reports are async, so a fresh pull may need a second click a minute later.',

  async test(creds: Credentials): Promise<TestResult> {
    const p = await profiles(creds);
    if (!p.length) return { ok: false, detail: 'Logged in, but no Amazon.in advertising profile is visible.' };
    return { ok: true, detail: `Connected — ${p.length} Amazon.in profile(s): ${p.map((x) => x.name || x.profileId).join(', ')}.` };
  },

  async fetchFacts(creds: Credentials, fromISO: string, toISO: string): Promise<FactResult> {
    const { days, warnings, trace } = await pull(creds, fromISO, toISO);
    const facts: DailyFact[] = [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ source: 'amazonads', channel: 'Amazon Ads', date: d.date, revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(d.spend) }));
    return { facts, warnings, trace };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { startISO, endISO } = monthBounds(periodKey);
    const { days, warnings, complete } = await pull(creds, startISO.slice(0, 10), endISO.slice(0, 10));
    const tot = { spend: 0, sales: 0, SP: 0, SB: 0, SD: 0 };
    for (const d of days.values()) { tot.spend += d.spend; tot.sales += d.sales; tot.SP += d.byType.SP; tot.SB += d.byType.SB; tot.SD += d.byType.SD; }
    const source: ConnectorSource = {
      label: `Amazon Ads spend ${periodKey}${complete ? '' : ' (partial)'}`,
      kind: 'adSpend',
      method: 'connector',
      nodes: [],
      skuRows: [],
      bomCosts: [],
      crossChecks: [
        { label: 'Amazon Ads spend', amount: r2(tot.spend), against: 'sm_total', note: `SP ₹${r2(tot.SP)} · SB ₹${r2(tot.SB)} · SD ₹${r2(tot.SD)}. Holds against the booked Sales & Marketing total.` },
        { label: 'Amazon Ads attributed sales (14-day)', amount: r2(tot.sales), note: 'Amazon-attributed, overlaps organic — for ROAS only, never revenue.' },
      ],
      warnings,
    };
    return { sources: [source], warnings };
  },
};

export default amazonAds;
