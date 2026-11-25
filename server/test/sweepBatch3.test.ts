// Next-fixes batch 3 (25 Nov 2026): Setup's "Reports by month" uses the same slot rule as Tasks → Fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_SLOTS, monthCoverage, slotProblems, type StoredSlotReport } from '../src/connectors/slots/closeSlots.js';

const full = (connectorId: string, slotId: string, periodKey: string, first = `${periodKey}-01`, last = `${periodKey}-28`): StoredSlotReport =>
  ({ connectorId, slotId, periodKey, rows: 10, first, last });

test('a month is complete only when every required slot is in, whole', () => {
  const req = CLOSE_SLOTS.filter((s) => s.required);
  const reports = req.map((s) => full(s.connectorId, s.slotId, '2026-09'));
  const cov = monthCoverage({ today: '2026-11-25', reports, from: '2026-09' });
  assert.equal(cov[0].period, '2026-09');
  assert.equal(cov[0].state, 'complete');
  assert.equal(cov[0].present, req.length);
  assert.equal(cov[2].state, 'running'); // November
});

test('a part-month report makes it partial, as the Fix list says', () => {
  const req = CLOSE_SLOTS.filter((s) => s.required);
  const edge = req.find((s) => s.edgeDays != null)!;
  const reports = req.map((s) => (s === edge ? full(s.connectorId, s.slotId, '2026-09', '2026-09-10', '2026-09-15') : full(s.connectorId, s.slotId, '2026-09')));
  const cov = monthCoverage({ today: '2026-11-25', reports, from: '2026-09' })[0];
  assert.equal(cov.state, 'partial');
  const fix = slotProblems({ today: '2026-11-25', reports, from: '2026-09' }).filter((p) => p.period === '2026-09' && p.slot.required);
  assert.deepEqual(cov.missing.filter((m) => m.required).map((m) => m.detail), fix.map((p) => p.detail));
});

test('a locked month shows as locked', () => {
  const cov = monthCoverage({ today: '2026-11-25', reports: [], from: '2026-09', locked: new Set(['2026-09']) });
  assert.equal(cov[0].state, 'locked');
  assert.equal(cov[1].state, 'none');
});
