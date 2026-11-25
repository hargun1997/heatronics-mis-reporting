// The Shopify new-buyer history refreshes once a day with the auto-pull run (CAC on Live MIS stays current).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.INGEST_STORE = 'local';
const { historyDue } = await import('../src/planning/historyJob.js');

const at = (iso: string) => Date.parse(iso);

test('due once a day from 07:00 IST', () => {
  // now 25 Nov 08:00 IST (02:30 UTC)
  assert.equal(historyDue('2026-11-24T13:30:00Z', at('2026-11-25T02:30:00Z')), true);  // taken 24 Nov 19:00 IST
  assert.equal(historyDue('2026-11-24T20:00:00Z', at('2026-11-25T02:30:00Z')), false); // taken 25 Nov 01:30 IST: today
});

test('taken earlier today (IST) is fresh', () => {
  assert.equal(historyDue('2026-11-25T01:00:00Z', at('2026-11-25T06:00:00Z')), false); // 06:30 IST and 11:30 IST, same day
});

test('taken yesterday (IST) is due after 07:00 IST, not before', () => {
  assert.equal(historyDue('2026-11-24T05:00:00Z', at('2026-11-25T02:00:00Z')), true);  // 07:30 IST
  assert.equal(historyDue('2026-11-24T05:00:00Z', at('2026-11-25T01:00:00Z')), false); // 06:30 IST
});

test('no history or a bad date is due', () => {
  assert.equal(historyDue(null, at('2026-11-25T04:00:00Z')), true);
  assert.equal(historyDue('not a date', at('2026-11-25T04:00:00Z')), true);
});
