// AI usage feed (schema 1): records → months newest first, money by vendor / model / purpose.
// Run: cd server && npx tsx --test test/aiUsageFeed.test.ts (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiUsageFeed, clampMonths, feedFromDay, istMonth, vendorOf, USD_INR, type FeedUsageRecord } from '../src/services/aiUsageFeed.js';
import { portalManifest } from '../src/portalManifest.js';

const NOW = new Date('2026-11-09T06:55:00.000Z');

const rec = (o: Partial<FeedUsageRecord>): FeedUsageRecord => ({
  day: '2026-11-05', model: 'claude-opus-5-5', feature: 'chat', inputTokens: 1000, outputTokens: 100,
  cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01, ...o,
});

test('months newest first, empty months omitted, money rounded, tokens summed', () => {
  const feed = buildAiUsageFeed([
    rec({ costUsd: 1.23456, inputTokens: 1000, cacheReadTokens: 500, cacheWriteTokens: 250, outputTokens: 90 }),
    rec({ costUsd: 0.5, feature: 'vision', model: 'claude-opus-5', day: '2026-11-01' }),
    rec({ day: '2026-09-15', costUsd: 2, feature: 'classifier' }),
    rec({ day: '2026-08-15', costUsd: 2, model: 'gemini-2.5-flash', feature: 'vision' }),
    rec({ day: '2026-01-15', costUsd: 99 }), // outside a 6-month window
  ], { now: NOW, months: 6 });

  assert.equal(feed.schema, 1);
  assert.equal(feed.portal, 'mis');
  assert.equal(feed.usdInr, USD_INR);
  assert.equal(feed.asOf, NOW.toISOString());
  assert.deepEqual(feed.notes, []);
  assert.deepEqual(feed.months.map((m) => m.month), ['2026-11', '2026-09', '2026-08']);

  const nov = feed.months[0];
  assert.equal(nov.usd, 1.7346);
  assert.equal(nov.inr, Math.round(1.7346 * 88));
  assert.equal(nov.calls, 2);
  assert.deepEqual(Object.keys(nov.vendors), ['claude']);
  assert.equal(nov.vendors.claude.inputTokens, 1000 + 500 + 250 + 1000);
  assert.equal(nov.vendors.claude.outputTokens, 190);
  assert.deepEqual(nov.models['claude-opus-5-5'], { usd: 1.2346, inr: 109, calls: 1 });
  assert.deepEqual(nov.purposes.vision, { usd: 0.5, inr: 44, calls: 1 });

  const aug = feed.months[2];
  assert.deepEqual(Object.keys(aug.vendors), ['gemini']);
  assert.equal(aug.vendors.gemini.calls, 1);
});

test('numbers are never null, a bad record still counts as a call', () => {
  const feed = buildAiUsageFeed([{ day: '2026-11-02', model: '', feature: '', inputTokens: 0, outputTokens: 0, costUsd: NaN }], { now: NOW });
  const m = feed.months[0];
  assert.deepEqual([m.usd, m.inr, m.calls], [0, 0, 1]);
  assert.deepEqual(m.models, { unknown: { usd: 0, inr: 0, calls: 1 } });
  assert.deepEqual(m.purposes, { other: { usd: 0, inr: 0, calls: 1 } });
});

test('window: months clamp 1..24 (default 6), fromDay is the 1st of the oldest IST month', () => {
  assert.equal(clampMonths(undefined), 6);
  assert.equal(clampMonths('abc'), 6);
  assert.equal(clampMonths(0), 1);
  assert.equal(clampMonths(99), 24);
  assert.equal(clampMonths('3'), 3);
  assert.equal(istMonth(new Date('2026-10-31T20:00:00.000Z')), '2026-11'); // 01:30 IST on 1 Nov
  assert.equal(feedFromDay(NOW, 1), '2026-11-01');
  assert.equal(feedFromDay(NOW, 6), '2026-06-01');
  assert.equal(feedFromDay(NOW, 12), '2025-12-01');
  const feed = buildAiUsageFeed([rec({ day: '2026-10-31' }), rec({ day: '2026-11-01' })], { now: NOW, months: 1 });
  assert.deepEqual(feed.months.map((m) => m.month), ['2026-11']);
});

test('vendor from the model name', () => {
  assert.equal(vendorOf('gemini-2.5-flash'), 'gemini');
  assert.equal(vendorOf('claude-opus-5-5'), 'claude');
});

test('manifest lists the feed as mis_get_ai_usage', () => {
  const e = portalManifest.exposes.find((x) => x.id === 'ai-usage') as any;
  assert.ok(e);
  assert.equal(e.path, '/api/ai/usage?months=<months>');
  assert.equal(e.auth, 'session');
  assert.equal(e.mcp.tool, 'mis_get_ai_usage');
  assert.equal(e.mcp.access, 'read');
});
