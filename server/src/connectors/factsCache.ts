// ----------------------------------------------------------------------------
// Live facts cache — /api/connectors/facts took ~30 s live (2 Nov 2026: every source re-pulled its whole range on
// every Live MIS load). Facts are stored per source × month (objectStore `facts-cache/<source>-<YYYY-MM>`, shared by
// every Cloud Run instance) and served at once:
//   • closed months (ended > 5 days ago) stay fresh 24 h — late adjustments still arrive within a day;
//   • this month and last month stay fresh 15 min.
// Stale months are served as they are and refreshed in the background (one refresh per source at a time); only a
// month never pulled makes the request wait. `force` re-pulls everything asked (the page's Refresh button).
// ----------------------------------------------------------------------------

import type { DailyFact, FactResult } from './facts.js';
import { readJson, writeJson } from '../ingest/objectStore.js';

export interface CachedMonth { at: string; facts: DailyFact[]; warnings: string[]; trace?: string[]; partial?: boolean }
export interface SourceOutcome {
  facts: DailyFact[]; warnings: string[]; trace: string[]; cachedAt: string | null; refreshing: boolean; partial?: boolean;
  /** The last refresh of this source failed: the copy served is the last good one. */
  staleError?: string; staleErrorAt?: string;
}
/** Last pull of one source (objectStore `facts-status/<source>`): a failed refresh is recorded, never swallowed. */
export interface FactsStatus { okAt: string | null; error: string | null; errorAt: string | null; errorSpan?: string }

const H = 3_600_000;
const ist = (t: number) => new Date(t + 5.5 * H);
export const istMonthOf = (t: number) => ist(t).toISOString().slice(0, 7);

/** Months [from, to] touch, 'YYYY-MM'. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const monthEnd = (p: string) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/** How long a month's copy stays fresh. */
export function freshFor(period: string, now: number): number {
  const endMs = Date.parse(`${monthEnd(period)}T23:59:59+05:30`);
  return now - endMs > 5 * 24 * H ? 24 * H : 15 * 60_000;
}

/** A pull that ran out of time or that the source is still preparing (Amazon Ads reports, Flipkart windows, a failed
 * window). Its copy is kept (better than nothing) but treated as stale after PARTIAL_FRESH_MS, so the next load
 * re-pulls instead of serving understated spend / revenue all day (backlog bug 1, 9 Nov 2026). */
export const PARTIAL_FRESH_MS = 5 * 60_000;
const PARTIAL_RE = /still being prepared|out of time|pull again|timed? ?out|time limit|failed|not finished|in the background/i;
export const isPartial = (warnings: string[]) => warnings.some((w) => PARTIAL_RE.test(w));

const key = (source: string, period: string) => `facts-cache/${source}-${period}`;
// Instance memory in front of the store: a warm instance answers without any storage read (~3 s of GCS reads otherwise).
const mem = new Map<string, CachedMonth>();
async function readMonth(k: string): Promise<CachedMonth | null> {
  const hit = mem.get(k);
  if (hit) return hit;
  const d = await readJson<CachedMonth | null>(k, null);
  if (d && Array.isArray(d.facts)) mem.set(k, d);
  return d;
}
const inflight = new Map<string, Promise<void>>();

// ---- Pull status (10 Nov 2026: a failing background refresh left Amazon / Shopify 2 days old and nobody was told) ----
const statusKey = (source: string) => `facts-status/${source}`;
const NO_STATUS: FactsStatus = { okAt: null, error: null, errorAt: null };
const statusMem = new Map<string, { at: number; doc: FactsStatus }>();
export async function readFactsStatus(source: string, now = Date.now(), fresh = false): Promise<FactsStatus> {
  const hit = statusMem.get(source);
  if (!fresh && hit && Math.abs(now - hit.at) < 60_000) return hit.doc;
  const doc = { ...NO_STATUS, ...(await readJson<Partial<FactsStatus>>(statusKey(source), {}).catch(() => ({}))) };
  statusMem.set(source, { at: now, doc });
  return doc;
}
async function writeStatus(source: string, doc: FactsStatus, now: number): Promise<void> {
  statusMem.set(source, { at: now, doc });
  await writeJson(statusKey(source), doc).catch(() => undefined);
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
/** Pull + store, and record how it went. Throws the pull's own error. */
async function trackedPull(source: string, months: string[], fetch: (from: string, to: string) => Promise<FactResult>, now: number): Promise<Map<string, CachedMonth>> {
  try {
    const got = await pullAndStore(source, months, fetch, now);
    await writeStatus(source, { okAt: new Date(now).toISOString(), error: null, errorAt: null }, now);
    return got;
  } catch (e) {
    const prev = await readFactsStatus(source, now).catch(() => NO_STATUS);
    await writeStatus(source, { okAt: prev.okAt, error: errText(e), errorAt: new Date(now).toISOString(), errorSpan: `${months[0]}…${months[months.length - 1]}` }, now);
    throw e;
  }
}

/** Health of each live source for the Fix list: age of this month's copy + the last refresh error (if it is still failing). */
export async function liveFactsHealth(sources: { id: string; label: string }[], now = Date.now()): Promise<{ id: string; label: string; cachedAt: string | null; error: string | null; errorAt: string | null }[]> {
  const month = istMonthOf(now);
  return Promise.all(sources.map(async (x) => {
    const [st, doc] = await Promise.all([
      readFactsStatus(x.id, now, true),
      readJson<CachedMonth | null>(key(x.id, month), null).catch(() => null),
    ]);
    return { id: x.id, label: x.label, cachedAt: doc?.at ?? st.okAt ?? null, error: st.error, errorAt: st.errorAt };
  }));
}

/** Pull [from, to] once and store it split by month (months with no facts stored empty). */
async function pullAndStore(source: string, months: string[], fetch: (from: string, to: string) => Promise<FactResult>, now = Date.now()): Promise<Map<string, CachedMonth>> {
  const from = `${months[0]}-01`;
  const today = ist(now).toISOString().slice(0, 10);
  const last = monthEnd(months[months.length - 1]);
  const to = last > today ? today : last;
  const r = await fetch(from, to);
  const at = new Date(now).toISOString();
  const by = new Map<string, CachedMonth>(months.map((p) => [p, { at, facts: [], warnings: [...r.warnings], trace: r.trace, ...(isPartial(r.warnings) ? { partial: true } : {}) }]));
  for (const f of r.facts) by.get(f.date.slice(0, 7))?.facts.push(f);
  for (const [p, doc] of by) mem.set(key(source, p), doc);
  await Promise.all([...by].map(([p, doc]) => writeJson(key(source, p), doc)));
  return by;
}

/**
 * Facts of one source for [from, to] through the cache. `fetch` is the connector's own fetchFacts (creds bound).
 * `now` / `background` are injectable for tests.
 */
export async function cachedFacts(
  source: string, from: string, to: string, fetch: (from: string, to: string) => Promise<FactResult>,
  opts: { force?: boolean; now?: number; background?: (p: Promise<unknown>) => void } = {},
): Promise<SourceOutcome> {
  const now = opts.now ?? Date.now();
  const months = monthsBetween(from, to);
  const docs = await Promise.all(months.map((p) => (opts.force ? Promise.resolve(null) : readMonth(key(source, p)))));
  const have = new Map<string, CachedMonth>();
  months.forEach((p, i) => { const d = docs[i]; if (d && Array.isArray(d.facts)) have.set(p, d); });

  const missing = months.filter((p) => !have.has(p));
  const stale = months.filter((p) => { const d = have.get(p); return d && now - Date.parse(d.at) > (d.partial ? PARTIAL_FRESH_MS : freshFor(p, now)); });

  if (missing.length) {
    // Never pulled (or forced): wait — one range from the first to the last month needed.
    const span = months.slice(months.indexOf(missing[0]), months.indexOf(missing[missing.length - 1]) + 1);
    const got = await trackedPull(source, span, fetch, now);
    for (const [p, d] of got) have.set(p, d);
  }
  let refreshing = false;
  const stillStale = stale;
  if (stillStale.length && !inflight.has(source)) {
    refreshing = true;
    const span = months.slice(months.indexOf(stillStale[0]), months.indexOf(stillStale[stillStale.length - 1]) + 1);
    // A failed refresh keeps the last good copy; trackedPull has recorded the error + time (returned below as staleError).
    const job = trackedPull(source, span, fetch, opts.now === undefined ? Date.now() : now + 1).then(() => undefined).catch(() => undefined).finally(() => inflight.delete(source));
    inflight.set(source, job);
    (opts.background ?? (() => {}))(job);
  } else if (inflight.has(source)) refreshing = true;

  const used = months.map((p) => have.get(p)!).filter(Boolean);
  const facts = used.flatMap((d) => d.facts).filter((f) => f.date >= from && f.date <= to);
  const warnings = [...new Set(used.flatMap((d) => d.warnings))];
  const trace = used.find((d) => d.trace?.length)?.trace ?? [];
  const oldest = used.map((d) => d.at).sort()[0] ?? null;
  const partial = used.some((d) => d.partial);
  const st = await readFactsStatus(source, now).catch(() => NO_STATUS);
  return { facts, warnings, trace, cachedAt: oldest, refreshing, partial, ...(st.error ? { staleError: st.error, staleErrorAt: st.errorAt ?? undefined } : {}) };
}
