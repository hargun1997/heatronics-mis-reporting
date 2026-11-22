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

test('history: month state and FY months; sheets flagged when the data is not OK', async () => {
  const { monthState, fyMonths } = await import('../src/services/supplierInvoices.ts');
  const { historySheets } = await import('../../client/src/data/tds/tdsFormats.ts');
  const now = at('2026-11-22T06:00:00Z');
  assert.deepEqual(fyMonths(now), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(fyMonths(at('2027-02-10T06:00:00Z')).at(-1), '2027-02');
  assert.equal(fyMonths(at('2027-02-10T06:00:00Z'))[0], '2026-04');
  assert.equal(monthState('2026-10', now, '2026-11-02T09:27:00Z').state, 'stale');      // copied before 7 Nov
  assert.equal(monthState('2026-09', now, '2026-11-02T09:27:00Z').state, 'ok');
  assert.equal(monthState('2026-08', now, null).state, 'missing');
  assert.equal(monthState('2026-08', now, null, 12).state, 'partial');
  assert.equal(monthState('2026-11', now, '2026-11-07T09:00:00Z').state, 'running');
  const sheets = historySheets([
    { month: '2026-09', state: 'ok', note: '', rows: [] },
    { month: '2026-10', state: 'stale', note: 'Copied 2026-11-02.', rows: [] },
  ]);
  assert.deepEqual(sheets.map((s) => s.name), ['September-2026', 'October-2026']);
  assert.equal(sheets[0].rows[2].length, 0); // OK month: the team's layout unchanged
  assert.match(String(sheets[1].rows[2][0]), /^DATA STALE: Copied/);
  assert.deepEqual(sheets[1].rows[1], ['Month October-26']);
});

test('real-books rules: TDS payable only, PAN from GSTIN, TDS journals, computed TDS, blocks', async () => {
  const { tdsReportSheet, blockOf, reportTds, reportRate } = await import('../../client/src/data/tds/tdsFormats.ts');
  const led = [
    L('TDS Payable - 194C (Contractors)', 'Current Liabilities', { group: 'TDS Payable' }),
    L('TDS Payable - 194J (Professional)', 'Current Liabilities', { group: 'TDS Payable' }),
    L('TDS (Amazon)', 'Current Assets', { group: 'TDS Receivable' }),
    L('Interest On TDS (Late Payment)', 'Indirect Expenses'),
    L('Amazon Ads', 'Indirect Expenses'), L('Amazon Expenses (Creditors)', 'Sundry Creditors'),
    L('Repairs & Maintenance', 'Indirect Expenses'), L('Checkout Fee - Shopflo', 'Indirect Expenses'),
    L('Job Work Charges', 'Direct Expenses'), L('Demo Job Worker', 'Sundry Creditors', { gstin: '09ABCPK1234C1Z7' }),
    L('Demo Landlord LLP', 'Sundry Creditors'), L('Demo Checkout Pvt Ltd', 'Sundry Creditors'),
    L('IGST Input - 18%', 'Duties & Taxes'), L('SGST Input - 9%', 'Duties & Taxes'), L('CGST Input - 9%', 'Duties & Taxes'),
  ];
  const books: TallyVoucher[] = [
    // Amazon ads bill with a TDS-receivable line next to the 194C line: only the 194C line is TDS we pay.
    V('2026-09-30', 'Purchase-Expense', 'Amazon Expenses (Creditors)', [['Amazon Ads', 560_407.85], ['IGST Input - 18%', 100_873.41], ['TDS Payable - 194C (Contractors)', -11_208], ['TDS (Amazon)', -11_208], ['Amazon Expenses (Creditors)', -638_865.26]], { reference: 'ADS-1' }),
    // 2 % maintenance bill (job work block), TDS rounded by Tally.
    V('2026-09-03', 'Purchase-Expense', 'Demo Landlord LLP', [['Repairs & Maintenance', 9_230], ['CGST Input - 9%', 830.7], ['SGST Input - 9%', 830.7], ['TDS Payable - 194C (Contractors)', -185], ['Demo Landlord LLP', -10_706.4]], { reference: '49/26-27', partyGstin: '09AAQFD3835L1ZD' }),
    // 194J technical 2 %, Tally rounded 229.74 → 230.
    V('2026-09-02', 'Purchase-Expense', 'Demo Checkout Pvt Ltd', [['Checkout Fee - Shopflo', 11_486.85], ['IGST Input - 18%', 2_067.63], ['TDS Payable - 194J (Professional)', -230], ['Demo Checkout Pvt Ltd', -13_324.48]], { reference: 'INV-5584' }),
    // Tranzact purchase + its TDS journal (party + TDS only).
    V('2026-09-21', 'Purchase-RM', 'Demo Job Worker', [['Job Work Charges', 26_649.9], ['IGST Input - 18%', 4_796.98], ['Demo Job Worker', -31_446.88]], { reference: '3117' }),
    V('2026-09-21', 'Journal', 'Demo Job Worker', [['Demo Job Worker', 266.5], ['TDS Payable - 194C (Contractors)', -266.5]], { reference: '', narration: 'Document Number: 3117 (PO: JW/26-27/00080) ; Value: INR 31447.00; TDS: 1.00 %' }),
    V('2026-09-22', 'Journal', 'Demo Job Worker', [['Demo Job Worker', 44.4], ['TDS Payable - 194C (Contractors)', -44.4]], { reference: '', narration: 'Document Number: 090 (PO: JW/26-27/00068) ; Value: INR 5239.00; TDS: 1.00 %' }),
  ];
  const rows = invoiceRows(books, led);
  const amz = rows.find((r) => r.invoiceNo === 'ADS-1')!;
  assert.equal(amz.tds, 11_208); assert.equal(amz.taxable, 560_407.85);
  const ll = rows.find((r) => r.invoiceNo === '49/26-27')!;
  assert.equal(ll.pan, 'AAQFD3835L'); // from the GSTIN
  const j1 = rows.find((r) => r.voucherType === 'Journal' && r.invoiceNo === '3117')!;
  assert.equal(j1.taxable, 26_649.9); // matched to its purchase bill
  assert.equal(j1.pan, 'ABCPK1234C');
  const j2 = rows.find((r) => r.invoiceNo === '090')!;
  assert.equal(j2.taxable, 4_440); assert.equal(j2.total, 5_239);
  const mem = mergeMemory(null, '2026-09', rows, 't', null).rows as InvoiceRow[];
  const byKey = (n: string) => mem.find((r) => r.invoiceNo === n && r.tds > 0)!;
  assert.equal(reportRate(byKey('INV-5584')), 0.02); assert.equal(reportTds(byKey('INV-5584')), 229.74);
  assert.equal(reportTds(byKey('ADS-1')), 11_208.16);
  assert.deepEqual(['ADS-1', '49/26-27', 'INV-5584', '3117', '090'].map((n) => blockOf(byKey(n))), ['others', 'jobwork', 'professional', 'jobwork', 'jobwork']);
  const sh = tdsReportSheet('2026-09', mem);
  assert.equal(sh.totals.jobwork, 184.6 + 266.5 + 44.4);
  assert.equal(sh.totals.others, 11_208.16);
  assert.equal(sh.totals.professional, 229.74);
  assert.ok(sh.rows.some((r) => r[1] === 'Amazon Seller Services Private Limited'));
  // Job work block: 1 % rows first, then the 2 % bill.
  const jw = sh.rows.slice(sh.rows.findIndex((r) => String(r[0]).startsWith('194 C  CONTACTORS')) + 2).slice(0, 3).map((r) => r[7]);
  assert.deepEqual(jw, [0.01, 0.01, 0.02]);
});

test('filed reports: compare block totals', async () => {
  const { compareFiled, filedFor, filedTotal } = await import('../../client/src/data/tds/filedReports.ts');
  const sep = filedFor('2026-09')!;
  assert.equal(filedTotal(sep), 79_484.87); // = the file's TOTAL PAYABLE
  assert.equal(filedTotal(filedFor('2026-10')!), 62_090.92);
  assert.ok(Math.abs(filedTotal(filedFor('2026-08')!) - 68_568.57) <= 0.01); // the file rounds its own total
  const same = compareFiled({ jobwork: 3619.68, others: 32821.79, commission: 35.13, rent: 35000, professional: 8008.27, other: 0 }, sep);
  assert.equal(same.matches, true);
  const off = compareFiled({ jobwork: 3619.68, others: 32000, commission: 35.13, rent: 35000, professional: 8008.27, other: 0 }, sep);
  assert.equal(off.matches, false); assert.equal(off.diff, -821.79);
});

test('report styling: row kinds and a styled sheet (bold headers, borders, number formats)', async () => {
  const { tdsReportSheet, reportRowKinds, historySheets } = await import('../../client/src/data/tds/tdsFormats.ts');
  const { styledReportSheet } = await import('../../client/src/utils/tdsReportExport.ts');
  const row = (supplier: string, pan: string, tdsLedger: string, taxable: number, tds: number): InvoiceRow => ({
    key: supplier, month: '2026-09', date: '2026-09-04', voucherType: 'Journal', voucherNo: '1', supplier, pan, gstin: '', invoiceNo: '90', invoiceDate: '2026-09-04', ledgers: 'Job Work Charges',
    taxable, igst: 0, cgst: 0, sgst: 0, cess: 0, tdsLedger, tds, total: taxable, payable: taxable - tds, partyTds: '', narration: '', firstSeen: '', lastSeen: '', status: 'active', changes: [],
  });
  const sh = tdsReportSheet('2026-09', [row('Demo Job Worker', 'ABCPK1234C', 'TDS Payable - 194C (Contractors)', 4440, 44.4)]);
  const kinds = reportRowKinds(sh.rows);
  assert.deepEqual(kinds.slice(0, 7), ['company', 'month', 'blank', 'block', 'header', 'data', 'total']);
  assert.ok(kinds.includes('grand') && kinds.includes('summaryTitle') && kinds.includes('summaryTotal'));
  const flagged = historySheets([{ month: '2026-10', state: 'stale', note: 'x', rows: [] }])[0];
  assert.equal(reportRowKinds(flagged.rows)[2], 'flag');
  const ws = styledReportSheet(sh.rows) as Record<string, any>;
  assert.equal(ws.A1.s.font.bold, true);                       // company title
  assert.equal(ws.A5.v, 'S.NO'); assert.equal(ws.A5.s.font.bold, true); assert.equal(ws.H5.s.border.left.style, 'thin');
  assert.equal(ws.B6.s.font.bold, false); assert.ok(ws.B6.s.border);          // data row boxed, not bold
  assert.equal(ws.D6.s.numFmt, 'dd-mm-yyyy'); assert.equal(ws.F6.s.numFmt, '#,##0.00'); assert.equal(ws.H6.s.numFmt, '0.00');
  assert.equal(ws.B7.v, 'Total'); assert.equal(ws.B7.s.font.bold, true);
  assert.ok((ws['!merges'] as unknown[]).length >= 3);
});
