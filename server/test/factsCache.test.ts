// Live facts cache: per source × month, stale served at once and refreshed behind, never-pulled months waited for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FactResult } from '../src/connectors/facts.js';

// Keep the object store on a throwaway local dir: no GCP metadata probe, never the real bucket.
process.env.INGEST_STORE = 'local';
process.env.INGEST_STORE_DIR = mkdtempSync(path.join(os.tmpdir(), 'facts-cache-test-'));
const { cachedFacts, freshFor, monthsBetween } = await import('../src/connectors/factsCache.js');

const fact = (date: string) => ({ source: 't', channel: 'D2C', date, revenue: 100, units: 1, orders: 1, fees: 0 });

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
