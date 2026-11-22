// Filed TDS reports: parser on the team's real layout quirks, matching with Tally, the month's sheets.
// Synthetic parties and numbers only (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockOfTitle, deviationsSheet, filedDate, matchFiled, monthOf, monthReport, parseFiledSheet, parseFiledWorkbook } from '../../client/src/data/tds/filed.ts';
import type { InvoiceRow } from '../../client/src/data/tds/invoices.ts';

const H = ['S. NO. ', 'PARTY NAME ', 'PAN NO. ', 'DATE', 'BILL NO. ', 'AMOUNT', 'TDS DEDUCT', 'INTREST 1.5%'];
// One month as the team's file has it: title rows, blocks, blank S.NO, #REF!, a text date, a placeholder row, extra
// columns, subtotal lines, a note in the rate column and a summary with a hand adjustment.
const SHEET: unknown[][] = [
  ['HEATRONICS MEDICAL DEVICES (P) LTD'],
  ['MONTH  MAY-26'],
  [],
  ['194 C ', 'CONTACTORS- JOB WORK  @1%'],
  H,
  ['', 'DEMO JOB WORKS', 'ABCPD1234E', 46158, '4', 4785, 47.85, 'EIGHT'],
  ['', 'DEMO TRADERS', 'ADSPD2380A', 46162, '3024', 111520, 1115.2, 'ALLREADY PAID'],
  ['', 'DEMO PRINTS', 'AMBPD5568E', 0],
  [null, null, null, null, null, null, 1163.05],
  ['', '', '', '', '', 116305, 1163.05, 0],
  ['194 C ', 'OTHERS @ 2% (ADVERTISEMENT & PUBLICITY AMAZON.IN)'],
  H,
  [1, 'Demo Ads Pvt Ltd', 'AAICD3918J', 46173, 'ADS-1', 719839.9, 14396.8, 0.02, 129571.18, 835014.28],
  ['#REF!', 'DEMO PORTER', 'AAGCD8772D', '25/05/2026', 'CRN1', 255, 5.1, 0.02],
  ['194 H ', '(Commission/Brokerage): @ 2%'],
  H,
  [1, 'DEMO PAY PRIVATE LIMITED', 'AAVCD2699M', 46173, 'N2627/1', 5191.56, 103.83],
  ['194 I', 'BUILDING RENT @ 10%'],
  H,
  [1, 'DEMO LANDLORD LLP', ' AAQFD3835L', 46143, '9/26-27', 350000, 35000],
  ['194J', 'PROFESSIONAL  @ 10%'],
  H,
  ['', 'DEMO ADVISORS PRIVATE LIMITED', 'AAFCD4468J', 46155, '2026/27-SF026', 1600000, 160000, 0.1],
  ['Total', 'x'],
  ['TOTAL ', 51123.98],
  ['', 'TDS PAYABLE MAR-26'],
  ['', 'PROFESSIONAL ', 160000],
  ['', 'RENT', 35000],
  ['', 'COMMISSION', 103.83],
  ['', 'ADVERTISEMENT ', 14401.9],
  ['', 'JOB WORK', 1163.05],
  ['', 'TOTAL PAYABLE', 210668.78],
  ['', 'ALLREADY PAID', 1115],
  ['', 'PAYABLE AMT.', 209553.78],
  ['', '', 118596],
];

test('parseFiledSheet: the team layout with its quirks', () => {
  const d = parseFiledSheet(SHEET, 'Sheet1', 'Tds Report May.xlsx')!;
  assert.equal(d.month, '2026-05'); // from the title row, not the mislabelled summary
  assert.equal(d.rows.length, 7);
  assert.deepEqual(d.rows.map((r) => r.block), ['jobwork', 'jobwork', 'others', 'others', 'commission', 'rent', 'professional']);
  const [a, b, ads, porter] = d.rows;
  assert.equal(a.date, '2026-05-16'); assert.equal(a.rate, null); assert.equal(a.tds, 47.85);
  assert.equal(b.billNo, '3024'); assert.equal(ads.rate, 0.02); assert.equal(ads.amount, 719839.9);
  assert.equal(porter.date, '2026-05-25');
  assert.equal(d.rows[5].pan, 'AAQFD3835L'); // trimmed
  assert.equal(d.totalPayable, 210668.78); assert.equal(d.netPayable, 209553.78);
  assert.deepEqual(d.summary.map((l) => l.label), ['PROFESSIONAL', 'RENT', 'COMMISSION', 'ADVERTISEMENT', 'JOB WORK', 'TOTAL PAYABLE', 'ALLREADY PAID', 'PAYABLE AMT.']);
  assert.ok(d.warnings.some((w) => /no amount/.test(w)));
  assert.equal(monthOf('October-2026'), '2026-10'); assert.equal(monthOf('Month August-26'), '2026-08');
  assert.equal(filedDate(46305), '2026-10-10'); assert.equal(filedDate('x'), '');
  assert.equal(blockOfTitle('194 I | BUILDING RENT @ 10%'), 'rent');
  assert.equal(parseFiledWorkbook([{ name: 'May', rows: SHEET }, { name: 'Notes', rows: [['hello']] }], 'f.xlsx').length, 1);
});

const bill = (key: string, month: string, supplier: string, pan: string, invoiceNo: string, taxable: number, tdsLedger: string, tds: number, date = `${month}-10`): InvoiceRow => ({
  key, month, date, voucherType: 'Purchase-Expense', voucherNo: key, supplier, pan, gstin: '', invoiceNo, invoiceDate: date, ledgers: 'Meta Ads (Direct)',
  taxable, igst: 0, cgst: 0, sgst: 0, cess: 0, tdsLedger, tds, total: taxable, payable: taxable - tds, partyTds: '', narration: '', firstSeen: '', lastSeen: '', status: 'active', changes: [],
});

test('matchFiled: moved, not filed, not in Tally, TDS differs, filed earlier; month report', () => {
  const C = 'TDS Payable - 194C (Contractors)', J = 'TDS Payable - 194J (Professional)';
  const d = parseFiledSheet(SHEET, 'S', 'f')!;
  const tally = new Map<string, InvoiceRow[]>([
    ['2026-04', [bill('t-adv', '2026-04', 'Demo Advisors Private Limited', 'AAFCD4468J', '2026/27-SF026', 1600000, J, 160000)]], // booked April, filed May
    ['2026-05', [
      bill('t-ads', '2026-05', 'Amazon Expenses (Creditors)', 'AAICD3918J', 'ADS-1', 719839.9, C, 14397),
      bill('t-lan', '2026-05', 'Demo Landlord LLP', 'AAQFD3835L', '9/26-27', 350000, 'TDS Payable - 194I (Rent)', 35000),
      bill('t-pay', '2026-05', 'Easebuzz Collection A/c', 'AAVCD2699M', 'N2627/1', 5191.56, 'TDS Payable - 194H (Commission)', 104),
      bill('t-job', '2026-05', 'Demo Job Works', 'ABCPD1234E', '004', 4785, C, 47.85),
      bill('t-tr', '2026-05', 'Demo Traders', 'ADSPD2380A', '3024', 111520, C, 2230), // TDS differs (1,115.20 filed, Tally at 2 %)
      bill('t-x', '2026-05', 'Unfiled Vendor', 'AAACU1234X', 'U-1', 10000, J, 1000), // in Tally, not filed
    ]],
    ['2026-06', [bill('t-por', '2026-06', 'Porter', 'AAGCD8772D', 'CRN1', 255, C, 5), bill('t-new', '2026-06', 'June Vendor', 'AAACJ1234J', 'J-1', 20000, J, 2000)]],
  ]);
  const { checks, usedKeys } = matchFiled([d], tally);
  const may = checks.get('2026-05')!;
  const kinds = (c: typeof may) => c.deviations.map((x) => `${x.kind}:${x.billNo}`).sort();
  assert.deepEqual(kinds(may), ['moved:2026/27-SF026', 'moved:CRN1', 'not-filed:U-1', 'tds-differs:3024']);
  assert.equal(may.deviations.find((x) => x.kind === 'moved' && x.billNo === 'CRN1')!.tallyMonth, '2026-06');
  assert.deepEqual(kinds(checks.get('2026-04')!), ['filed-elsewhere:2026/27-SF026']); // April not filed here: left out of April
  assert.deepEqual(kinds(checks.get('2026-06')!), ['filed-elsewhere:CRN1']);          // June not filed: Porter already filed in May
  assert.ok(may.sections.find((s) => s.id === 'professional')!.diff === -159000) // Tally May holds the unfiled ₹1,000, not the ₹1.6 L bill (April);
  // Filed month report = the team's rows and summary; June (unfiled) = Tally minus the bill filed in May.
  const r5 = monthReport('2026-05', d, tally.get('2026-05')!, usedKeys);
  assert.equal(r5.grand, 210668.78 - 0); // Σ filed rows
  assert.ok(r5.rows.some((r) => r[1] === 'ALLREADY PAID' && r[2] === 1115));
  assert.ok(r5.rows.some((r) => r[1] === 'NET PAYABLE' && r[2] === 209553.78));
  const r6 = monthReport('2026-06', null, tally.get('2026-06')!, usedKeys);
  assert.equal(r6.grand, 2000);
  const dev = deviationsSheet(may, '2026-05');
  assert.equal(dev.name, 'Deviations from Tally'); assert.equal(dev.kind, 'table');
  assert.equal(dev.rows[dev.headerRows[0]][0], 'Section');
  assert.ok(dev.rows.some((r) => r[1] === 'Booked in another month'));
});

test('sanitizeFiled: checks month, trims fields, refuses empty', async () => {
  const { sanitizeFiled } = await import('../src/services/filedReports.ts');
  const ok = sanitizeFiled({ month: '2026-05', fileName: 'f.xlsx', rows: [{ block: 'rent', party: 'Demo', pan: 'aaqfd3835l', date: '2026-05-02', billNo: '9', amount: 350000, tds: 35000, rate: 0.1 }, { block: 'x', party: '', amount: 1, tds: 1 }], summary: [{ label: 'TOTAL PAYABLE', value: 35000 }], totalPayable: 35000, netPayable: 35000 }, '2026-05', 'a@heatronics.in', 't');
  assert.ok(!('error' in ok));
  if ('error' in ok) return;
  assert.equal(ok.rows.length, 1); assert.equal(ok.rows[0].pan, 'AAQFD3835L'); assert.equal(ok.uploadedBy, 'a@heatronics.in');
  assert.ok('error' in sanitizeFiled({ month: '2026-06', rows: [] }, '2026-05', null, 't'));
  assert.ok('error' in sanitizeFiled({ month: '2026-05', rows: [] }, '2026-05', null, 't'));
  assert.ok('error' in sanitizeFiled({ month: 'x' }, 'x', null, 't'));
});
