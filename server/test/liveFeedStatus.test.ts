// Live feed status (backlog bugs 2 + 3, 9 Nov 2026): a failed / partial / slow live pull shows on the Fix list, never silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckItems } from '../../client/src/data/issues/inbox.ts';
import { withTimeout } from '../src/routes/connectors.js';

const base = { completeness: {}, productGaps: undefined } as never;

test('a failed live pull is a high Fix item; a failed source medium; a partial one low; not connected is ignored', () => {
  const down = deckItems({ ...(base as object), liveFeed: { ok: false, error: 'Facts request failed (502).', sources: [] } } as never);
  assert.equal(down[0].id, 'feed:live');
  assert.equal(down[0].severity, 'high');
  const mixed = deckItems({ ...(base as object), liveFeed: { ok: true, sources: [
    { id: 'shopify', label: 'Shopify', ok: false, error: 'token expired' },
    { id: 'amazonads', label: 'Amazon Ads', ok: true, partial: true },
    { id: 'flipkart', label: 'Flipkart', ok: false, error: 'not connected' },
    { id: 'meta', label: 'Meta', ok: true },
  ] } } as never);
  assert.deepEqual(mixed.map((i) => [i.id, i.severity]), [['feed:shopify', 'medium'], ['feed:amazonads:partial', 'low']]);
  assert.equal(deckItems(base).length, 0);
});

test('withTimeout rejects a slow source with a plain message and leaves fast ones alone', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50, 'slow'), 7);
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'Shopify took over 25 s'), /took over 25 s/);
});
