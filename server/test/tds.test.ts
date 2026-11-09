// TDS planning — engine (client/src/data/tds/tds.ts), export layout (tdsFormats.ts), server feed (services/tdsFeed.ts) and
// the calendar tasks. Synthetic vouchers / parties only (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTds, depositDueDate, isTdsPayable, lateDeductionInterest, lateDepositInterest, lateFee234E, monthsOrPart, quarterOf, sectionOf,
  type TdsLedger, type TdsVoucher,
} from '../../client/src/data/tds/tds.ts';
import { DEDUCTEE_COLUMNS, PAY_COLUMNS, QUARTER_COLUMNS, SHEET_NAMES, tdsSheets } from '../../client/src/data/tds/tdsFormats.ts';
import { tdsFeed, tdsMonths } from '../src/services/tdsFeed.ts';
import { CALENDAR_TASKS, CALENDAR_VERSION } from '../src/services/closeCalendar.ts';
import { occurrences } from '../src/services/workSchedule.ts';
import type { TallyLedger, TallyVoucher } from '../src/connectors/tally/books.ts';

const L = (name: string, primary: string, pan = '', group = primary): TdsLedger => ({ name, group, primary, pan, taxType: '' });
const LEDGERS: TdsLedger[] = [
  L('TDS Payable 194C', 'Duties & Taxes'),
  L('TDS on Professional', 'Duties & Taxes'),
  L('TDS 194H Commission', 'Duties & Taxes'),
  L('TDS Receivable 194O', 'Current Assets'),
  L('Alpha Logistics Pvt Ltd', 'Sundry Creditors', 'AAACA1234B'),
  L('Beta Transport', 'Sundry Creditors', 'ABCPB1234C'), // individual → 194C 1 %
  L('Gamma Consultants LLP', 'Sundry Creditors', 'AAFFG1234D'),
  L('Delta Agent', 'Sundry Creditors', ''),
  L('Freight Outward', 'Indirect Expenses'),
  L('Professional Fees', 'Indirect Expenses'),
  L('Commission', 'Indirect Expenses'),
  L('IGST Input 18%', 'Duties & Taxes'),
  L('Demo Bank', 'Bank Accounts'),
];
let n = 0;
const v = (date: string, party: string, lines: [string, number][], extra: Partial<TdsVoucher> = {}): TdsVoucher => ({
  date, type: 'Purchase-Expense', number: String(++n), party, reference: `B${n}`, narration: '', lines: lines.map(([ledger, amount]) => ({ ledger, amount })), ...extra,
});

const OCT: TdsVoucher[] = [
  // 194C company, 2 % on ₹50,000 ex-GST: Dr freight 50,000 + IGST 9,000; Cr TDS 1,000; Cr party 58,000
  v('2026-10-05', 'Alpha Logistics Pvt Ltd', [['Freight Outward', 50000], ['IGST Input 18%', 9000], ['TDS Payable 194C', -1000], ['Alpha Logistics Pvt Ltd', -58000]]),
  // 194C individual at 2 % — should be 1 % → rate flag
  v('2026-10-10', 'Beta Transport', [['Freight Outward', 40000], ['TDS Payable 194C', -800], ['Beta Transport', -39200]]),
  // 194J(b) professional 10 % on ₹60,000
  v('2026-10-12', 'Gamma Consultants LLP', [['Professional Fees', 60000], ['TDS on Professional', -6000], ['Gamma Consultants LLP', -54000]]),
  // 194H, no PAN, deducted at 2 % → PAN flag (high, not at 20 %)
  v('2026-10-20', 'Delta Agent', [['Commission', 30000], ['TDS 194H Commission', -600], ['Delta Agent', -29400]]),
  // TDS receivable (Amazon 194O) is not ours to pay
  v('2026-10-21', 'Some Marketplace', [['TDS Receivable 194O', 500], ['Some Marketplace', -500]], { type: 'Journal' }),
  // cancelled voucher ignored
  v('2026-10-22', 'Alpha Logistics Pvt Ltd', [['Freight Outward', 10000], ['TDS Payable 194C', -200], ['Alpha Logistics Pvt Ltd', -9800]], { cancelled: true }),
];
const NOV: TdsVoucher[] = [
  // challans for October, booked in November: 194C paid in full on time (with BSR / serial in the narration)
  v('2026-11-06', '', [['TDS Payable 194C', 1800], ['Demo Bank', -1800]], { type: 'Payment', narration: 'TDS Oct BSR 0123456 Challan 04567' }),
  // professional paid late on 12 Nov (due 7 Nov) → interest 1.5 % × 2 months (Oct + Nov) × 6,000 = 180
  v('2026-11-12', '', [['TDS on Professional', 6000], ['Demo Bank', -6000]], { type: 'Payment' }),
];

const report = (today = '2026-11-20') => buildTds({ month: '2026-10', vouchers: [...OCT, ...NOV], ledgers: LEDGERS, storedMonths: ['2026-10', '2026-11'], today });

test('section detection from TDS ledger names', () => {
  assert.equal(sectionOf('TDS Payable 194C'), '194C');
  assert.equal(sectionOf('TDS on Contract'), '194C');
  assert.equal(sectionOf('TDS on Professional'), '194J(b)');
  assert.equal(sectionOf('TDS 194J(a) Technical'), '194J(a)');
  assert.equal(sectionOf('TDS 194JB'), '194J(b)');
  assert.equal(sectionOf('TDS u/s 194J'), '194J');
  assert.equal(sectionOf('TDS 194H'), '194H');
  assert.equal(sectionOf('TDS on Rent - Building'), '194I(b)');
  assert.equal(sectionOf('TDS 194I(a) Machinery Hire'), '194I(a)');
  assert.equal(sectionOf('TDS on Purchase of Goods'), '194Q');
  assert.equal(sectionOf('TDS on Salary'), '192');
  assert.equal(sectionOf('TDS 194A Interest'), '194A');
  assert.equal(sectionOf('TDS 195 Non Resident'), '195');
  assert.equal(sectionOf('TDS Payable'), 'Other');
  assert.ok(isTdsPayable('TDS Payable 194C'));
  assert.ok(!isTdsPayable('TDS Receivable 194O'));
  assert.ok(!isTdsPayable('TDS on sales', { name: 'TDS on sales', group: 'Current Assets', primary: 'Current Assets', pan: '', taxType: '' }));
});

test('due dates: 7th of next month, March → 30 April; quarters and return due dates', () => {
  assert.equal(depositDueDate('2026-10'), '2026-11-07');
  assert.equal(depositDueDate('2026-12'), '2027-01-07');
  assert.equal(depositDueDate('2027-03'), '2027-04-30');
  assert.deepEqual(quarterOf('2026-05'), { q: 1, label: 'Q1 FY 2026-27', months: ['2026-04', '2026-05', '2026-06'], dueDate: '2026-07-31' });
  assert.equal(quarterOf('2026-08').dueDate, '2026-10-31');
  assert.equal(quarterOf('2026-12').dueDate, '2027-01-31');
  assert.deepEqual(quarterOf('2027-02').months, ['2027-01', '2027-02', '2027-03']);
  assert.equal(quarterOf('2027-02').dueDate, '2027-05-31');
});

test('interest maths: months or part (both end months), 1.5 % / 1 %, 234E cap', () => {
  assert.equal(monthsOrPart('2026-10-12', '2026-11-12'), 2);
  assert.equal(monthsOrPart('2026-10-31', '2026-11-01'), 2);
  assert.equal(monthsOrPart('2026-10-01', '2026-10-30'), 1);
  assert.equal(lateDepositInterest(6000, '2026-10-12', '2026-11-12'), 180);
  assert.equal(lateDeductionInterest(10000, '2026-06-15', '2026-09-01'), 400);
  assert.equal(lateFee234E('2026-10-31', '2026-11-10', 100000), 2000);
  assert.equal(lateFee234E('2026-10-31', '2027-10-31', 5000), 5000, 'capped at the TDS');
  assert.equal(lateFee234E('2026-10-31', '2026-10-30', 5000), 0);
});

test('month view: deductions, gross ex-GST, challans of the next month, balance and interest', () => {
  const r = report();
  assert.equal(r.dueDate, '2026-11-07');
  assert.equal(r.entries.length, 4, 'cancelled + receivable vouchers skipped');
  const alpha = r.entries.find((e) => e.party === 'Alpha Logistics Pvt Ltd')!;
  assert.equal(alpha.gross, 50000, 'GST line not in the amount paid');
  assert.equal(alpha.ratePct, 2);
  const c = r.sections.find((s) => s.section === '194C')!;
  assert.deepEqual([c.deducted, c.paid, c.balance, c.interest], [1800, 1800, 0, 0]);
  const j = r.sections.find((s) => s.section === '194J(b)')!;
  assert.deepEqual([j.deducted, j.paid, j.balance, j.interest], [6000, 6000, 0, 180]);
  const h = r.sections.find((s) => s.section === '194H')!;
  assert.equal(h.balance, 600);
  // unpaid 194H after the due date: 1.5 % × 600 × 2 months (Oct, Nov) = 18
  assert.equal(h.interest, 18);
  assert.equal(r.totals.balance, 600);
  assert.ok(r.overdue);
  // challan heads: company deductee → 0020, others → 0021
  assert.equal(r.pay.find((p) => p.section === '194C' && p.head === '0020')?.deducted, 1000);
  assert.equal(r.pay.find((p) => p.section === '194C' && p.head === '0021')?.deducted, 800);
  assert.ok(r.flags.some((f) => f.kind === 'late' && f.section === '194J(b)'));
});

test('flags: wrong rate (194C individual at 2 %), missing PAN (206AA), threshold note', () => {
  const r = report('2026-11-05');
  assert.ok(!r.overdue);
  const rate = r.flags.find((f) => f.kind === 'rate');
  assert.ok(rate && rate.party === 'Beta Transport', 'individual contractor should be 1 %');
  assert.ok(!r.flags.some((f) => f.kind === 'rate' && f.party === 'Alpha Logistics Pvt Ltd'));
  assert.ok(!r.flags.some((f) => f.kind === 'rate' && f.party === 'Gamma Consultants LLP'));
  const pan = r.flags.find((f) => f.kind === 'pan');
  assert.equal(pan?.party, 'Delta Agent');
  assert.equal(pan?.severity, 'high');
  assert.ok(r.deductees.find((d) => d.party === 'Delta Agent')!.flags.includes('No PAN in Tally'));
  // 194H yearly limit ₹20,000: ₹30,000 this FY is above → no threshold note; 194C single bill ₹40,000 > ₹30,000 → none either
  assert.ok(!r.flags.some((f) => f.kind === 'threshold'));
  // a small professional bill below ₹50,000 for the FY → threshold note (low)
  const small = buildTds({ month: '2026-10', storedMonths: ['2026-10'], today: '2026-11-01', ledgers: LEDGERS,
    vouchers: [v('2026-10-03', 'Gamma Consultants LLP', [['Professional Fees', 20000], ['TDS on Professional', -2000], ['Gamma Consultants LLP', -18000]])] });
  assert.equal(small.flags.find((f) => f.kind === 'threshold')?.severity, 'low');
  assert.ok(small.notes[0].includes('not copied'), 'next month missing is said');
});

test('quarter prep: 26Q rows with challan details from the narration, PAN placeholder + reason C', () => {
  const r = report();
  const q = r.quarter;
  assert.equal(q.label, 'Q3 FY 2026-27');
  assert.equal(q.dueDate, '2027-01-31');
  assert.equal(q.q26.length, 4);
  assert.equal(q.tds26, 8400);
  const alpha = q.q26.find((x) => x.name === 'Alpha Logistics Pvt Ltd')!;
  assert.deepEqual([alpha.code, alpha.bsr, alpha.challanNo, alpha.challanDate], ['01', '0123456', '04567', '2026-11-06']);
  const delta = q.q26.find((x) => x.name === 'Delta Agent')!;
  assert.deepEqual([delta.pan, delta.reason, delta.code], ['PANNOTAVBL', 'C', '02']);
  assert.equal(q.lateFeeCap, 8400);
  assert.deepEqual(q.missingMonths, [], 'Dec not yet due (today Nov)');
});

test('export: three sheets with the pinned headers', () => {
  const sheets = tdsSheets(report());
  assert.deepEqual(sheets.map((s) => s.name), [SHEET_NAMES.pay, SHEET_NAMES.detail, SHEET_NAMES.quarter]);
  assert.deepEqual(sheets.map((s) => s.name), ['Pay this month', 'Deductee detail', '26Q prep']);
  assert.deepEqual(sheets[0].rows[0], ['Section', 'Nature of payment', 'Challan major head', 'Minor head', 'TDS deducted ₹', 'Already paid ₹', 'To pay ₹', 'Interest if late ₹ (estimate)', 'Due date']);
  assert.deepEqual(sheets[1].rows[0], DEDUCTEE_COLUMNS.map((c) => c.header));
  assert.equal(sheets[2].rows[0][1], 'PAN of deductee');
  assert.deepEqual(sheets[2].rows[0], QUARTER_COLUMNS.map((c) => c.header));
  assert.equal(sheets[0].rows[0].length, PAY_COLUMNS.length);
  assert.equal(sheets[1].rows.length, 1 + 4);
  assert.ok(sheets[0].rows.some((row) => row[1] === 'Total' && row[6] === 600));
});

test('server feed: only TDS vouchers + their ledgers; months FY start → next month / quarter end', () => {
  assert.deepEqual(tdsMonths('2026-10'), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  assert.deepEqual(tdsMonths('2027-03'), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  assert.deepEqual(tdsMonths('2026-04'), ['2026-04', '2026-05', '2026-06']);
  const tv = (lines: [string, number][], party = ''): TallyVoucher => ({ guid: String(++n), date: '2026-10-01', type: 'Journal', number: '1', party, reference: '', referenceDate: '', narration: '', partyGstin: '', cancelled: false, optional: false, lines: lines.map(([ledger, amount]) => ({ ledger, amount })), inventory: [] });
  const tl = (name: string): TallyLedger => ({ name, group: '', primary: '', gstin: '', registration: '', state: '', pan: 'X', opening: 0, billWise: false, tds: '', gstApplicable: '', taxType: '', dutyHead: '' });
  const f = tdsFeed([tv([['Sales', -100], ['Debtor', 100]]), tv([['Freight Outward', 100], ['TDS Payable 194C', -2], ['Alpha Logistics Pvt Ltd', -98]], 'Alpha Logistics Pvt Ltd')],
    [tl('Sales'), tl('Freight Outward'), tl('TDS Payable 194C'), tl('Alpha Logistics Pvt Ltd')]);
  assert.equal(f.vouchers.length, 1);
  assert.deepEqual(f.ledgers.map((l) => l.name).sort(), ['Alpha Logistics Pvt Ltd', 'Freight Outward', 'TDS Payable 194C']);
});

test('calendar v3: pay TDS by the 7th (March → 30 April) with the live panel, quarterly 26Q / 24Q', () => {
  assert.ok(CALENDAR_VERSION >= 3);
  const pay = CALENDAR_TASKS.find((t) => t.id === 'cal-m07-tds-pay')!;
  const march = CALENDAR_TASKS.find((t) => t.id === 'cal-m04-tds-march')!;
  const ret = CALENDAR_TASKS.find((t) => t.id === 'cal-q-tds-return')!;
  assert.equal(pay.live, 'tds');
  assert.equal(march.live, 'tds');
  const spec = (t: typeof pay) => ({ cadence: t.cadence!, dueDay: t.dueDay, months: t.months, arrears: t.arrears });
  const year = [...occurrences(spec(pay), '2026-04-01', '2027-03-31'), ...occurrences(spec(march), '2026-04-01', '2027-03-31')];
  assert.equal(year.length, 12, 'one deposit per month of deduction');
  assert.deepEqual(occurrences(spec(march), '2027-04-01', '2027-04-30'), [{ period: '2027-03', due: '2027-04-30' }]);
  assert.deepEqual(occurrences(spec(pay), '2026-12-01', '2026-12-31'), [{ period: '2026-11', due: '2026-12-07' }]);
  assert.deepEqual(occurrences(spec(pay), '2027-04-01', '2027-04-30'), [], 'no 7 April deposit (March is due 30 April)');
  assert.deepEqual(occurrences(spec(ret), '2026-04-01', '2027-03-31').map((o) => o.due), ['2026-05-31', '2026-07-31', '2026-10-31', '2027-01-31']);
  assert.deepEqual(occurrences(spec(ret), '2027-05-01', '2027-05-31').map((o) => o.due), ['2027-05-31']);
  assert.ok(pay.links?.some((l) => l.url === '/accounts/tds'));
});
