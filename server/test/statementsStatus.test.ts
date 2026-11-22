// Live MIS → Statements status row (PR 2, 22 Nov 2026): "as of" date, Tally offline, the pull toast line. Pure, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullMessage, statementsAsOf, tallyOffline } from '../../client/src/components/liveMis/useStatements.ts';

const m = (period: string, tb: boolean, final?: boolean) => ({ period, asOf: null, tb: tb ? { rows: [], difference: 0, basis: 'fy-to-date' } : null, closingStock: null, depreciation: 0, nettProfit: null, final });

test('as of: newest month with a TB; a running month says today; a finished month not final is provisional', () => {
  assert.deepEqual(statementsAsOf({ months: [] }, '2026-11-22'), { asOf: null, running: false, provisional: false });
  assert.deepEqual(statementsAsOf({ months: [m('2026-09', true, true), m('2026-10', true, false), m('2026-11', false)] }, '2026-11-22'), { asOf: '2026-10-31', running: false, provisional: true });
  assert.deepEqual(statementsAsOf({ months: [m('2026-10', true, true), m('2026-11', true, false)] }, '2026-11-22'), { asOf: '2026-11-22', running: true, provisional: false });
});

test('Tally offline = the newest try failed after the last answer', () => {
  assert.equal(tallyOffline(null), false);
  assert.equal(tallyOffline({ lastTryAt: '2026-11-22T16:00:00Z', lastError: null, reachedAt: '2026-11-22T15:00:00Z' }), false);
  assert.equal(tallyOffline({ lastTryAt: '2026-11-22T16:00:00Z', lastError: 'ECONNREFUSED', reachedAt: '2026-11-22T15:00:00Z' }), true);
  assert.equal(tallyOffline({ lastTryAt: '2026-11-22T14:00:00Z', lastError: 'old', reachedAt: '2026-11-22T15:00:00Z' }), false); // books answered since
});

test('pull toast: months read, left, failed; Tally down', () => {
  const base = { at: 'x', detail: '', failed: [], remaining: [] };
  assert.equal(pullMessage({ ...base, status: 'ok', done: ['2026-04', '2026-05'] }, null), 'Read 2 months from Tally.');
  assert.equal(pullMessage({ ...base, status: 'partial', done: ['2026-04'], remaining: ['2026-05'], failed: [{ period: '2026-06', error: 'x' }] }, null), 'Read 1 month from Tally. 1 month left: pull again. 1 failed: Jun 26.');
  assert.match(pullMessage({ ...base, status: 'down', done: [] }, null), /did not answer/);
  assert.match(pullMessage(null, 'boom'), /Pull failed: boom/);
});
