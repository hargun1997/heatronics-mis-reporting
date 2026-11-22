// Supplier invoice register + memory + sync schedule (services/supplierInvoices.ts) and the Excel layout
// (client/src/data/tds/tdsFormats.ts invoiceSheet / monthSheets). Synthetic parties only (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonth, duplicateBills, invoiceRows, memoryStale, memorySummary, mergeMemory, syncDue, syncMonths, tallyOffline, waitingFor, EMPTY_SYNC, type TdsSyncState } from '../src/services/supplierInvoices.ts';
import { INVOICE_COLUMNS, SHEET_NAMES, invoiceSheet, monthSheets } from '../../client/src/data/tds/tdsFormats.ts';
import { rowRate, rowSection, type InvoiceRow } from '../../client/src/data/tds/invoices.ts';
import type { TallyLedger, TallyVoucher } from '../src/connectors/tally/books.ts';

const L = (name: string, primary: string, extra: Partial<TallyLedger> = {}): TallyLedger => ({
  name, group: primary, primary, gstin: '', registration: '', state: '', pan: '', opening: 0, billWise: false, tds: '', gstApplicable: '', taxType: '', dutyHead: '', ...extra,
});
const LEDGERS = [
  L('Alpha Packers', 'Sundry Creditors', { pan: 'aaacA1234b', gstin: '09AAACA1234B1Z5', tds: 'Company - Resident' }),
  L('Beta Landlord LLP', 'Sundry Creditors', { pan: 'AAFFB1234C' }),
  L('Raw Material Purchases', 'Purchase Accounts'),
  L('Factory Rent', 'Indirect Expenses'),
  L('Job Work Charges', 'Direct Expenses'),
  L('CGST Input', 'Duties & Taxes'), L('SGST Input', 'Duties & Taxes'), L('IGST Input', 'Duties & Taxes'),
  L('TDS Payable 194I(b) Rent', 'Duties & Taxes'),
  L('Demo Bank', 'Bank Accounts'),
  L('Sales Ledger', 'Sales Accounts'),
];
let n = 0;
const V = (date: string, type: string, party: string, lines: [string, number][], extra: Partial<TallyVoucher> = {}): TallyVoucher => ({
  guid: `g-${++n}`, date, type, number: String(n), party, reference: `INV-${n}`, referenceDate: date, narration: '', partyGstin: '', cancelled: false, optional: false,
  lines: lines.map(([ledger, amount]) => ({ ledger, amount })), inventory: [], ...extra,
});

const BOOKS: TallyVoucher[] = [
  V('2026-11-02', 'Purchase', 'Alpha Packers', [['Raw Material Purchases', 10_000], ['CGST Input', 900], ['SGST Input', 900], ['Alpha Packers', -11_800]]),
  V('2026-11-02', 'Purchase-Expense', 'Beta Landlord LLP', [['Factory Rent', 350_000], ['CGST Input', 31_500], ['SGST Input', 31_500], ['TDS Payable 194I(b) Rent', -35_000], ['Beta Landlord LLP', -378_000]]),
  V('2026-11-03', 'Journal', '', [['Job Work Charges', 5_000], ['Alpha Packers', -5_000]]),
  V('2026-11-04', 'Payment', 'Alpha Packers', [['Alpha Packers', 11_800], ['Demo Bank', -11_800]]), // a payment, not a bill
  V('2026-11-05', 'Sales', 'Someone', [['Someone', 1_050], ['Sales Ledger', -1_000]]),
  V('2026-11-06', 'Purchase', 'Alpha Packers', [['Raw Material Purchases', 1_000], ['Alpha Packers', -1_000]], { cancelled: true }),
];

test('invoiceRows: supplier bills only, with GST, TDS, PAN and net payable', () => {
  const rows = invoiceRows(BOOKS, LEDGERS);
  assert.deepEqual(rows.map((r) => r.voucherType), ['Purchase', 'Purchase-Expense', 'Journal']);
  const [a, b, j] = rows;
  assert.equal(a.taxable, 10_000); assert.equal(a.cgst, 900); assert.equal(a.total, 11_800); assert.equal(a.tds, 0); assert.equal(a.pan, 'AAACA1234B');
  assert.equal(a.gstin, '09AAACA1234B1Z5'); assert.equal(a.partyTds, 'Company - Resident');
  assert.equal(b.taxable, 350_000); assert.equal(b.tds, 35_000); assert.equal(b.total, 413_000); assert.equal(b.payable, 378_000);
  assert.equal(b.tdsLedger, 'TDS Payable 194I(b) Rent'); assert.equal(b.month, '2026-11');
  assert.equal(j.supplier, 'Alpha Packers'); assert.equal(j.taxable, 5_000);
  assert.equal(rowSection(b as InvoiceRow), '194I(b)'); assert.equal(rowRate(b), 10); assert.equal(rowSection(a as InvoiceRow), '');
});

test('mergeMemory: new, edited, removed, back again; idempotent', () => {
  const t1 = '2026-11-03T10:00:00Z', t2 = '2026-11-04T10:00:00Z', t3 = '2026-11-05T10:00:00Z';
  const rows = invoiceRows(BOOKS, LEDGERS);
  const m1 = mergeMemory(null, '2026-11', rows, t1, t1);
  assert.equal(m1.rows.length, 3);
  assert.ok(m1.rows.every((r) => r.firstSeen === t1 && r.status === 'active' && !r.changes.length));
  const same = mergeMemory(m1, '2026-11', rows, t2, t2);
  assert.ok(same.rows.every((r) => !r.changes.length && r.firstSeen === t1 && r.lastSeen === t2));
  // Rent bill edited (TDS changed), journal deleted in Tally.
  const edited = rows.filter((r) => r.voucherType !== 'Journal').map((r) => (r.voucherType === 'Purchase-Expense' ? { ...r, tds: 7_000, payable: 406_000 } : r));
  const m2 = mergeMemory(same, '2026-11', edited, t2, t2);
  const rent = m2.rows.find((r) => r.voucherType === 'Purchase-Expense')!;
  assert.deepEqual(rent.changes.map((c) => [c.field, c.from, c.to]), [['tds', 35_000, 7_000]]);
  const jr = m2.rows.find((r) => r.voucherType === 'Journal')!;
  assert.equal(jr.status, 'removed'); assert.equal(jr.removedAt, t2);
  assert.deepEqual(memorySummary(m2), { bills: 2, suppliers: 2, taxable: 360_000, tds: 7_000, withTds: 1, edited: 1, removed: 1 });
  // Removed stays removed (no second log line); comes back when Tally has it again.
  assert.equal(mergeMemory(m2, '2026-11', edited, t3, t3).rows.find((r) => r.key === jr.key)!.changes.length, 1);
  const back = mergeMemory(m2, '2026-11', rows, t3, t3).rows.find((r) => r.key === jr.key)!;
  assert.equal(back.status, 'active'); assert.equal(back.changes.at(-1)!.to, 'active');
  // Rows of another month are never merged into this one.
  assert.equal(mergeMemory(null, '2026-10', rows, t1, t1).rows.length, 0);
});

test('memoryStale: only a newer stored Day Book moves the memory', () => {
  assert.equal(memoryStale(null, null), false);
  assert.equal(memoryStale(null, '2026-11-02T00:00:00Z'), true);
  const m = mergeMemory(null, '2026-11', [], '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z');
  assert.equal(memoryStale(m, '2026-11-02T00:00:00Z'), false);
  assert.equal(memoryStale(m, '2026-11-03T00:00:00Z'), true);
});

test('duplicateBills: same supplier + bill no. booked twice', () => {
  const twice = [...BOOKS, V('2026-11-06', 'Purchase', 'Alpha Packers', [['Raw Material Purchases', 10_000], ['Alpha Packers', -10_000]], { reference: 'INV-1' })];
  const d = duplicateBills(invoiceRows(twice, LEDGERS));
  assert.equal(d.length, 1); assert.equal(d[0].invoiceNo, 'INV-1'); assert.equal(d[0].voucherNos.length, 2);
});

const at = (iso: string) => Date.parse(iso);
test('syncDue: daily once after 10:00 IST, retry after 50 min, month end from the 5th', () => {
  const s0: TdsSyncState = { ...EMPTY_SYNC, finalFor: { '2026-10': '2026-11-05T06:00:00Z' } };
  assert.equal(syncDue(at('2026-11-22T00:00:00Z'), s0).due, false); // 05:30 IST
  assert.equal(syncDue(at('2026-11-22T03:00:00Z'), s0).due, true);  // 08:30 IST
  assert.equal(syncDue(at('2026-11-22T06:00:00Z'), s0).due, true);  // 11:30 IST
  const tried = { ...s0, lastTryAt: '2026-11-22T06:00:00Z' };
  assert.equal(syncDue(at('2026-11-22T06:30:00Z'), tried).due, false);
  assert.equal(syncDue(at('2026-11-22T07:00:00Z'), tried).due, true); // Tally was down: retry
  assert.equal(syncDue(at('2026-11-22T09:00:00Z'), { ...tried, lastOkDay: '2026-11-22' }).due, false);
  // 5 Dec: November not final yet → month-end sync, even if today's daily sync worked.
  const dec = syncDue(at('2026-12-05T06:00:00Z'), { ...s0, lastOkDay: '2026-12-05', lastTryAt: '2026-12-05T04:00:00Z' });
  assert.deepEqual([dec.due, dec.monthEnd], [true, true]);
  assert.equal(syncDue(at('2026-12-04T06:00:00Z'), { ...s0, lastOkDay: '2026-12-04' }).monthEnd, false);
  assert.equal(syncDue(at('2026-12-06T06:00:00Z'), { ...s0, finalFor: { '2026-11': '2026-12-05T06:30:00Z' }, lastOkDay: '2026-12-06' }).due, false);
  assert.equal(addMonth('2026-01', -1), '2025-12');
});

test('syncMonths: month end = last month first; daily = this month (+ last up to the 8th)', () => {
  assert.deepEqual(syncMonths(at('2026-12-05T06:00:00Z'), true), ['2026-11', '2026-12']);
  assert.deepEqual(syncMonths(at('2026-12-03T06:00:00Z'), false), ['2026-12', '2026-11']);
  assert.deepEqual(syncMonths(at('2026-11-22T06:00:00Z'), false), ['2026-11']);
});

test('invoiceSheet / monthSheets: header, totals, removed bills apart', () => {
  const rows = mergeMemory(null, '2026-11', invoiceRows(BOOKS, LEDGERS), '2026-11-03T00:00:00Z', null).rows as InvoiceRow[];
  rows[2] = { ...rows[2], status: 'removed' };
  const sh = invoiceSheet('2026-11', rows, '2026-11-03T00:00:00Z');
  assert.equal(sh.name, SHEET_NAMES.invoices);
  assert.deepEqual(sh.rows[0], INVOICE_COLUMNS.map((c) => c.header));
  const total = sh.rows[3];
  assert.equal(total[0], 'Total');
  assert.equal(total[INVOICE_COLUMNS.findIndex((c) => c.header === 'TDS ₹')], 35_000);
  assert.equal(total[INVOICE_COLUMNS.findIndex((c) => c.header === 'Taxable value ₹')], 360_000);
  assert.ok(sh.rows.some((r) => r[0] === 'Removed in Tally (kept for the record)'));
  assert.deepEqual(monthSheets('2026-11', null, null), []);
  assert.deepEqual(monthSheets('2026-11', null, { rows, syncedAt: null }).map((s) => s.name), ['November-2026']);
  assert.deepEqual(monthSheets('2026-11', null, { rows, syncedAt: null }, { working: true }).map((s) => s.name), [SHEET_NAMES.invoices]);
});

test('tdsReportSheet: the accounts team layout (blocks, headers, totals, summary)', async () => {
  const { tdsReportSheet, REPORT_HEADERS, REPORT_BLOCKS, blockOf, reportMonth, reportSheetName } = await import('../../client/src/data/tds/tdsFormats.ts');
  const mk = (supplier: string, pan: string, tdsLedger: string, taxable: number, tds: number, invoiceNo: string, date = '2026-10-10'): InvoiceRow => ({
    key: `${supplier}-${invoiceNo}`, month: '2026-10', date, voucherType: 'Purchase-Expense', voucherNo: '1', supplier, pan, gstin: '', invoiceNo, invoiceDate: date, ledgers: '',
    taxable, igst: 0, cgst: 0, sgst: 0, cess: 0, tdsLedger, tds, total: taxable, payable: taxable - tds, partyTds: '', narration: '',
    firstSeen: '', lastSeen: '', status: 'active', changes: [],
  });
  const rows = [
    mk('Delta Job Worker', 'ABCPD1234E', 'TDS Payable 194C', 2_500, 25, '130'),
    mk('Ads Platform Pvt Ltd', 'AAACE1234F', 'TDS Payable 194C', 700_211, 14_004.22, 'AD-1'),
    mk('Agent One', 'ABCPA1234G', 'TDS 194H Commission', 1_550.5, 31.01, 'C-1'),
    mk('Beta Landlord LLP', 'AAFFB1234C', 'TDS Payable 194I(b) Rent', 350_000, 35_000, '66/26-27'),
    mk('Gamma Consultants LLP', 'AAFFG1234D', 'TDS on Professional 194J', 120_849.4, 12_084.94, 'P-9'),
    { ...mk('No Tds Supplier', 'AAACN1234H', '', 9_000, 0, 'X') },
    { ...mk('Removed Bill', 'AAACR1234J', 'TDS Payable 194C', 9_000, 180, 'R'), status: 'removed' as const },
  ];
  assert.equal(blockOf(rows[0]), 'jobwork'); assert.equal(blockOf(rows[1]), 'others');
  const sh = tdsReportSheet('2026-10', rows);
  assert.equal(sh.name, 'October-2026'); assert.equal(reportMonth('2026-10'), 'October-26'); assert.equal(reportSheetName('2026-10'), 'October-2026');
  assert.deepEqual(sh.rows.slice(0, 2), [['HEATRONICS MEDICAL DEVICES (P) LTD'], ['Month October-26']]);
  const titles = sh.rows.filter((r) => REPORT_BLOCKS.some((b) => b.title === r[0])).map((r) => r[0]);
  assert.deepEqual(titles, REPORT_BLOCKS.filter((b) => b.id !== 'other').map((b) => b.title)); // no "other" block when empty
  assert.equal(sh.rows.filter((r) => r[0] === 'S.NO').length, 5);
  assert.deepEqual(sh.rows[4], [...REPORT_HEADERS]);
  const first = sh.rows[5];
  assert.deepEqual([first[0], first[1], first[2], first[4], first[5], first[6], first[7]], [1, 'Delta Job Worker', 'ABCPD1234E', '130', 2_500, 25, 0.01]);
  const dt = first[3] as Date;
  assert.ok(dt instanceof Date);
  assert.deepEqual([dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours()], [2026, 9, 10, 0]);
  const summary = Object.fromEntries(sh.rows.filter((r) => r[0] === '' && typeof r[1] === 'string' && typeof r[2] === 'number').map((r) => [r[1], r[2]]));
  assert.deepEqual(summary, { PROFESSIONAL: 12_084.94, RENT: 35_000, COMMISSION: 31.01, ADVERTISEMENT: 14_004.22, 'JOB WORK': 25, 'TOTAL PAYABLE': 61_145.17, 'NET PAYABLE': 61_145.17 });
  assert.equal(sh.grand, 61_145.17);
  assert.ok(sh.rows.some((r) => r[1] === 'Grand Total' && r[6] === 61_145.17));
  assert.ok(sh.rows.some((r) => r[1] === 'TDS PAYABLE October-26'));
  // A section outside the five gets its own block, never dropped.
  const q = tdsReportSheet('2026-10', [mk('Steel Seller', 'AAACS1234K', 'TDS Payable 194Q', 1_000_000, 1_000, 'Q')]);
  assert.ok(q.rows.some((r) => String(r[0]).startsWith('OTHER SECTIONS')));
  assert.equal(q.grand, 1_000);
});

test('offline: retries until Tally answers, then catches up the missed months', () => {
  const down: TdsSyncState = { ...EMPTY_SYNC, lastOkAt: '2026-11-25T06:00:00Z', lastOkDay: '2026-11-25', lastTryAt: '2026-12-09T06:00:00Z', lastError: 'fetch failed', finalFor: {} };
  assert.equal(tallyOffline(down), true);
  assert.equal(tallyOffline({ ...down, lastOkAt: '2026-12-09T06:00:00Z', lastError: null }), false);
  // 10 Dec: month-end of Nov still pending (Tally was closed from the 5th) → due again 50 min after each failed try.
  const due = syncDue(at('2026-12-09T07:00:00Z'), down);
  assert.deepEqual([due.due, due.monthEnd], [true, true]);
  assert.equal(syncDue(at('2026-12-09T06:30:00Z'), down).due, false);
  assert.deepEqual(waitingFor(at('2026-12-09T07:00:00Z'), down), ['month-end sync of 2026-11', "today's sync"]);
  // Daily sync after a gap reads the missed months too (Oct last good → Oct, Nov caught up; Dec first).
  assert.deepEqual(syncMonths(at('2026-12-20T06:00:00Z'), false, '2026-10-28T06:00:00Z'), ['2026-12', '2026-10', '2026-11']);
  assert.deepEqual(syncMonths(at('2026-12-05T06:00:00Z'), true, '2026-10-28T06:00:00Z'), ['2026-11', '2026-10', '2026-12']);
  assert.deepEqual(syncMonths(at('2026-12-20T06:00:00Z'), false, '2026-12-19T06:00:00Z'), ['2026-12']);
  assert.deepEqual(syncMonths(at('2026-12-20T06:00:00Z'), false, '2026-01-01T06:00:00Z').length, 4); // at most 3 back + this month
});
