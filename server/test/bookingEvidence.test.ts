// Book an invoice: party match (GSTIN, name, a case in words), the evidence from the stored Day Books, the FY total,
// the ledger check of the answer and the invoice reader's sanitising. Synthetic data only (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence, checkLedgers, evidenceText, findParty, fyStart, partyInText } from '../src/services/bookingEvidence.js';
import { normaliseInvoice } from '../src/services/bookingInvoice.js';
import type { TallyLedger, TallyVoucher } from '../src/connectors/tally/books.js';

const L = (name: string, group: string, primary: string, gstin = '', tds = ''): TallyLedger => ({
  name, group, primary, gstin, registration: gstin ? 'Regular' : '', state: gstin ? 'Haryana' : '', pan: '', opening: 0, billWise: true, tds,
  gstApplicable: '', taxType: '', dutyHead: '',
});
const masters = {
  ledgers: [
    L('Acme Logistics Pvt Ltd', 'Sundry Creditors', 'Sundry Creditors', '06ABCDE1234F1Z5'),
    L('Brightpath Media LLP', 'Sundry Creditors', 'Sundry Creditors', '', '194J'),
    L('Courier Charges', 'Indirect Expenses', 'Indirect Expenses'),
    L('Input IGST', 'Duties & Taxes', 'Duties & Taxes'),
    L('TDS Payable 194C', 'Duties & Taxes', 'Duties & Taxes'),
    L('Advertisement', 'Indirect Expenses', 'Indirect Expenses'),
  ],
};
let n = 0;
const V = (date: string, type: string, party: string, lines: [string, number][], narration = '', extra: Partial<TallyVoucher> = {}): TallyVoucher => ({
  guid: `g${++n}`, date, type, number: String(n), party, reference: `INV-${n}`, referenceDate: date, narration, partyGstin: '',
  cancelled: false, optional: false, lines: lines.map(([ledger, amount]) => ({ ledger, amount })), inventory: [], ...extra,
});
const vouchers: TallyVoucher[] = [
  V('2026-05-10', 'Purchase-Expense', 'Acme Logistics Pvt Ltd', [['Courier Charges', 10000], ['Input IGST', 1800], ['TDS Payable 194C', -200], ['Acme Logistics Pvt Ltd', -11600]], 'courier bill May'),
  V('2026-09-12', 'Purchase-Expense', 'Acme Logistics Pvt Ltd', [['Courier Charges', 20000], ['Input IGST', 3600], ['TDS Payable 194C', -400], ['Acme Logistics Pvt Ltd', -23200]], 'courier bill Sep'),
  V('2026-09-20', 'Payment', 'Acme Logistics Pvt Ltd', [['Acme Logistics Pvt Ltd', 23200], ['HDFC Bank', -23200]]),
  V('2026-03-15', 'Purchase-Expense', 'Acme Logistics Pvt Ltd', [['Courier Charges', 5000], ['Acme Logistics Pvt Ltd', -5000]], 'last FY'),
  V('2026-10-01', 'Purchase-Expense', 'Acme Logistics Pvt Ltd', [['Courier Charges', 999], ['Acme Logistics Pvt Ltd', -999]], 'cancelled', { cancelled: true }),
  V('2026-08-02', 'Journal', 'Brightpath Media LLP', [['Advertisement', 50000], ['Brightpath Media LLP', -50000]], 'shoot for reels'),
];

test('findParty: GSTIN first, then the name without Pvt / Ltd', () => {
  assert.equal(findParty(masters, 'Someone Else', '06abcde1234f1z5')?.name, 'Acme Logistics Pvt Ltd');
  assert.equal(findParty(masters, 'Someone Else', '06abcde1234f1z5')?.how, 'gstin');
  const byName = findParty(masters, 'ACME LOGISTICS PRIVATE LIMITED');
  assert.equal(byName?.name, 'Acme Logistics Pvt Ltd');
  assert.equal(byName?.how, 'name');
  assert.equal(findParty(masters, 'Unknown Traders'), null);
  assert.equal(findParty(masters, 'Courier'), null, 'an expense ledger is never a party');
});

test('partyInText: a party named in a typed case', () => {
  assert.equal(partyInText(masters, 'We paid Brightpath Media an advance of 50,000')?.name, 'Brightpath Media LLP');
  assert.equal(partyInText(masters, 'How do I book a provision for audit fees?'), null);
});

test('fyStart: 1 April', () => {
  assert.equal(fyStart('2026-03-31'), '2025-04-01');
  assert.equal(fyStart('2026-04-01'), '2026-04-01');
});

test('buildEvidence: party vouchers newest first, FY total of bills only, TDS ledgers, cancelled left out', () => {
  const e = buildEvidence({
    vouchers, masters, periods: ['2026-03', '2026-10'], question: 'How do I book this?', today: '2026-11-23',
    invoice: { vendor: 'Acme Logistics', vendorGstin: '06ABCDE1234F1Z5', invoiceDate: '2026-11-05', total: 5900 },
  });
  assert.equal(e.party?.name, 'Acme Logistics Pvt Ltd');
  assert.deepEqual(e.partyVouchers.map((v) => v.date), ['2026-09-20', '2026-09-12', '2026-05-10', '2026-03-15']);
  assert.deepEqual(e.fy, { from: '2026-04-01', total: 34800, count: 2 }, 'payments and last FY are not bills of this FY');
  assert.deepEqual(e.tdsLedgersUsed, ['TDS Payable 194C']);
  const t = evidenceText(e, { vendor: 'Acme Logistics' });
  assert.match(t, /Party ledger in Tally: "Acme Logistics Pvt Ltd"/);
  assert.match(t, /₹34,800\.00 credited/);
});

test('evidenceText: unknown vendor asks for a new party; a typed case does not', () => {
  const unknown = buildEvidence({ vouchers, masters, periods: [], question: 'book it', today: '2026-11-23', invoice: { vendor: 'New Vendor Co' } });
  assert.equal(unknown.party, null);
  assert.match(evidenceText(unknown, { vendor: 'New Vendor Co' }), /NOT FOUND/);
  const typed = buildEvidence({ vouchers, masters, periods: [], question: 'month-end provision for rent', today: '2026-11-23' });
  assert.doesNotMatch(evidenceText(typed, null), /NOT FOUND/);
});

test('checkLedgers: names in Dr / Cr tables that Tally does not have; "(new)" is a proposal', () => {
  const reply = [
    '| Dr/Cr | Ledger | Amount | Note |',
    '|---|---|---|---|',
    '| Dr | Courier Charges | 10,000.00 | freight |',
    '| Dr | **Input IGST** | 1,800.00 | |',
    '| Cr | TDS Payable 194C | 200.00 | |',
    '| Cr | Acme Logistic | 11,600.00 | party |',
    '| Dr | Software Subscriptions (new) | 5,000.00 | |',
    '| Dr | Prepaid Expenses | 1,000.00 | create this ledger first |',
  ].join('\n');
  assert.deepEqual(checkLedgers(reply, masters), { missing: ['Acme Logistic'], checked: 4 });
  assert.deepEqual(checkLedgers(reply, { ledgers: [] }), { missing: [], checked: 0 });
});

test('normaliseInvoice: numbers from strings, GSTIN upper case, bad dates and junk dropped', () => {
  const f = normaliseInvoice({ vendor: ' Acme ', vendorGstin: '06abcde1234f1z5', invoiceDate: '05/11/2026', taxable: '10,000.00', igst: 1800, total: '₹11,800', evil: 'x', lines: [{ description: 'Freight', amount: '10000' }, {}] });
  assert.equal(f?.vendor, 'Acme');
  assert.equal(f?.vendorGstin, '06ABCDE1234F1Z5');
  assert.equal(f?.invoiceDate, undefined);
  assert.equal(f?.taxable, 10000);
  assert.equal(f?.total, 11800);
  assert.equal(f?.lines?.length, 1);
  assert.equal((f as Record<string, unknown>).evil, undefined);
  assert.equal(normaliseInvoice({}), null);
  assert.equal(normaliseInvoice('text'), null);
});
