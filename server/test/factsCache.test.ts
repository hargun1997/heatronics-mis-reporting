// Live facts cache: per source × month, stale served at once and refreshed behind, never-pulled months waited for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedFacts, freshFor, monthsBetween } from '../src/connectors/factsCache.js';
import type { FactResult } from '../src/connectors/facts.js';

const fact = (date: string) => ({ source: 't', channel: 'D2C', date, revenue: 100, units: 1, orders: 1 });

test('months and freshness', () => {
  assert.deepEqual(monthsBetween('2026-11-15', '2027-01-02'), ['2026-11', '2026-12', '2027-01']);
  const now = Date.parse('2026-11-02T10:00:00Z');
  assert.equal(freshFor('2026-09', now), 24 * 3_600_000);
  assert.equal(freshFor('2026-10', now), 15 * 60_000); // ended < 5 days ago
  assert.equal(freshFor('2026-11', now), 15 * 60_000);
});

test('first load waits and stores; next load is served from the store; stale refreshes in the background', async () => {
  const src = `t${Date.now()}`;
  let calls = 0;
  const fetch = async (from: string, to: string): Promise<FactResult> => { calls++; return { facts: [fact(from), fact(to)], warnings: [] }; };
  const now = Date.parse('2026-11-02T10:00:00Z');
  const a = await cachedFacts(src, '2026-09-01', '2026-11-02', fetch, { now });
  assert.equal(calls, 1);
  assert.equal(a.facts.length, 2);
  assert.equal(a.refreshing, false);
  const b = await cachedFacts(src, '2026-09-01', '2026-11-02', fetch, { now: now + 60_000 });
  assert.equal(calls, 1);
  assert.equal(b.facts.length, 2);
  let bg: Promise<unknown> | null = null;
  const c = await cachedFacts(src, '2026-09-01', '2026-11-02', fetch, { now: now + 20 * 60_000, background: (p) => { bg = p; } });
  assert.equal(c.refreshing, true);   // this month is stale after 15 min
  assert.equal(c.facts.length, 2);    // served the stored copy at once
  await bg;
  assert.equal(calls, 2);
  await cachedFacts(src, '2026-09-01', '2026-11-02', fetch, { force: true });
  assert.equal(calls, 3);
});

test('a partial pull (source still preparing / out of time) is re-pulled after 5 min, not served for 24 h', async () => {
  const { isPartial, PARTIAL_FRESH_MS } = await import('../src/connectors/factsCache.js');
  assert.equal(isPartial(['Amazon Ads: 2 of 3 report(s) still being prepared by Amazon — they finish in the background; reload in a few minutes for complete spend.']), true);
  assert.equal(isPartial(['Flipkart: ran out of time before 2026-09-01…2026-09-15 (pre) — pull again to finish (done windows are cached).']), true);
  assert.equal(isPartial(['Flipkart commission and fees are not in the Seller API — fees show as 0; take them from the settlement upload.']), false);
  const src = `p${Date.now()}`;
  let calls = 0;
  const fetch = async (from: string): Promise<FactResult> => { calls++; return { facts: [fact(from)], warnings: calls === 1 ? ['Amazon Ads: 1 of 2 report(s) still being prepared by Amazon'] : [] }; };
  const now = Date.parse('2026-11-02T10:00:00Z');
  const a = await cachedFacts(src, '2026-08-01', '2026-08-31', fetch, { now });   // a closed month: normally fresh 24 h
  assert.equal(a.partial, true);
  let bg: Promise<unknown> | null = null;
  const b = await cachedFacts(src, '2026-08-01', '2026-08-31', fetch, { now: now + PARTIAL_FRESH_MS + 1000, background: (p) => { bg = p; } });
  assert.equal(b.refreshing, true);
  await bg;
  assert.equal(calls, 2);
  const c = await cachedFacts(src, '2026-08-01', '2026-08-31', fetch, { now: now + 2 * PARTIAL_FRESH_MS });
  assert.equal(c.partial, false);
  assert.equal(c.refreshing, false);  // complete copy: back to the 24 h rule
});
