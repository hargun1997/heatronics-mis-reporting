// One Tally age on every page (UI pass, 22 Nov 2026): newest read of either store, same words as the client's ago().
import test from 'node:test';
import assert from 'node:assert/strict';
import { ageWords, newest } from '../src/connectors/tally/freshness.js';
import { serverItems } from '../src/services/issuesInbox.js';
import { ago } from '../../client/src/components/ui/sourceAgo.ts';

test('newest picks the latest valid time', () => {
  assert.equal(newest(null, '2026-11-01T10:00:00Z', 'bad', '2026-11-20T08:00:00Z', undefined), '2026-11-20T08:00:00Z');
  assert.equal(newest(null, undefined), null);
});

test('server words = client words', () => {
  const now = Date.parse('2026-11-22T10:00:00Z');
  for (const iso of [null, '2026-11-22T09:50:00Z', '2026-11-21T09:00:00Z', '2026-11-20T08:00:00Z', '2026-11-02T10:00:00Z']) {
    assert.equal(ageWords(iso, now), ago(iso, now));
  }
});

test('Fix item says the same age as the pill', () => {
  const now = '2026-11-22T10:00:00Z';
  const last = '2026-11-02T10:00:00Z';
  const items = serverItems({ today: '2026-11-22', now, health: null, chart: null, tb: null, committed: new Set(), everUsed: new Set(), anomalies: [], tally: { connected: true, lastOkAt: last, lastError: null } } as unknown as Parameters<typeof serverItems>[0]);
  const it = items.find((i) => i.id === 'feed:tally');
  assert.ok(it);
  assert.equal(it!.title, `Tally last reached ${ago(last, Date.parse(now))}`);
});
