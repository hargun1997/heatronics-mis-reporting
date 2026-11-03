// Issues inbox: server items (Tally health, hanging ledgers per kind, TB tie, Tally reached, manual uploads for last month,
// anomaly scan) and the open / done / snoozed state (done holds until the item says something else).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyIssueOp, openItems, prevMonth, serverItems, type InboxInputs } from '../src/services/issuesInbox.js';
import { buildChart } from '../src/connectors/tally/chart.js';

const chart = buildChart({
  groups: [{ name: 'Indirect Expenses', parent: '', primary: 'Indirect Expenses' }, { name: 'Amazon Channel Fees', parent: 'Indirect Expenses', primary: 'Indirect Expenses' }],
  ledgers: [{ name: 'FBA storage fee', group: 'Indirect Expenses', primary: 'Indirect Expenses', gstin: '', registration: '', state: '', pan: '', opening: 0, billWise: false, tds: '', gstApplicable: '', taxType: '', dutyHead: '' }],
});
const base: InboxInputs = {
  today: '2026-11-12', health: { periods: ['2026-10'], vouchers: 10, ledgers: 5, issues: [{ id: 'dup', severity: 'error', title: 'Duplicate bills', why: 'w', fix: 'f', count: 2, samples: [] }] },
  chart, tb: { period: '2026-10', difference: 1520 }, tally: { connected: true, lastOkAt: '2026-11-01T06:00:00Z', lastError: 'fetch failed' },
  committed: new Set(['blinkit|order-charges|2026-10']), everUsed: new Set(['blinkit', 'flipkart']),
  anomalies: [{ id: 'flat-inv', severity: 'medium', category: 'inventory', period: '2026-09', title: 'Inventory flat', detail: 'd' },
    { id: 'flat-inv-8', severity: 'high', category: 'inventory', period: '2026-08', title: 'Inventory flat', detail: 'd8' },
    { id: 'future', severity: 'high', category: 'inventory', period: '2027-02', title: 'Future thing', detail: 'f' }],
};

test('server items cover books, feeds and the scan', () => {
  const items = serverItems(base);
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes('tally:dup'));
  assert.ok(ids.includes('chart:catch_all'));
  assert.ok(ids.includes('tb:2026-10'));
  assert.ok(ids.includes('feed:tally'), 'Tally not reached for 11 days');
  assert.ok(ids.includes('upload:flipkart:settlement:2026-10'));
  assert.ok(!ids.includes('upload:blinkit:order-charges:2026-10'), 'already uploaded');
  assert.ok(!ids.some((i) => i.startsWith('upload:snapmint')), 'never used → not nagged');
  const scan = items.filter((i) => i.id.startsWith('scan:'));
  assert.equal(scan.length, 1, 'same check over months = one item; future months skipped');
  assert.equal(scan[0].count, 2);
  assert.equal(scan[0].severity, 'high', 'worst month wins');
  assert.equal(scan[0].period, '2026-09');
  assert.equal(items.find((i) => i.id === 'upload:flipkart:settlement:2026-10')!.severity, 'medium', 'past the 10th');
  assert.equal(prevMonth('2026-01-05'), '2025-12');
});

test('done holds until the item changes; snooze until the date; reopen clears', () => {
  const items = serverItems(base);
  const tb = items.find((i) => i.id === 'tb:2026-10')!;
  const now = '2026-11-12T10:00:00Z';
  let st = applyIssueOp({}, { op: 'done', id: tb.id, sig: tb.sig }, 'h@x', now);
  assert.ok(!openItems(items, st, now).some((i) => i.id === tb.id));
  const changed = serverItems({ ...base, tb: { period: '2026-10', difference: 99 } });
  assert.ok(openItems(changed, st, now).some((i) => i.id === tb.id), 'different difference → open again');
  st = applyIssueOp(st, { op: 'snooze', id: 'tally:dup', sig: 'x', days: 7 }, 'h@x', now);
  assert.ok(!openItems(items, st, now).some((i) => i.id === 'tally:dup'));
  assert.ok(openItems(items, st, '2026-11-20T10:00:00Z').some((i) => i.id === 'tally:dup'));
  st = applyIssueOp(st, { op: 'reopen', id: tb.id, sig: '' }, 'h@x', now);
  assert.ok(!st[tb.id]);
});
