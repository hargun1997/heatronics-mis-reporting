// Bulk payments (ICICI): parse the CIB payee export, validate new payees, the Bene_Reg file, default mode, payment
// rows, name matching and the server's checks. SYNTHETIC data only (made-up names, accounts and IFSCs).

import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parsePayeeRows, validateNewPayee, buildBeneRows, findExisting, parsePastedPayees, maskAccount, autoNick, type Payee } from '../../client/src/data/payments/payees.ts';
import { readPayeeWorkbook, textWorkbook, workbookBytes } from '../../client/src/data/payments/workbook.ts';
import { BENE_REG_COLUMNS, PAYMENT_FORMAT, ddmmyyyy } from '../../client/src/data/payments/iciciFormats.ts';
import {
  defaultMode, parseAmount, buildPaymentRows, totals, rowProblems, batchProblems, toCsv, matchPaste, parsePasteList, nameScore, newBatchId,
} from '../../client/src/data/payments/batch.ts';
import { cleanPayees, cleanBatch, summarise } from '../src/routes/payments.ts';

// A sheet laid out like CIB's "CounterPartyListUX3": junk filter rows 0–7, header at row index 8, gapped columns,
// blank rows and a page footer between data rows.
function exportRows(): unknown[][] {
  const W = 29;
  const row = (cells: Record<number, unknown>) => Array.from({ length: W }, (_, i) => cells[i] ?? '');
  return [
    row({}),
    row({ 1: 'Manage Bene' }),
    row({ 2: 'Bank Type:', 8: '-NIL-' }),
    row({ 2: 'Counterparty:', 8: 'Counterparty' }),
    row({ 2: 'Bene Name:', 8: '-NIL-' }),
    row({ 2: 'Bene Account:', 8: '-NIL-' }),
    row({ 2: 'Bene Nick Name:', 8: '-NIL-' }),
    row({ 1: 'Bene List' }),
    row({ 3: 'Bene ID', 4: 'Bene Name', 6: 'Bene Short Name', 9: 'Bene Type', 11: 'Account Number', 12: 'IFSC', 13: 'Status', 14: 'Beneficiary Activation Time', 16: 'Initiator | Initiator Action Date and time', 18: 'Authorizer', 19: 'Authorizer Action Date | Time', 21: 'MID', 22: 'MCC', 24: 'TYPE' }),
    row({ 3: 'B001', 4: 'Alpha Test Traders', 6: 'ALPHATT', 9: 'Other Bank', 11: '000123456789', 12: 'TEST0001234', 13: 'Active', 14: '05/11/2026 12:51 PM' }),
    row({ 3: 'B002', 4: 'Beta Sample Works Pvt Ltd', 6: 'BETASW', 9: 'ICICI Bank', 11: '111122223333', 12: 'Not Available', 13: 'Active' }),
    row({}),
    row({ 1: 'Date and Time:', 5: '45967.5', 23: 'Page 1 of 2', 26: '10' }),
    row({ 3: 'B003', 4: 'Gamma Dummy Supplies', 6: 'GAMMA', 9: 'Other Bank', 11: '99887766554433', 12: 'DEMO0009876', 13: '' }),
    row({ 3: 'B004', 4: 'Delta Fake Co', 6: 'DELTA', 9: 'Other Bank', 11: '12AB', 12: 'DEMO0009876', 13: 'Active' }),
    row({ 3: 'B006', 4: 'Theta Alnum Bank Payee', 6: 'THETA', 9: 'Other Bank', 11: 'abcd12345678', 12: 'DEMO0009876', 13: 'Active' }),
  ];
}

test('export: header found by text, junk / blank / footer rows ignored, leading zeros kept', () => {
  const r = parsePayeeRows(exportRows());
  assert.equal(r.headerRow, 8);
  assert.equal(r.payees.length, 4);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['account number missing or not 6–20 letters / digits']);
  assert.equal(r.payees[3].account, 'ABCD12345678', 'letters allowed in accounts CIB already holds');
  const [a, b, g] = r.payees;
  assert.equal(a.account, '000123456789');
  assert.equal(a.ifsc, 'TEST0001234');
  assert.equal(a.shortName, 'ALPHATT');
  assert.equal(b.ifsc, null, '"Not Available" = no IFSC');
  assert.equal(b.bankType, 'ICICI Bank');
  assert.equal(g.status, 'Unknown');
  assert.equal(maskAccount(a.account), '••••6789');
});

test('export: a real BIFF8 .xls round trip (as CIB sends it) and .xlsx parse the same', () => {
  for (const bookType of ['biff8', 'xlsx'] as const) {
    const ws = XLSX.utils.aoa_to_sheet(exportRows());
    ws['!merges'] = [{ s: { r: 8, c: 4 }, e: { r: 8, c: 5 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CounterPartyListUX3');
    const bytes = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
    const r = readPayeeWorkbook(new Uint8Array(bytes));
    assert.equal(r.payees.length, 4, bookType);
    assert.equal(r.payees[0].account, '000123456789', `${bookType} keeps leading zeros`);
  }
});

test('export: numeric account cells are written without exponent and warned; wrong file says so', () => {
  const rows = exportRows();
  rows[9][11] = 123456789012;
  const r = parsePayeeRows(rows);
  assert.equal(r.payees[0].account, '123456789012');
  assert.ok(r.warnings.some((w) => /stored as numbers/.test(w)));
  const bad = parsePayeeRows([['foo', 'bar']]);
  assert.equal(bad.headerRow, -1);
  assert.match(bad.warnings[0], /not the ICICI payee list/);
});

const saved: Payee[] = [
  { id: 'B001', name: 'Alpha Test Traders', shortName: 'ALPHATT', bankType: 'Other Bank', account: '000123456789', ifsc: 'TEST0001234', status: 'Active', activatedAt: '' },
  { id: 'B002', name: 'Beta Sample Works Pvt Ltd', shortName: 'BETASW', bankType: 'ICICI Bank', account: '111122223333', ifsc: null, status: 'Active', activatedAt: '' },
  { id: 'B003', name: 'Gamma Dummy Supplies', shortName: 'GAMMA', bankType: 'Other Bank', account: '99887766554433', ifsc: 'DEMO0009876', status: 'Pending', activatedAt: '' },
  { id: 'B005', name: 'Epsilon Mock Logistics', shortName: 'EPSLOG', bankType: 'Other Bank', account: '55554444333', ifsc: 'MOCK0A12345', status: 'Active', activatedAt: '' },
];

test('new payee checks: IFSC, account, mobile, email, nick name; duplicates flagged', () => {
  const ok = { name: 'Zeta Test Mart', nick: '', account: '0012 3456 7890', ifsc: 'mock0a12345', email: 'a@b.co', mobile: '+919812345678' };
  assert.deepEqual(validateNewPayee(ok), []);
  const bad = validateNewPayee({ name: '', nick: 'This nick name is far too long', account: '12345', ifsc: 'MOCK1A12345', email: 'nope', mobile: '12345' });
  assert.equal(bad.length, 6);
  assert.equal(autoNick('Zeta Test Mart & Sons (Wholesale) Pvt'), 'Zeta Test Mart Sons');
  assert.equal(findExisting({ ...ok, account: '000123456789', ifsc: 'TEST0001234' }, saved)?.id, 'B001');
  assert.equal(findExisting({ ...ok, account: '111122223333', ifsc: 'ICIC0000001' }, saved)?.id, 'B002', 'saved has no IFSC → account match');
  assert.equal(findExisting(ok, saved), undefined);
});

test('Bene_Reg file: exact six headers (space kept), text cells, pasted Excel rows', () => {
  assert.deepEqual([...BENE_REG_COLUMNS], ['BNF_NAME', 'BENE_ NICK_NAME', 'BENE_ACC_NO', 'BENE_IFSC', 'BENE_EMAIL', 'BENE_MOBILE']);
  const pasted = parsePastedPayees('BNF_NAME\tNICK\nZeta Test Mart\t\t001234567890\tMOCK0A12345\t\t9812345678\r\nEta Demo\tETA\t22223333444\tTEST0001234\te@x.in\t\n');
  assert.equal(pasted.length, 2);
  const rows = buildBeneRows(pasted);
  assert.deepEqual(rows[1], ['Zeta Test Mart', 'Zeta Test Mart', '001234567890', 'MOCK0A12345', '', '9812345678']);
  const wb = XLSX.read(workbookBytes(textWorkbook(rows, 'Sheet1')), { type: 'array' });
  const ws = wb.Sheets.Sheet1;
  assert.equal(ws.C2.t, 's');
  assert.equal(ws.C2.v, '001234567890');
  assert.equal(ws.B1.v, 'BENE_ NICK_NAME');
});

test('default mode: ICICI → FT, ≥ ₹2 lakh → RTGS, else NEFT; amounts parse to paise', () => {
  assert.equal(defaultMode(saved[1], 50_000_00), 'FT');
  assert.equal(defaultMode({ ifsc: 'ICIC0001234', bankType: 'Other Bank' }, 9_00_000_00), 'FT');
  assert.equal(defaultMode(saved[0], 2_00_000_00), 'RTGS');
  assert.equal(defaultMode(saved[0], 1_99_999_99), 'NEFT');
  assert.equal(parseAmount('₹ 1,23,456.5'), 12345650);
  assert.equal(parseAmount('500/-'), 50000);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('1.234')));
});

test('row + batch checks: inactive payee, FT for other bank, RTGS minimum, debit account', () => {
  assert.deepEqual(rowProblems({ payeeId: 'B003', amountPaise: 100, mode: 'NEFT', remark: '' }, saved[2]), ['Payee is not Active in CIB']);
  assert.ok(rowProblems({ payeeId: 'B001', amountPaise: 100, mode: 'FT', remark: '' }, saved[0]).includes('FT is only for ICICI accounts'));
  assert.ok(rowProblems({ payeeId: 'B001', amountPaise: 100, mode: 'RTGS', remark: '' }, saved[0]).includes('RTGS needs ₹2,00,000 or more'));
  assert.ok(rowProblems({ payeeId: 'B002', amountPaise: 100, mode: 'NEFT', remark: '' }, saved[1]).some((e) => /No IFSC/.test(e)));
  const p = batchProblems({ debitAccount: '12', date: '' }, [], saved);
  assert.equal(p.length, 3);
});

test('payment file: configured columns, text amount with 2 decimals, DD-MM-YYYY, refs; CSV quoting; totals', () => {
  assert.equal(PAYMENT_FORMAT.verified, false, 'payment format stays marked UNVERIFIED until confirmed in BizPay360');
  const rows = [
    { payeeId: 'B001', amountPaise: 2_50_000_00, mode: 'RTGS' as const, remark: 'Oct-26, invoices "A"' },
    { payeeId: 'B002', amountPaise: 1_000_50, mode: 'FT' as const, remark: 'Rent' },
    { payeeId: 'B005', amountPaise: 999, mode: 'NEFT' as const, remark: '' },
  ];
  const out = buildPaymentRows({ debitAccount: '000400012345', date: '2026-11-09' }, rows, saved, 'PB261107TEST');
  const h = out[0];
  assert.deepEqual(h.slice(0, 7), ['PYMT_PROD_TYPE_CODE', 'PYMT_MODE', 'DEBIT_ACC_NO', 'BNF_NAME', 'BENE_ACC_NO', 'BENE_IFSC', 'AMOUNT']);
  assert.ok(h.includes('ADDL_INFO5'));
  const col = (r: string[], name: string) => r[h.indexOf(name)];
  assert.equal(col(out[1], 'AMOUNT'), '250000.00');
  assert.equal(col(out[2], 'AMOUNT'), '1000.50');
  assert.equal(col(out[3], 'AMOUNT'), '9.99');
  assert.equal(col(out[1], 'BENE_ACC_NO'), '000123456789');
  assert.equal(col(out[2], 'BENE_IFSC'), '');
  assert.equal(col(out[1], 'PYMT_DATE'), '09-11-2026');
  assert.equal(col(out[3], 'REF_NO'), 'PB261107TEST-003');
  assert.equal(col(out[1], 'DEBIT_ACC_NO'), '000400012345');
  assert.equal(ddmmyyyy('2026-01-05'), '05-01-2026');
  const csv = toCsv(out);
  assert.ok(csv.startsWith('PYMT_PROD_TYPE_CODE,PYMT_MODE,'));
  assert.ok(csv.includes('"Oct-26, invoices ""A"""'));
  const t = totals(rows);
  assert.equal(t.count, 3);
  assert.equal(t.paise, 2_50_000_00 + 1_000_50 + 999);
  assert.equal(t.byMode.RTGS.count, 1);
  assert.match(newBatchId(new Date('2026-11-07T10:00:00Z')), /^PB261107[A-Z0-9]{4}$/);
});

test('paste a name / amount list: exact by name or short name, fuzzy needs a confirm, inactive never matched', () => {
  const lines = parsePasteList('Name\tAmount\nalpha test traders\t12,000\nBETASW\t500.25\nEpsilon Logistics\t1000\nGamma Dummy Supplies\t50\nNobody Here\t10\nAlpha Test Traders, 1,000\nBad Amount\tx');
  const m = matchPaste(lines, saved);
  assert.deepEqual(m.map((x) => x.kind), ['exact', 'exact', 'fuzzy', 'none', 'none', 'exact', 'bad_amount']);
  assert.equal(m[0].payee?.id, 'B001');
  assert.equal(m[1].payee?.id, 'B002');
  assert.equal(m[2].payee?.id, 'B005');
  assert.equal(m[5].line.amountPaise, 1_000_00, 'comma list: last comma splits the amount');
  assert.ok(nameScore('Beta Sample Works Pvt Ltd', 'M/s Beta Sample Works') > 0.9);
});

test('server: payee list and batch checks, summaries hide the debit account', () => {
  const { payees } = cleanPayees({ payees: saved, fileName: 'x.xls' });
  assert.equal(payees.length, 4);
  assert.throws(() => cleanPayees({ payees: [{ name: 'A', account: '12' }] }), /1 payee\(s\)/);
  assert.throws(() => cleanPayees({ payees: 'nope' }));
  const b = cleanBatch({ id: 'PB261107ABCD', debitAccount: '000400012345', date: '2026-11-09', rows: [{ payeeId: 'B001', amountPaise: 100_00, mode: 'NEFT', remark: 'x' }] },
    payees, { by: 'tester', byVerified: false }, new Date('2026-11-07T00:00:00Z'));
  assert.equal(b.totalPaise, 100_00);
  assert.equal(b.rows[0].account, '000123456789', 'account copied from the saved list, not from the page');
  const s = summarise(b) as unknown as Record<string, unknown>;
  assert.equal(s.debitLast4, '2345');
  assert.equal(s.debitAccount, undefined);
  assert.equal(s.rows, undefined);
  assert.throws(() => cleanBatch({ id: 'PB261107ABCD', debitAccount: '000400012345', date: '2026-11-09', rows: [{ payeeId: 'NOPE', amountPaise: 1, mode: 'NEFT' }] }, payees, { by: 'x', byVerified: false }), /not in the saved list/);
  assert.throws(() => cleanBatch({ id: 'PB261107ABCD', debitAccount: '000400012345', date: '2026-11-09', rows: [{ payeeId: 'B001', amountPaise: 1.5, mode: 'NEFT' }] }, payees, { by: 'x', byVerified: false }), /bad amount/);
  assert.throws(() => cleanBatch({ id: '../x', debitAccount: '000400012345', date: '2026-11-09', rows: [] }, payees, { by: 'x', byVerified: false }), /Bad batch id/);
});
