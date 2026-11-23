// TDS to claim back: platform bills with TDS, paid-in-full parties, refunds booked, marked claims, TDS deducted from us.
// Synthetic parties and numbers only (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaims, certFrom, quarterLabel, quarterOf, sanitizeClaim } from '../src/services/tdsClaims.ts';
import type { TallyLedger, TallyVoucher } from '../src/connectors/tally/books.ts';

const L = (name: string, group: string, primary: string, opening = 0): TallyLedger => ({ name, group, primary, gstin: '', registration: '', state: '', pan: '', opening, billWise: false, tds: '', gstApplicable: '', taxType: '', dutyHead: '' });
const LEDGERS = [
  L('Meta Ads (Direct)', 'Indirect Expenses', 'Indirect Expenses'), L('Google Ads', 'Indirect Expenses', 'Indirect Expenses'),
  L('Freight Outward', 'Indirect Expenses', 'Indirect Expenses'), L('Repairs', 'Indirect Expenses', 'Indirect Expenses'),
  L('Facebook India Online Services Private Limited', 'Service Creditors', 'Current Liabilities'),
  L('Google India Pvt Ltd', 'Service Creditors', 'Current Liabilities'), L('Demo Movers', 'Service Creditors', 'Current Liabilities'),
  L('Demo Repairs', 'Service Creditors', 'Current Liabilities'),
  L('TDS Payable - 194C (Contractors)', 'TDS Payable', 'Current Liabilities'), L('IGST Input - 18%', 'GST Input', 'Current Liabilities'),
  L('TDS (Amazon)', 'TDS Receivable', 'Current Assets'), L('TDS Reimbursement From Parties', 'TDS Receivable', 'Current Assets', 494258),
  L('ICICI Bank', 'Bank Accounts', 'Bank Accounts'), L('Amazon Seller A/c', 'Sundry Debtors', 'Current Assets'),
];
let n = 0;
const V = (p: Partial<TallyVoucher> & { lines: TallyVoucher['lines'] }): TallyVoucher => ({ guid: `g${++n}`, date: '2026-07-10', type: 'Purchase-Expense', number: String(n), party: '', reference: `R${n}`, referenceDate: '', narration: '', partyGstin: '', cancelled: false, optional: false, inventory: [], ...p });
// bill 10,000 + 18% GST, TDS 2% = 200
const bill = (party: string, ledger: string, date: string) => V({ party, date, lines: [
  { ledger: party, amount: -11600 }, { ledger, amount: 10000 }, { ledger: 'IGST Input - 18%', amount: 1800 }, { ledger: 'TDS Payable - 194C (Contractors)', amount: -200 }] });

test('quarters and certificate dates', () => {
  assert.equal(quarterOf('2026-07-10'), '2026-Q2');
  assert.equal(quarterOf('2027-02-01'), '2026-Q4');
  assert.equal(quarterLabel('2026-Q4'), 'Q4 Jan–Mar 2027');
  assert.equal(certFrom('2026-Q2'), '2026-11-15');
  assert.equal(certFrom('2026-Q4'), '2027-06-15');
});

test('named platforms: TDS per quarter, ready after the certificate date, refunds booked and marked', () => {
  const vs = [
    bill('Facebook India Online Services Private Limited', 'Meta Ads (Direct)', '2026-07-10'),
    bill('Facebook India Online Services Private Limited', 'Meta Ads (Direct)', '2026-10-10'),
    bill('Google India Pvt Ltd', 'Google Ads', '2026-08-01'),
    V({ type: 'Journal', date: '2026-09-30', party: 'Google India Pvt Ltd', narration: 'TDS refund received as ad credit', lines: [{ ledger: 'Google India Pvt Ltd', amount: 200 }, { ledger: 'TDS Reimbursement From Parties', amount: -200 }] }),
  ];
  const r = buildClaims({ fy: 2026, vouchers: vs, ledgers: LEDGERS, today: '2026-11-23', records: { 'meta|2026-Q3': { status: 'claimed', on: '2026-11-20', ref: 'case 1', amount: null, by: null, at: '' } } });
  const meta = r.platforms.find((p) => p.id === 'meta')!;
  assert.equal(meta.deducted, 400);
  assert.deepEqual(meta.quarters.map((q) => [q.quarter, q.state]), [['2026-Q2', 'ready'], ['2026-Q3', 'claimed']]);
  assert.equal(meta.readyNow, 200);
  const g = r.platforms.find((p) => p.id === 'google')!;
  assert.equal(g.received, 200);
  assert.equal(g.pending, 0);
  assert.equal(g.quarters[0].state, 'received');
  assert.equal(r.totals.pending, 400);
  assert.deepEqual(r.older, [{ ledger: 'TDS Reimbursement From Parties', opening: 494258 }]);
});

test('other parties show only when paid in full; Q waits before the certificate date', () => {
  const movers = bill('Demo Movers', 'Freight Outward', '2026-10-05');
  const repairs = bill('Demo Repairs', 'Repairs', '2026-10-06');
  const payFull = V({ type: 'Payment', date: '2026-10-07', party: 'Demo Movers', lines: [{ ledger: 'Demo Movers', amount: 11800 }, { ledger: 'ICICI Bank', amount: -11800 }] });
  const payNet = V({ type: 'Payment', date: '2026-10-08', party: 'Demo Repairs', lines: [{ ledger: 'Demo Repairs', amount: 11600 }, { ledger: 'ICICI Bank', amount: -11600 }] });
  const r = buildClaims({ fy: 2026, vouchers: [movers, repairs, payFull, payNet], ledgers: LEDGERS, today: '2026-11-23' });
  assert.deepEqual(r.platforms.map((p) => p.id), ['other:demo movers']);
  assert.equal(r.platforms[0].quarters[0].state, 'wait');
});

test('TDS deducted from us (Amazon 194-O) is a credit for the tax return, not a claim', () => {
  const v = V({ type: 'Amazon TDS-TCS', party: 'Amazon Seller A/c', date: '2026-05-10', lines: [{ ledger: 'TDS (Amazon)', amount: 335 }, { ledger: 'Amazon Seller A/c', amount: -335 }] });
  const r = buildClaims({ fy: 2026, vouchers: [v], ledgers: LEDGERS, today: '2026-11-23' });
  assert.equal(r.platforms[0].kind, 'credit');
  assert.equal(r.platforms[0].id, 'credit:amazon');
  assert.equal(r.totals.credit, 335);
  assert.equal(r.totals.pending, 0);
});

test('claim records are checked', () => {
  assert.equal(sanitizeClaim({ status: 'clear' }, null, '2026-11-23T00:00:00Z'), null);
  assert.ok('error' in (sanitizeClaim({ status: 'paid' }, null, '') as object));
  const ok = sanitizeClaim({ status: 'received', amount: 199.999, ref: ' credit note 7 ' }, 'a@b', '2026-11-23T10:00:00Z') as { amount: number; ref: string; on: string };
  assert.equal(ok.amount, 200); assert.equal(ok.ref, 'credit note 7'); assert.equal(ok.on, '2026-11-23');
});
