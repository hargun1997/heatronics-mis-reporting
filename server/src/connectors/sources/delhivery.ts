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
// Pacing (Nov 2026: the calculator answered 429 "Request was throttled. Expected
// available in 6 seconds."): per-pull pacers, tracking 2/s and the calculator
// 1 call per 2 s, each doubling its gap after a 429; a 429 waits Retry-After or
// the "available in N seconds" of the body and retries ≤ 4 times. One call per
// distinct lane × weight × status × mode. When the job budget runs out the AWBs
// left are booked at the same-direction average of the priced ones (warning).
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

import { isAllowedFeedHost } from '../safeUrl.js';
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
  // The feed call carries the x-feed-token secret: only ever to a heatronics.in host.
  if (!isAllowedFeedHost(u.hostname)) throw new Error(`Warranty feed URL must be on heatronics.in (got ${u.hostname}).`);
  return u.origin;
}

export function assertDelhiveryReadOnly(method: string, url: string, feed = DEFAULT_FEED_URL): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('Blocked: not a URL.'); }
  if (method !== 'GET') throw new Error(`Blocked: Delhivery ${method} ${u.pathname} is not a read-only call.`);
  if (u.origin === DELHIVERY_HOST && (u.pathname === TRACK_PATH || u.pathname === CHARGES_PATH)) return;
  if (u.origin === new URL(feed).origin && u.pathname === FEED_PATH) return;
  throw new Error(`Blocked: GET ${u.origin}${u.pathname} is not Delhivery tracking, the charge calculator or the warranty feed.`);
}

/** The pull budget ran out before this call could be made (or finish). */
export class BudgetOut extends Error {
  constructor(what: string) { super(`${what}: pull budget ran out`); this.name = 'BudgetOut'; }
}

/** Injected in tests (no network, fake clock); real fetch / setTimeout / Date.now otherwise. */
export interface DlDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Leave this much of the budget for assembling the answer. */
const RESERVE_MS = 3_000;
const MAX_429_RETRIES = 4;
const MAX_5XX_TRIES = 3;

/**
 * Wait asked by a 429: Retry-After (seconds or an HTTP date), else Delhivery's
 * "Expected available in N seconds." in the body, else 5 s. Plus 250 ms slack.
 */
export function retryAfterMs(retryAfter: string | null | undefined, body: string, now = Date.now()): number {
  const ra = (retryAfter ?? '').trim();
  if (ra) {
    if (/^\d+(\.\d+)?$/.test(ra)) return Math.ceil(parseFloat(ra) * 1000) + 250;
    const t = Date.parse(ra);
    if (!Number.isNaN(t)) return Math.max(0, t - now) + 250;
  }
  const m = body.match(/available in\s+(\d+(?:\.\d+)?)\s*(?:s\b|sec|second)/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 250;
  return 5_000;
}

/** Spaces calls `interval` ms apart; doubles it (≤ max) after a 429. */
export class Pacer {
  private next = 0;
  constructor(public interval: number, private readonly max: number, private readonly clock: Required<Pick<DlDeps, 'now' | 'sleep'>>) {}
  async wait(deadline: number, what: string): Promise<void> {
    const now = this.clock.now();
    const at = Math.max(now, this.next);
    if (at > deadline - RESERVE_MS) throw new BudgetOut(what);
    this.next = at + this.interval;
    if (at > now) await this.clock.sleep(at - now);
  }
  backoff(waitMs = 0): void {
    this.interval = Math.min(this.max, this.interval * 2);
    this.next = Math.max(this.next, this.clock.now() + waitMs);
  }
}

/** Per-pull client: its own pacers (tracking 2/s, charge calculator 1 per 2 s, both back off on 429). */
export function dlClient(deps: DlDeps = {}) {
  const clock = {
    now: deps.now ?? (() => Date.now()),
    sleep: deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
  };
  const f = deps.fetch ?? fetch;
  const tracking = new Pacer(500, 10_000, clock);
  const charges = new Pacer(2_000, 16_000, clock);
  const stats = { calls: 0, throttled: 0, waitedMs: 0 };

  async function getJson(url: string, headers: Record<string, string>, feed: string, label: string, pacer: Pacer | null, deadline: number): Promise<unknown> {
    assertDelhiveryReadOnly('GET', url, feed);
    let n429 = 0, n5xx = 0;
    for (;;) {
      if (pacer) await pacer.wait(deadline, label);
      else if (clock.now() > deadline - RESERVE_MS) throw new BudgetOut(label);
      const left = deadline - clock.now();
      let res: Response;
      try {
        stats.calls += 1;
        res = await f(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(Math.max(1_000, Math.min(20_000, left))) });
      } catch (e) {
        if (clock.now() >= deadline - RESERVE_MS) throw new BudgetOut(label);
        throw e;
      }
      const text = await res.text();
      if (res.status === 429) {
        stats.throttled += 1;
        if (n429 >= MAX_429_RETRIES) throw new Error(`${label} 429: still throttled after ${MAX_429_RETRIES} retries.`);
        n429 += 1;
        const wait = retryAfterMs(res.headers.get('retry-after'), text, clock.now());
        pacer?.backoff(wait);
        if (clock.now() + wait > deadline - RESERVE_MS) throw new BudgetOut(label);
        stats.waitedMs += wait;
        if (!pacer) await clock.sleep(wait);
        continue;
      }
      if (res.status >= 500 && ++n5xx < MAX_5XX_TRIES) {
        const wait = 1_500 * n5xx;
        if (clock.now() + wait > deadline - RESERVE_MS) throw new BudgetOut(label);
        await clock.sleep(wait);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new Error(`${label} refused the token (${res.status}).`);
      if (!res.ok) throw new Error(`${label} ${res.status}: ${text.replace(/token=[^&\s"]+/gi, 'token=…').slice(0, 200)}`);
      try { return text ? JSON.parse(text) : {}; } catch { throw new Error(`${label} answered non-JSON (${res.status}).`); }
    }
  }
  return { getJson, tracking, charges, stats, now: clock.now };
}
export type DlClient = ReturnType<typeof dlClient>;

function need(creds: Credentials, key: 'apiToken' | 'feedToken'): string {
  const v = (creds[key] || '').trim();
  if (!v) throw new Error(key === 'apiToken'
    ? 'Not connected. Add the secret delhivery-api-token.'
    : 'Not connected. Add the secret warranty-feed-token (= FEED_TOKEN in warranty-manager-env).');
  return v;
}

/** The month's Delhivery AWBs from the Warranty Manager (non-PII rows). */
export async function warrantyFeed(creds: Credentials, periodKey: string, c: DlClient = dlClient(), deadline = c.now() + 60_000): Promise<{ rows: WarrantyFeedRow[]; undated: number }> {
  const origin = feedOrigin(creds);
  const j = (await c.getJson(`${origin}${FEED_PATH}?month=${encodeURIComponent(periodKey)}`, { 'x-feed-token': need(creds, 'feedToken') }, origin, 'Warranty feed', null, deadline)) as { rows?: WarrantyFeedRow[]; undated?: number };
  const rows = (Array.isArray(j.rows) ? j.rows : []).map((r) => ({
    awb: String(r.awb ?? '').trim(), direction: r.direction === 'reverse' ? 'reverse' as const : 'forward' as const,
    createdAt: String(r.createdAt ?? ''), orderId: r.orderId, sheetRow: r.sheetRow ?? null,
    originPin: r.originPin ?? null, destinationPin: r.destinationPin ?? null, paymentMode: r.paymentMode, declaredWeightG: r.declaredWeightG ?? null,
  })).filter((r) => r.awb);
  return { rows, undated: Number(j.undated) || 0 };
}

/**
 * Tracking summaries for these AWBs (batched, paced; only whitelisted fields
 * kept). When the budget runs out the AWBs not reached come back in `left`.
 */
export async function trackMany(creds: Credentials, awbs: string[], deadline: number, c: DlClient = dlClient()): Promise<{ tracks: Map<string, TrackSummary>; left: string[] }> {
  const token = need(creds, 'apiToken');
  const tracks = new Map<string, TrackSummary>();
  const uniq = [...new Set(awbs)];
  for (let i = 0; i < uniq.length; i += TRACK_BATCH) {
    const batch = uniq.slice(i, i + TRACK_BATCH);
    const q = new URLSearchParams({ waybill: batch.join(','), token });
    let j: { ShipmentData?: unknown[] };
    try {
      j = (await c.getJson(`${DELHIVERY_HOST}${TRACK_PATH}?${q}`, {}, DEFAULT_FEED_URL, 'Delhivery tracking', c.tracking, deadline)) as typeof j;
    } catch (e) {
      if (e instanceof BudgetOut) return { tracks, left: uniq.slice(i) };
      throw e;
    }
    for (const e of Array.isArray(j.ShipmentData) ? j.ShipmentData : []) {
      const t = trackSummary(e);
      if (t) tracks.set(t.awb, t);
    }
  }
  return { tracks, left: [] };
}

/** One charge-calculator answer → ₹ (null = no price). Throws BudgetOut when out of time. */
export async function chargeFor(creds: Credentials, q: ChargeQuery, deadline: number, c: DlClient = dlClient()): Promise<number | null> {
  const token = need(creds, 'apiToken');
  const p = new URLSearchParams({ md: q.md, ss: q.ss, d_pin: q.d_pin, o_pin: q.o_pin, cgm: String(q.cgm), pt: q.pt });
  return chargeAmount(await c.getJson(`${DELHIVERY_HOST}${CHARGES_PATH}?${p}`, { Authorization: `Token ${token}` }, DEFAULT_FEED_URL, 'Delhivery charge calculator', c.charges, deadline));
}

/**
 * The close slot pull: feed → tracking → charges → wallet-parser facts.
 * Out of budget: what was priced is kept; the AWBs left are booked at the
 * average priced ₹ of the same direction (an estimate, said in a warning).
 */
export async function computedFreight(creds: Credentials, periodKey: string, deadline: number, deps: DlDeps = {}): Promise<SlotPull> {
  const c = dlClient(deps);
  const mode = (creds.mode || 'S').trim().toUpperCase() === 'E' ? 'E' : 'S';
  const { rows, undated } = await warrantyFeed(creds, periodKey, c, deadline);
  need(creds, 'apiToken');
  const { tracks, left: untracked } = await trackMany(creds, rows.map((r) => r.awb), deadline, c);
  const notReached = new Set(untracked);
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const cache = new Map<string, number | null>();
  const priced: PricedAwb[] = [];
  const byDir: Record<'forward' | 'reverse', number[]> = { forward: [], reverse: [] };
  const leftover: WarrantyFeedRow[] = [];
  let outOfTime = notReached.size > 0;
  for (const row of rows) {
    if (notReached.has(row.awb)) { leftover.push(row); continue; }
    const plan = chargePlan(row, tracks.get(row.awb) ?? null, mode);
    if (!plan.charge) { bump(plan.reason); continue; }
    const k = JSON.stringify(plan.query);
    if (!cache.has(k)) {
      if (outOfTime) { leftover.push(row); continue; }
      try {
        cache.set(k, await chargeFor(creds, plan.query, deadline, c));
      } catch (e) {
        if (!(e instanceof BudgetOut)) throw e;
        outOfTime = true;
        leftover.push(row);
        continue;
      }
    }
    const amount = cache.get(k);
    if (amount == null || !(amount > 0)) { bump('no_price'); continue; }
    if (plan.estimated.length) bump('estimated');
    priced.push({ awb: row.awb, date: istDay(row.createdAt), amount });
    byDir[row.direction].push(amount);
  }

  // Budget fallback: average of the priced AWBs of the same direction (else all priced).
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null);
  const all = [...byDir.forward, ...byDir.reverse];
  const avgOf = { forward: avg(byDir.forward) ?? avg(all), reverse: avg(byDir.reverse) ?? avg(all) };
  let booked = 0, bookedSum = 0;
  for (const row of leftover) {
    const a = avgOf[row.direction];
    if (a == null) continue;
    priced.push({ awb: row.awb, date: istDay(row.createdAt), amount: a });
    booked += 1;
    bookedSum += a;
  }

  const out = delhiveryFreightFacts(priced, periodKey, counts);
  out.rowCount = rows.length;
  out.trace.unshift(
    `Warranty Manager feed: ${rows.length} Delhivery AWB(s) created in ${periodKey}${undated ? ` (+${undated} with no date, not placed)` : ''}`,
    `Delhivery tracking (read only): ${tracks.size} of ${new Set(rows.map((r) => r.awb)).size} found${notReached.size ? ` (${notReached.size} not reached in time)` : ''}; charge calculator: ${cache.size} distinct lane × weight × status call(s), mode ${mode === 'E' ? 'Express' : 'Surface'}`,
    `Delhivery calls: ${c.stats.calls}${c.stats.throttled ? `, ${c.stats.throttled} throttled (429) — waited ${Math.round(c.stats.waitedMs / 1000)} s and slowed down` : ''}`,
  );
  if (leftover.length) {
    const avgTxt = (['forward', 'reverse'] as const).filter((d) => leftover.some((r) => r.direction === d) && avgOf[d] != null)
      .map((d) => `${d} ₹${avgOf[d]}`).join(', ');
    out.warnings.push(booked
      ? `The pull ran out of time: ${leftover.length} AWB(s) were left unpriced; ${booked} of them are booked at the average priced charge (${avgTxt}) = ₹${Math.round(bookedSum).toLocaleString('en-IN')} — an ESTIMATE. Pull again to price them.`
      : `The pull ran out of time: ${leftover.length} AWB(s) were left unpriced and nothing was priced to average from — Pull again.`);
    out.trace.push(`Budget fallback: ${leftover.length} AWB(s) unpriced${booked ? `, ${booked} booked at the same-direction average (estimate)` : ''}`);
  }
  if (undated) out.warnings.push(`${undated} Delhivery AWB(s) in the warranty sheet have no stage date and could not be placed in a month.`);
  out.note = 'Computed freight (Delhivery tracking + charge calculator), not the wallet ledger — compare with the wallet once. Weight disputes, re-attempts and adhoc debits / credits are only in the wallet report.'
    + (leftover.length ? ' Some AWBs are booked at an average (pull ran out of time) — see warnings.' : '');
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
