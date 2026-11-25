// Next-fixes batch 2 (25 Nov 2026): parallel changes to one JSON doc are never lost; Day Books are cached by version.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.INGEST_STORE = 'local';
process.env.INGEST_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-'));
const { updateJson, readJson, writeJson } = await import('../src/ingest/objectStore.js');
const { readBooks, _resetBookCache } = await import('../src/connectors/tally/bookStore.js');

test('20 parallel changes to one doc all land', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => updateJson<Record<string, number>>('t/par', {}, async (cur) => {
    await new Promise((r) => setTimeout(r, Math.random() * 5));
    return { ...cur, [`k${i}`]: i };
  })));
  const doc = await readJson<Record<string, number>>('t/par', {});
  assert.equal(Object.keys(doc).length, 20);
});

test('a change that throws writes nothing and the next change still runs', async () => {
  await writeJson('t/err', { n: 1 });
  await assert.rejects(updateJson('t/err', { n: 0 }, () => { throw new Error('no'); }));
  const next = await updateJson<{ n: number }>('t/err', { n: 0 }, (c) => ({ n: c.n + 1 }));
  assert.equal(next.n, 2);
});

test('Day Books: same version = cached copy, new version = read again', async () => {
  _resetBookCache();
  await writeJson('tally/books-state', { mastersAt: null, months: { '2026-10': 'v1' }, lastError: null, lastTryAt: null });
  await writeJson('tally/books-2026-10', { period: '2026-10', asOf: 'v1', vouchers: [{ guid: 'a' }] });
  const a = await readBooks('2026-10');
  await writeJson('tally/books-2026-10', { period: '2026-10', asOf: 'v1', vouchers: [{ guid: 'a' }, { guid: 'b' }] });
  const b = await readBooks('2026-10');
  assert.equal(b, a); // version unchanged: the cached copy
  _resetBookCache();
  await writeJson('tally/books-state', { mastersAt: null, months: { '2026-10': 'v2' }, lastError: null, lastTryAt: null });
  const c = await readBooks('2026-10');
  assert.equal(c?.vouchers.length, 2);
});
