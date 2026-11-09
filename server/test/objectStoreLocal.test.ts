// INGEST_STORE=local forces the local directory backend, except on Cloud Run (K_SERVICE set) — like HTX_GATE=off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.INGEST_STORE = 'local';
process.env.INGEST_STORE_DIR = mkdtempSync(path.join(os.tmpdir(), 'object-store-local-test-'));
const { localStoreForced } = await import('../src/ingest/objectStore.js');

test('INGEST_STORE=local is honoured off Cloud Run', () => {
  assert.equal(localStoreForced({ INGEST_STORE: 'local' }), true);
  assert.equal(localStoreForced({}), false);
  assert.equal(localStoreForced({ INGEST_STORE: 'gcs' }), false);
});

test('INGEST_STORE=local is ignored on Cloud Run (K_SERVICE set)', () => {
  assert.equal(localStoreForced({ INGEST_STORE: 'local', K_SERVICE: 'heatronics-mis' }), false);
});
