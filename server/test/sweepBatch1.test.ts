// Next-fixes batch 1 (25 Nov 2026): an ended login reloads once; price floors refuse a stale save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldReload } from '../../client/src/utils/sessionRules.js';

const O = 'https://mis.heatronics.in';

test('a 401 from our API reloads, at most once a minute', () => {
  assert.equal(shouldReload(401, '/api/work', O, null, 1_000_000), true);
  assert.equal(shouldReload(401, `${O}/api/today`, O, 1_000_000 - 30_000, 1_000_000), false);
  assert.equal(shouldReload(401, '/api/today', O, 1_000_000 - 61_000, 1_000_000), true);
});

test('other answers and other sites never reload', () => {
  assert.equal(shouldReload(403, '/api/work', O, null, 1), false);
  assert.equal(shouldReload(500, '/api/work', O, null, 1), false);
  assert.equal(shouldReload(401, 'https://portal.heatronics.in/api/shell/me', O, null, 1), false);
  assert.equal(shouldReload(401, '/assets/x.js', O, null, 1), false);
});

test('price floors: a save on an older copy is refused with the current settings', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.INGEST_STORE = 'local';
  process.env.INGEST_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  const express = (await import('express')).default;
  const { default: router } = await import('../src/routes/priceFloors.js');
  const app = express();
  app.use(express.json());
  app.use('/', router);
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  const post = (body: unknown) => fetch(`http://127.0.0.1:${port}/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const first = await (await post({ settings: { global: { a: 1 }, skus: [] } })).json() as { settings: { updatedAt: string } };
    const v1 = first.settings.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const second = await post({ settings: { global: { a: 2 }, skus: [] }, ifUpdatedAt: v1 });
    assert.equal(second.status, 200);
    const stale = await post({ settings: { global: { a: 3 }, skus: [] }, ifUpdatedAt: v1 });
    assert.equal(stale.status, 409);
    const body = await stale.json() as { settings: { global: { a: number } } };
    assert.equal(body.settings.global.a, 2);
    const old = await post({ settings: { global: { a: 4 }, skus: [] } }); // no ifUpdatedAt = old page, still saves
    assert.equal(old.status, 200);
  } finally { server.close(); }
});
