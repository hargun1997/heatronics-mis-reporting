// Tally opening balances (mis_get_tally_opening): Dr / Cr sides, totals by primary group, difference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openingReport } from '../src/connectors/tally/opening.js';
import type { TallyLedger } from '../src/connectors/tally/books.js';

const L = (name: string, group: string, primary: string, opening: number): TallyLedger => ({ name, group, primary, gstin: '', registration: '', state: '', pan: '', opening, billWise: false, tds: '', gstApplicable: '', taxType: '', dutyHead: '' });
const ledgers = [
  L('CARE INDIA SURGICALS', 'Sundry Creditors', 'Sundry Creditors', 661217),
  L('Central Bank OD', 'Bank OD A/c', 'Bank OD A/c', -7890995.62),
  L('Cash', 'Cash-in-Hand', 'Cash-in-Hand', 72136),
  L('Unused', 'Indirect Expenses', 'Indirect Expenses', 0),
];

test('openingReport: sides, totals and difference', () => {
  const r = openingReport(ledgers);
  assert.equal(r.ledgersWithOpening, 3);
  assert.equal(r.ledgersTotal, 4);
  assert.equal(r.totalDr, 733353);
  assert.equal(r.totalCr, 7890995.62);
  assert.equal(r.difference, -7157642.62);
  assert.deepEqual(r.rows[0], { ledger: 'Central Bank OD', group: 'Bank OD A/c', primary: 'Bank OD A/c', side: 'Cr', amount: 7890995.62, gstin: '' });
  assert.equal(r.rows.find((x) => x.ledger === 'CARE INDIA SURGICALS')?.side, 'Dr');
});

test('openingReport: filters by search word and group; all=true keeps zero ledgers', () => {
  assert.deepEqual(openingReport(ledgers, { q: 'care' }).rows.map((x) => x.ledger), ['CARE INDIA SURGICALS']);
  assert.deepEqual(openingReport(ledgers, { group: 'sundry creditors' }).rows.map((x) => x.ledger), ['CARE INDIA SURGICALS']);
  assert.equal(openingReport(ledgers, { all: true }).rows.length, 4);
  assert.equal(openingReport(ledgers).byPrimary[0].primary, 'Bank OD A/c');
});
