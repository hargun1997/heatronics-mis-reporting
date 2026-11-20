// usageRecordsSince: reads the append-only usage/ records (local directory backend, synthetic data only), skips unreadable
// ones, keeps a record once read, and only reads NEW records on the next call.
// Run: cd server && npx tsx --test test/aiUsageRecords.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('usageRecordsSince: filters by day, skips junk, reads each record once', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mis-usage-'));
  process.env.INGEST_STORE_DIR = dir;
  const store = await import('../src/ingest/objectStore.js');
  const put = async (day: string, id: string, body: string) => {
    await fs.mkdir(path.join(dir, 'usage', day), { recursive: true });
    await fs.writeFile(path.join(dir, 'usage', day, `${id}.json`), body);
  };
  const rec = (model: string, costUsd: number) => JSON.stringify({ model, feature: 'chat', inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd, at: '2026-11-05T00:00:00Z' });
  await put('2026-11-05', 'a', rec('claude-opus-5-5', 0.1));
  await put('2026-11-06', 'b', rec('claude-opus-5-5', 0.2));
  await put('2026-09-01', 'old', rec('claude-opus-5-5', 9));
  await put('2026-11-06', 'junk', '{not json');

  const first = await store.usageRecordsSince('2026-11-01');
  assert.deepEqual(first.map((r) => r.day).sort(), ['2026-11-05', '2026-11-06']);

  // a record already read is served from memory even if the file changes; a new file is picked up
  await put('2026-11-05', 'a', rec('claude-opus-5-5', 5));
  await put('2026-11-07', 'c', rec('claude-opus-5-5', 0.3));
  const second = await store.usageRecordsSince('2026-11-01');
  assert.equal(second.length, 3);
  assert.equal(Math.round(second.reduce((s, r) => s + r.costUsd, 0) * 100) / 100, 0.6);

  await fs.rm(dir, { recursive: true, force: true });
});
