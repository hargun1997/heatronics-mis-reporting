// ----------------------------------------------------------------------------
// Delhivery connector — COMPUTED warranty / returns freight for the close.
//
// Delhivery publishes no wallet / ledger / passbook API, so the close slot
// "Delhivery · Wallet report" is priced instead (mapper slots/map/delhivery.ts):
//   1. the month's Delhivery AWBs from the Warranty Manager feed
//      GET https://warranty.heatronics.in/api/feeds/delhivery-shipments?month=YYYY-MM
//      (header x-feed-token; non-PII rows: AWB, direction, created, pins, weight)
//   2. Delhivery tracking  GET https://track.delhivery.com/api/v1/packages/json/?waybill=a,b,…
//      (status, charged weight, pickup) — the same call the Warranty Manager
//      makes live (token query param), batched ≤ 50 waybills (batch size from
//      community clients, not Delhivery's gated docs: unverified)
//   3. the charge calculator ("Invoice shipping charge")
//      GET https://track.delhivery.com/api/kinko/v1/invoice/charges/.json
//      ?md=S|E&ss=Delivered|RTO|DTO&d_pin&o_pin&cgm(grams)&pt=Pre-paid|COD
//      (header Authorization: Token …; params as used by several public client
//      libraries — Delhivery's own docs need a Delhivery One login: unverified).
//
// Credentials (shared secrets, sharedSecrets.ts): delhivery-api-token (Delhivery
// One API token, same as the Warranty Manager's DELHIVERY_API_TOKEN) and
// warranty-feed-token (= FEED_TOKEN in warranty-manager-env). Missing = "Not
// connected", never an error. Token values never appear in a log or trace.
//
// READ ONLY: assertDelhiveryReadOnly() runs before every request — GET only, to
// exactly the tracking path, the charges path or the warranty feed path. No
// create / edit / cancel / pickup / manifest call can leave this file.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import type { ConnectorSource } from '../schema.js';
import { istToday } from '../slots/map/common.js';
import {
  chargeAmount, chargePlan, delhiveryFreightFacts, istDay, trackSummary,
  type ChargeQuery, type PricedAwb, type TrackSummary, type WarrantyFeedRow,
} from '../slots/map/delhivery.js';
import type { SlotPull } from '../slots/types.js';

export const DELHIVERY_HOST = 'https://track.delhivery.com';
export const TRACK_PATH = '/api/v1/packages/json/';
export const CHARGES_PATH = '/api/kinko/v1/invoice/charges/.json';
export const FEED_PATH = '/api/feeds/delhivery-shipments';
export const DEFAULT_FEED_URL = 'https://warranty.heatronics.in';
const TRACK_BATCH = 50;

/** Origin of the warranty feed (https only, no path). */
export function feedOrigin(creds: Credentials): string {
  const raw = (creds.feedUrl || DEFAULT_FEED_URL).trim();
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`Warranty feed URL "${raw}" is not a URL.`); }
  if (u.protocol !== 'https:') throw new Error('Warranty feed URL must be https.');
  return u.origin;
}

export function assertDelhiveryReadOnly(method: string, url: string, feed = DEFAULT_FEED_URL): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`Blocked: ${url} is not a URL.`); }
  if (method !== 'GET') throw new Error(`Blocked: Delhivery ${method} ${u.pathname} is not a read-only call.`);
  if (u.origin === DELHIVERY_HOST && (u.pathname === TRACK_PATH || u.pathname === CHARGES_PATH)) return;
  if (u.origin === new URL(feed).origin && u.pathname === FEED_PATH) return;
  throw new Error(`Blocked: GET ${u.origin}${u.pathname} is not Delhivery tracking, the charge calculator or the warranty feed.`);
}

function pacer(rate: number) {
  let next = 0;
  return async (deadline: number) => {
    const now = Date.now();
    const at = Math.max(now, next);
    if (at > deadline) throw new Error('Delhivery pricing ran out of time — Pull again (nothing was saved).');
    next = at + 1000 / rate;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
}
// Delhivery publishes no limit we can see; stay gentle (2 req/s shared by tracking + charges).
const pace = pacer(2);

async function getJson(url: string, headers: Record<string, string>, feed: string, label: string, tries = 3): Promise<unknown> {
  assertDelhiveryReadOnly('GET', url, feed);
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error(`${label} refused the token (${res.status}).`);
    if (!res.ok) throw new Error(`${label} ${res.status}: ${text.replace(/token=[^&\s"]+/gi, 'token=…').slice(0, 200)}`);
    try { return text ? JSON.parse(text) : {}; } catch { throw new Error(`${label} answered non-JSON (${res.status}).`); }
  }
}

function need(creds: Credentials, key: 'apiToken' | 'feedToken'): string {
  const v = (creds[key] || '').trim();
  if (!v) throw new Error(key === 'apiToken'
    ? 'Not connected — create secret delhivery-api-token.'
    : 'Not connected — create secret warranty-feed-token (= FEED_TOKEN in warranty-manager-env).');
  return v;
}

/** The month's Delhivery AWBs from the Warranty Manager (non-PII rows). */
export async function warrantyFeed(creds: Credentials, periodKey: string): Promise<{ rows: WarrantyFeedRow[]; undated: number }> {
  const origin = feedOrigin(creds);
  const j = (await getJson(`${origin}${FEED_PATH}?month=${encodeURIComponent(periodKey)}`, { 'x-feed-token': need(creds, 'feedToken') }, origin, 'Warranty feed')) as { rows?: WarrantyFeedRow[]; undated?: number };
  const rows = (Array.isArray(j.rows) ? j.rows : []).map((r) => ({
    awb: String(r.awb ?? '').trim(), direction: r.direction === 'reverse' ? 'reverse' as const : 'forward' as const,
    createdAt: String(r.createdAt ?? ''), orderId: r.orderId, sheetRow: r.sheetRow ?? null,
    originPin: r.originPin ?? null, destinationPin: r.destinationPin ?? null, paymentMode: r.paymentMode, declaredWeightG: r.declaredWeightG ?? null,
  })).filter((r) => r.awb);
  return { rows, undated: Number(j.undated) || 0 };
}

/** Tracking summaries for these AWBs (batched, paced; only whitelisted fields kept). */
export async function trackMany(creds: Credentials, awbs: string[], deadline: number): Promise<Map<string, TrackSummary>> {
  const token = need(creds, 'apiToken');
  const out = new Map<string, TrackSummary>();
  const uniq = [...new Set(awbs)];
  for (let i = 0; i < uniq.length; i += TRACK_BATCH) {
    await pace(deadline);
    const q = new URLSearchParams({ waybill: uniq.slice(i, i + TRACK_BATCH).join(','), token });
    const j = (await getJson(`${DELHIVERY_HOST}${TRACK_PATH}?${q}`, {}, DEFAULT_FEED_URL, 'Delhivery tracking')) as { ShipmentData?: unknown[] };
    for (const e of Array.isArray(j.ShipmentData) ? j.ShipmentData : []) {
      const t = trackSummary(e);
      if (t) out.set(t.awb, t);
    }
  }
  return out;
}

/** One charge-calculator answer → ₹ (null = no price). */
export async function chargeFor(creds: Credentials, q: ChargeQuery, deadline: number): Promise<number | null> {
  const token = need(creds, 'apiToken');
  await pace(deadline);
  const p = new URLSearchParams({ md: q.md, ss: q.ss, d_pin: q.d_pin, o_pin: q.o_pin, cgm: String(q.cgm), pt: q.pt });
  return chargeAmount(await getJson(`${DELHIVERY_HOST}${CHARGES_PATH}?${p}`, { Authorization: `Token ${token}` }, DEFAULT_FEED_URL, 'Delhivery charge calculator'));
}

/** The close slot pull: feed → tracking → charges → wallet-parser facts. */
export async function computedFreight(creds: Credentials, periodKey: string, deadline: number): Promise<SlotPull> {
  const mode = (creds.mode || 'S').trim().toUpperCase() === 'E' ? 'E' : 'S';
  const { rows, undated } = await warrantyFeed(creds, periodKey);
  const tracks = await trackMany(creds, rows.map((r) => r.awb), deadline);
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const cache = new Map<string, number | null>();
  const priced: PricedAwb[] = [];
  for (const row of rows) {
    const plan = chargePlan(row, tracks.get(row.awb) ?? null, mode);
    if (!plan.charge) { bump(plan.reason); continue; }
    const k = JSON.stringify(plan.query);
    if (!cache.has(k)) cache.set(k, await chargeFor(creds, plan.query, deadline));
    const amount = cache.get(k);
    if (amount == null || !(amount > 0)) { bump('no_price'); continue; }
    if (plan.estimated.length) bump('estimated');
    priced.push({ awb: row.awb, date: istDay(row.createdAt), amount });
  }
  const out = delhiveryFreightFacts(priced, periodKey, counts);
  out.rowCount = rows.length;
  out.trace.unshift(
    `Warranty Manager feed: ${rows.length} Delhivery AWB(s) created in ${periodKey}${undated ? ` (+${undated} with no date, not placed)` : ''}`,
    `Delhivery tracking (read only): ${tracks.size} of ${new Set(rows.map((r) => r.awb)).size} found; charge calculator: ${cache.size} distinct lane × weight × status call(s), mode ${mode === 'E' ? 'Express' : 'Surface'}`,
  );
  if (undated) out.warnings.push(`${undated} Delhivery AWB(s) in the warranty sheet have no stage date and could not be placed in a month.`);
  out.note = 'Computed freight (Delhivery tracking + charge calculator), not the wallet ledger — compare with the wallet once. Weight disputes, re-attempts and adhoc debits / credits are only in the wallet report.';
  return out;
}

const delhivery: ConnectorDef = {
  id: 'delhivery',
  label: 'Delhivery',
  group: 'logistics',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    { key: 'apiToken', label: 'API token', type: 'password', help: 'Shared secret delhivery-api-token when blank (Delhivery One → Settings → API).' },
    { key: 'feedToken', label: 'Warranty feed token', type: 'password', help: 'Shared secret warranty-feed-token when blank (= FEED_TOKEN in warranty-manager-env).' },
    { key: 'feedUrl', label: 'Warranty Manager URL', type: 'url', optional: true, help: `Default ${DEFAULT_FEED_URL}.` },
    { key: 'mode', label: 'Mode (S = Surface, E = Express)', type: 'text', optional: true, help: 'How the warranty shipments are booked; default S.' },
  ],
  note: 'Warranty / returns freight computed per AWB (Warranty Manager feed → Delhivery tracking → charge calculator), not the wallet ledger — Delhivery has no wallet API. Read only. The wallet report upload stays as fallback.',

  async test(creds: Credentials): Promise<TestResult> {
    const { rows } = await warrantyFeed(creds, istToday().slice(0, 7));
    need(creds, 'apiToken');
    if (rows.length) await trackMany(creds, [rows[0].awb], Date.now() + 15_000);
    return { ok: true, detail: `Warranty feed answered (${rows.length} AWB(s) this month)${rows.length ? '; Delhivery tracking answered' : ''}.` };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const out = await computedFreight(creds, periodKey, Date.now() + 120_000);
    const freight = out.facts?.reduce((s, f) => s + f.fees, 0) ?? 0;
    const source: ConnectorSource = {
      label: `Delhivery computed freight ${periodKey}`,
      // Cross-check only (no nodes), like Easebuzz: the close books this through the slot pull, not here.
      kind: 'channelRevenue',
      method: 'connector',
      nodes: [], skuRows: [], bomCosts: [],
      crossChecks: [{ label: 'Delhivery warranty / returns freight (computed)', amount: Math.round(freight * 100) / 100, note: out.note }],
      warnings: out.warnings,
    };
    return { sources: [source], warnings: out.warnings };
  },
};

export default delhivery;
