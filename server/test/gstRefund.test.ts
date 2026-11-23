// GST refund (inverted duty, Rule 89(5) from 1 Nov 2026): sorting, scanner, 2B match, calculation, ties, AI answer parsing.
// Synthetic parties, GSTINs and numbers only (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRefundMonth, drift, gstinValid, ledgerRate, ownerState, sanitizeRules, sanitizeTwoB, type InwardDoc } from '../src/services/gstRefund.ts';
import { parseAi } from '../src/services/gstRefundAi.ts';

import type { TallyLedger, TallyVoucher } from '../src/connectors/tally/books.ts';

const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstin = (state: string, pan: string) => { const b = `${state}${pan}1Z`; const c = [...CH].find((x) => gstinValid(b + x))!; return b + c; };
const UP = gstin('09', 'AAAPA1111A'); // same state as the factory
const DL = gstin('07', 'BBBPB2222B'); // another state
const UP2 = gstin('09', 'CCCPC3333C');
const BUYER = gstin('27', 'DDDPD4444D');

const L = (name: string, group: string, primary: string, extra: Partial<TallyLedger> = {}): TallyLedger => ({ name, group, primary, gstin: '', registration: '', state: '', pan: '', opening: 0, billWise: false, tds: '', gstApplicable: '', taxType: '', dutyHead: '', ...extra });
const LEDGERS: TallyLedger[] = [
  L('Raw Material Purchase', 'Purchase Accounts', 'Purchase Accounts'),
  L('Advertisement', 'Indirect Expenses', 'Indirect Expenses'),
  L('Packing Material', 'Direct Expenses', 'Direct Expenses'),
  L('Staff Welfare', 'Indirect Expenses', 'Indirect Expenses'),
  L('Plant & Machinery', 'Fixed Assets', 'Fixed Assets'),
  L('Domestic Sales', 'Sales Accounts', 'Sales Accounts'),
  L('Demo Fabrics', 'Sundry Creditors', 'Sundry Creditors', { gstin: UP }),
  L('Demo Ads', 'Sundry Creditors', 'Sundry Creditors', { gstin: DL }),
  L('Demo Buyer', 'Sundry Debtors', 'Sundry Debtors', { gstin: BUYER }),
  L('CGST Input - 9%', 'GST Input', 'Current Liabilities'), L('SGST Input - 9%', 'GST Input', 'Current Liabilities'),
  L('IGST Input - 18%', 'GST Input', 'Current Liabilities'), L('IGST Output - 5%', 'GST Output', 'Current Liabilities'),
  L('CGST Output - 2.5%', 'GST Output', 'Current Liabilities'), L('SGST Output - 2.5%', 'GST Output', 'Current Liabilities'),
];

let n = 0;
const V = (p: Partial<TallyVoucher> & { lines: TallyVoucher['lines'] }): TallyVoucher => ({
  guid: `g${++n}`, date: '2026-11-10', type: 'Purchase', number: String(n), party: '', reference: `INV-${n}`, referenceDate: '2026-11-10',
  narration: '', partyGstin: '', cancelled: false, optional: false, inventory: [], ...p,
});
// goods at 18% intra-state: taxable 100,000, GST 18,000
const goods = () => V({ party: 'Demo Fabrics', narration: 'Po No: PO00100, Invoice No: F-1', lines: [
  { ledger: 'Demo Fabrics', amount: -118000 }, { ledger: 'Raw Material Purchase', amount: 100000 }, { ledger: 'CGST Input - 9%', amount: 9000 }, { ledger: 'SGST Input - 9%', amount: 9000 }] });
// service at 18% inter-state: taxable 50,000, GST 9,000
const ads = () => V({ type: 'Purchase-Expense', party: 'Demo Ads', lines: [
  { ledger: 'Demo Ads', amount: -59000 }, { ledger: 'Advertisement', amount: 50000 }, { ledger: 'IGST Input - 18%', amount: 9000 }] });
// sale at 5% inter-state B2B: taxable 400,000, GST 20,000
const sale = (taxable = 400000) => V({ type: 'Sales', party: 'Demo Buyer', reference: '', lines: [
  { ledger: 'Demo Buyer', amount: taxable * 1.05 }, { ledger: 'Domestic Sales', amount: -taxable }, { ledger: 'IGST Output - 5%', amount: -taxable * 0.05 }] });

test('GSTIN check digit and ledger rate', () => {
  assert.ok(gstinValid(UP) && gstinValid(DL));
  assert.equal(gstinValid(UP.slice(0, 14) + (UP[14] === 'A' ? 'B' : 'A')), false);
  assert.equal(ledgerRate('CGST Input - 9%'), 18);
  assert.equal(ledgerRate('IGST 5.00%'), 5);
  assert.equal(ledgerRate('CGST 2.500%'), 5);
});

test('vouchers of other GSTINs are left out; the home GSTIN keeps unsuffixed and home-state vouchers', () => {
  const branch = V({ type: 'Sales-Amazon-HARYANA', lines: [] });
  const home = V({ type: 'Purchase-STR-UTTAR PRADESH', lines: [] });
  assert.equal(ownerState(branch), 'HARYANA');
  assert.equal(ownerState(home), 'UTTAR PRADESH');
  assert.equal(ownerState(V({ type: 'Sales', lines: [{ ledger: 'CGST Output-KARNATAKA', amount: -1 }] })), 'KARNATAKA');
  const r = buildRefundMonth({ month: '2026-11', vouchers: [goods(), sale(), branch], ledgers: LEDGERS, today: '2026-12-10' });
  assert.equal(r.counts.otherGstins, 1);
  assert.equal(r.outward.length, 1);
});

test('Rule 89(5): goods + services from November, formula, ties', () => {
  const r = buildRefundMonth({ month: '2026-11', vouchers: [goods(), ads(), sale()], ledgers: LEDGERS, today: '2026-12-10' });
  assert.equal(r.calc.itcInputs, 18000);
  assert.equal(r.calc.itcServices, 9000);
  assert.equal(r.calc.netItc, 27000);
  assert.deepEqual(r.calc.invertedRates, [5]);
  assert.equal(r.calc.invertedTurnover, 400000);
  assert.equal(r.calc.adjustedTurnover, 400000);
  assert.equal(r.calc.taxPayable, 20000);
  assert.equal(r.calc.maxRefund, 7000); // 400000 × 27000 ÷ 400000 − 20000
  assert.ok(r.ties.every((t) => t.ok), JSON.stringify(r.ties));
  const goodsDoc = r.inward.find((d) => d.party === 'Demo Fabrics')!;
  assert.equal(goodsDoc.cls, 'input');
  assert.equal(r.inward.find((d) => d.party === 'Demo Ads')!.cls, 'service');
  assert.equal(r.outward[0].supplyType, 'B2B');
});

test('services before 1 Nov 2026 are left out; ECL balance caps the claim', () => {
  const g = goods(); g.date = '2026-10-10'; g.referenceDate = '2026-10-10';
  const a = ads(); a.date = '2026-10-12'; a.referenceDate = '2026-10-12';
  const s = sale(); s.date = '2026-10-20';
  const r = buildRefundMonth({ month: '2026-10', vouchers: [g, a, s], ledgers: LEDGERS, today: '2026-11-10', ecl: 1000 });
  assert.equal(r.calc.itcServices, 0);
  assert.equal(r.calc.servicesLeftOut, 9000);
  assert.equal(r.calc.maxRefund, 0); // 18000 − 20000 < 0
  assert.ok(r.notReady.some((x) => /November 2026/.test(x)));
  const nov = buildRefundMonth({ month: '2026-11', vouchers: [goods(), ads(), sale()], ledgers: LEDGERS, today: '2026-12-10', ecl: 5000 });
  assert.equal(nov.calc.claim, 5000);
});

test('no inversion when inputs are not above the output rate', () => {
  const g = V({ party: 'Demo Fabrics', lines: [{ ledger: 'Demo Fabrics', amount: -105000 }, { ledger: 'Raw Material Purchase', amount: 100000 }, { ledger: 'CGST Input - 2.5%', amount: 2500 }, { ledger: 'SGST Input - 2.5%', amount: 2500 }] });
  const r = buildRefundMonth({ month: '2026-11', vouchers: [g, sale()], ledgers: LEDGERS, today: '2026-12-10' });
  assert.deepEqual(r.calc.invertedRates, []);
  assert.equal(r.calc.maxRefund, 0);
});

test('capital goods, blocked credits, stock transfers and RCM stay out, with the reason', () => {
  const cap = V({ party: 'Demo Fabrics', lines: [{ ledger: 'Demo Fabrics', amount: -59000 }, { ledger: 'Plant & Machinery', amount: 50000 }, { ledger: 'CGST Input - 9%', amount: 4500 }, { ledger: 'SGST Input - 9%', amount: 4500 }] });
  const food = V({ type: 'Purchase-Expense', party: 'Demo Fabrics', lines: [{ ledger: 'Demo Fabrics', amount: -1180 }, { ledger: 'Staff Welfare', amount: 1000 }, { ledger: 'CGST Input - 9%', amount: 90 }, { ledger: 'SGST Input - 9%', amount: 90 }] });
  const str = V({ type: 'Purchase-STR-UTTAR PRADESH', party: 'Amazon Stock Transfer', partyGstin: BUYER, lines: [{ ledger: 'Amazon Stock Transfer', amount: -10500 }, { ledger: 'Raw Material Purchase', amount: 10000 }, { ledger: 'IGST Input - 18%', amount: 500 }] });
  const r = buildRefundMonth({ month: '2026-11', vouchers: [cap, food, str, goods(), sale()], ledgers: LEDGERS, today: '2026-12-10' });
  const by = (p: (d: InwardDoc) => boolean) => r.inward.find(p)!;
  assert.equal(by((d) => d.ledgers.includes('Plant')).cls, 'capital');
  assert.match(by((d) => d.ledgers.includes('Plant')).leftOut, /1 Apr 2027/);
  assert.equal(by((d) => d.ledgers.includes('Staff Welfare')).cls, 'blocked');
  assert.equal(by((d) => d.vType.startsWith('Purchase-STR')).cls, 'stock-transfer');
  assert.equal(r.calc.netItc, 18000);
  assert.ok(r.issues.some((i) => i.code === 'blocked'));
});

test('scanner: wrong tax type, missing invoice no., duplicates, tax over value; errors leave the claim', () => {
  const wrong = V({ party: 'Demo Fabrics', lines: [{ ledger: 'Demo Fabrics', amount: -118000 }, { ledger: 'Raw Material Purchase', amount: 100000 }, { ledger: 'IGST Input - 18%', amount: 18000 }] });
  const noInv = goods(); noInv.reference = '';
  const d1 = goods(); d1.reference = 'X-9'; const d2 = goods(); d2.reference = 'X/9';
  const r = buildRefundMonth({ month: '2026-11', vouchers: [wrong, noInv, d1, d2, sale()], ledgers: LEDGERS, today: '2026-12-10' });
  const codes = r.issues.map((i) => i.code);
  assert.ok(codes.includes('wrong-tax-type'));
  assert.ok(codes.includes('no-invoice'));
  assert.ok(codes.includes('duplicate'));
  assert.ok(r.issues.every((i) => i.fix.length > 0));
  assert.equal(r.inward.find((d) => d.guid === wrong.guid)!.eligible, false);
  assert.equal(r.ready, false);
});

test('GSTR-2B: bills not in 2B leave the claim; 2B bills not in Tally are listed', () => {
  const g = goods(); const a = ads();
  const twoB = { month: '2026-11', uploadedAt: '', by: null, file: '2b.xlsx', rows: [
    { gstin: UP, invoice: g.reference, date: '2026-11-10', taxable: 100000, igst: 0, cgst: 9000, sgst: 9000 },
    { gstin: UP2, invoice: 'Z-1', date: '2026-11-11', taxable: 1000, igst: 0, cgst: 90, sgst: 90 },
  ] };
  const r = buildRefundMonth({ month: '2026-11', vouchers: [g, a, sale()], ledgers: LEDGERS, today: '2026-12-10', twoB });
  assert.equal(r.inward.find((d) => d.guid === g.guid)!.in2b, true);
  assert.equal(r.inward.find((d) => d.guid === a.guid)!.in2b, false);
  assert.equal(r.calc.netItc, 18000);
  assert.equal(r.twoB.notInTally.length, 1);
  assert.ok(r.issues.some((i) => i.code === 'not-in-2b') && r.issues.some((i) => i.code === '2b-not-booked'));
});

test('a saved rule wins over the signals', () => {
  const a = ads();
  const r = buildRefundMonth({ month: '2026-11', vouchers: [a, sale()], ledgers: LEDGERS, today: '2026-12-10', rules: sanitizeRules({ parties: { 'DEMO ADS': 'blocked' } }) });
  assert.equal(r.inward[0].cls, 'blocked');
  assert.equal(r.inward[0].ruled, true);
});

test('packing material in an expense ledger counts as goods; B2C large vs small', () => {
  const pack = V({ type: 'Purchase-Expense', party: 'Demo Fabrics', lines: [{ ledger: 'Demo Fabrics', amount: -11800 }, { ledger: 'Packing Material', amount: 10000 }, { ledger: 'CGST Input - 9%', amount: 900 }, { ledger: 'SGST Input - 9%', amount: 900 }] });
  const b2cl = V({ type: 'Sales', party: 'Cash Sale', reference: '', lines: [{ ledger: 'Cash Sale', amount: 210000 }, { ledger: 'Domestic Sales', amount: -200000 }, { ledger: 'IGST Output - 5%', amount: -10000 }] });
  const b2cs = V({ type: 'Sales', party: 'Cash Sale', reference: '', lines: [{ ledger: 'Cash Sale', amount: 1050 }, { ledger: 'Domestic Sales', amount: -1000 }, { ledger: 'CGST Output - 2.5%', amount: -25 }, { ledger: 'SGST Output - 2.5%', amount: -25 }] });
  const r = buildRefundMonth({ month: '2026-11', vouchers: [pack, b2cl, b2cs], ledgers: LEDGERS, today: '2026-12-10' });
  assert.equal(r.inward[0].cls, 'input');
  assert.deepEqual(r.outward.map((o) => o.supplyType), ['B2C-Large', 'B2C-Small']);
});

test('2B sanitizer, AI answer parser, drift after filing', () => {
  assert.ok('error' in sanitizeTwoB({ rows: [] }, '2026-11', null, ''));
  const ok = sanitizeTwoB({ rows: [{ gstin: UP.toLowerCase(), invoice: ' A-1 ', date: '2026-11-02', cgst: 9, sgst: 9 }] }, '2026-11', null, '');
  assert.ok(!('error' in ok) && ok.rows[0].gstin === UP && ok.rows[0].invoice === 'A-1');
  const ai = parseAi('Here: [{"key":"k1","cls":"service","why":"ads","confidence":"high"},{"key":"zz","cls":"input"},{"key":"k2","cls":"rcm"}]', new Set(['k1', 'k2']));
  assert.deepEqual(ai.map((x) => x.key), ['k1']);
  const r = buildRefundMonth({ month: '2026-11', vouchers: [goods(), sale()], ledgers: LEDGERS, today: '2026-12-10' });
  const d = drift(r, { arn: 'AA0911260000001', filedOn: '2026-12-15', amount: 0, by: null, at: '', snapshot: { netItc: 9000, maxRefund: 0, inward: { gone: 9000 }, outward: 1 } })!;
  assert.equal(d.removed[0], 'gone');
  assert.equal(d.added.length, 1);
  assert.equal(d.diff, 9000);
});
