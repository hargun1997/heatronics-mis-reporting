// Audit views over stored Day Books: ledger statement, purchase register + class, TDS check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, ledgerStatement, monthsBetween, register, tdsCheck } from '../src/connectors/tally/audit.js';
import type { TallyLedger, TallyMasters, TallyVoucher } from '../src/connectors/tally/books.js';

const L = (name: string, group: string, primary: string, opening = 0, tds = ''): TallyLedger => ({ name, group, primary, gstin: '', registration: '', state: '', pan: '', opening, billWise: false, tds, gstApplicable: '', taxType: '', dutyHead: '' });
const V = (o: Partial<TallyVoucher>): TallyVoucher => ({ guid: '', date: '2026-04-05', type: 'Purchase', number: '1', party: '', reference: '', referenceDate: '', narration: '', partyGstin: '', cancelled: false, optional: false, lines: [], inventory: [], ...o });
const masters: TallyMasters = {
  ledgers: [
    L('HDFC Bank', 'Bank Accounts', 'Current Assets', 2000),
    L('SB Electronics', 'Sundry Creditors', 'Current Liabilities'),
    L('Raw Material Purchase', 'Purchase Accounts', 'Purchase Accounts'),
    L('Plant & Machinery', 'Fixed Assets', 'Fixed Assets'),
    L('Professional Fees', 'Indirect Expenses', 'Indirect Expenses'),
    L('CA Firm', 'Sundry Creditors', 'Current Liabilities', 0, '194J'),
    L('Input IGST', 'Duties & Taxes', 'Current Liabilities'),
    L('TDS Payable - 194J', 'Duties & Taxes', 'Current Liabilities'),
  ], groups: [], stockItems: [], warnings: [],
};
const vouchers = [
  V({ number: 'P1', party: 'SB Electronics', partyGstin: '09AAA', lines: [{ ledger: 'SB Electronics', amount: -11800 }, { ledger: 'Raw Material Purchase', amount: 10000 }, { ledger: 'Input IGST', amount: 1800 }], inventory: [{ item: 'PCB', qty: 10, rate: '1000', amount: 10000 }] }),
  V({ number: 'P2', date: '2026-04-10', party: 'SB Electronics', lines: [{ ledger: 'SB Electronics', amount: -59000 }, { ledger: 'Plant & Machinery', amount: 50000 }, { ledger: 'Input IGST', amount: 9000 }] }),
  V({ number: 'J1', type: 'Journal', date: '2026-04-20', party: 'CA Firm', lines: [{ ledger: 'CA Firm', amount: -45000 }, { ledger: 'Professional Fees', amount: 50000 }, { ledger: 'TDS Payable - 194J', amount: -5000 }] }),
  V({ number: 'B1', type: 'Payment', date: '2026-04-25', lines: [{ ledger: 'SB Electronics', amount: 11800 }, { ledger: 'HDFC Bank', amount: -11800 }] }),
  V({ number: 'X', cancelled: true, lines: [{ ledger: 'HDFC Bank', amount: 999 }] }),
];
const byName = new Map(masters.ledgers.map((l) => [l.name.toLowerCase(), l]));

test('ledgerStatement: opening + running balance, cancelled skipped', () => {
  const s = ledgerStatement(vouchers, byName.get('hdfc bank'), 'HDFC Bank');
  assert.equal(s.opening, 2000);
  assert.equal(s.rows.length, 1);
  assert.deepEqual([s.rows[0].cr, s.rows[0].balance, s.closing], [11800, -9800, -9800]);
  assert.equal(s.rows[0].against, 'SB Electronics');
});

test('classify + register: raw material, capital goods, services with GST split', () => {
  assert.equal(classify(vouchers[0], byName, 'SB Electronics').cls, 'Raw material');
  assert.equal(classify(vouchers[1], byName, 'SB Electronics').cls, 'Capital goods');
  const r = register(vouchers, masters, 'purchase');
  assert.equal(r.rows.length, 2);
  assert.deepEqual([r.rows[0].taxable, r.rows[0].igst, r.rows[0].total, r.rows[0].gstin], [10000, 1800, 11800, '09AAA']);
  assert.equal(r.totals.taxable, 60000);
  assert.equal(register(vouchers, masters, 'purchase', 'Capital goods').rows.length, 1);
});

test('tdsCheck: booked vs not, with implied rate', () => {
  const t = tdsCheck(vouchers, masters);
  const j = t.rows.find((x) => x.number === 'J1')!;
  assert.deepEqual([j.flag, j.tdsBooked, j.ratePct, j.partyTds], ['TDS booked', 5000, 10, '194J']);
  assert.equal(t.rows.find((x) => x.number === 'P2')?.flag, 'party has no TDS nature');
  assert.equal(t.summary.booked, 1);
});

test('monthsBetween: inclusive, crosses the year', () => {
  assert.deepEqual(monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});
