// One day on request + half-read months (14 Nov 2026). Synthetic vouchers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePartial } from '../src/connectors/tally/bookStore.js';
import type { TallyVoucher } from '../src/connectors/tally/books.js';

const v = (date: string, number: string, ledger = 'Sales A'): TallyVoucher => ({
  guid: `${date}-${number}`, date, type: 'Sales', number, party: 'Cust', reference: '', referenceDate: '', narration: '', partyGstin: '',
  cancelled: false, optional: false, lines: [{ ledger, amount: 100 }] as TallyVoucher['lines'], inventory: [],
});

test('no partial: stored month unchanged', () => {
  const stored = [v('2026-08-01', '1')];
  assert.deepEqual(mergePartial(stored, null), { vouchers: stored, freshDays: [] });
});

test('a half-read day replaces the stored copy of that day (fresher)', () => {
  const stored = [v('2026-08-26', '1', 'Amazon Sales'), v('2026-08-27', '2')];
  const part = { days: ['20260826'], vouchers: [v('2026-08-26', '1', 'Shopify Sales')] };
  const r = mergePartial(stored, part);
  assert.deepEqual(r.freshDays, ['20260826']);
  assert.equal(r.vouchers.length, 2);
  assert.equal(r.vouchers.find((x) => x.number === '1')!.lines[0].ledger, 'Shopify Sales');
});

test('a day that came back empty never hides the stored vouchers of that day', () => {
  const stored = [v('2026-08-26', '1')];
  const part = { days: ['20260826'], vouchers: [] };
  const r = mergePartial(stored, part);
  assert.equal(r.vouchers.length, 1);
  assert.deepEqual(r.freshDays, []);
});

test('days not stored yet are added, sorted by date', () => {
  const r = mergePartial([], { days: ['20261020', '20261001'], vouchers: [v('2026-10-20', 'b'), v('2026-10-01', 'a')] });
  assert.deepEqual(r.vouchers.map((x) => x.number), ['a', 'b']);
  assert.deepEqual(r.freshDays, ['20261001', '20261020']);
});
