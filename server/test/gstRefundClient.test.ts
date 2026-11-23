// GST refund page helpers: the GSTR-2B Excel reader (2-row header, notes) and Statement 1A in the utility's column order.
// Synthetic GSTINs and numbers only (the repo is public).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, gstr2bRows, statementSheets, UTILITY_HEADERS, workingSheet, type InwardDoc, type OutwardDoc } from '../../client/src/data/gstRefund/gstRefund.ts';

test('GSTR-2B: B2B and CDNR sheets with the portal 2-row header', () => {
  const b2b: unknown[][] = [
    ['Goods and Services Tax - GSTR-2B'], [], ['Taxable inward supplies received from registered persons'],
    ['GSTIN of supplier', 'Trade/Legal name', 'Invoice details', null, null, null, 'Place of supply', 'Supply Attract Reverse Charge', 'Taxable Value (₹)', 'Tax Amount', null, null, null],
    [null, null, 'Invoice number', 'Invoice type', 'Invoice Date', 'Invoice Value(₹)', null, null, null, 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)'],
    ['09AAAPA1111A1ZX', 'DEMO FABRICS', 'F-1', 'Regular', '10-11-2026', 118000, 'Uttar Pradesh', 'No', 100000, 0, 9000, 9000, 0],
    ['07BBBPB2222B1ZY', 'DEMO ADS', 'AD/9', 'Regular', '12/11/2026', 59000, 'Uttar Pradesh', 'No', 50000, 9000, 0, 0, 0],
    ['Total', null],
  ];
  const cdnr: unknown[][] = [
    ['GSTIN of supplier', 'Trade/Legal name', 'Credit note/Debit note details', null, null, null, null, 'Place of supply', 'Supply Attract Reverse Charge', 'Taxable Value (₹)', 'Tax Amount'],
    [null, null, 'Note number', 'Note type', 'Note Supply type', 'Note date', 'Note Value (₹)', null, null, null, 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)'],
    ['09AAAPA1111A1ZX', 'DEMO FABRICS', 'CN-1', 'Credit note', 'Regular', '20-11-2026', 1180, 'Uttar Pradesh', 'No', 1000, 0, 90, 90],
  ];
  const got = gstr2bRows([{ name: 'Read me', rows: [['x']] }, { name: 'B2B', rows: b2b }, { name: 'B2BA', rows: b2b }, { name: 'B2B-CDNR', rows: cdnr }]);
  assert.deepEqual(got.sheets, ['B2B', 'B2B-CDNR']);
  assert.equal(got.rows.length, 3);
  assert.deepEqual(got.rows[0], { gstin: '09AAAPA1111A1ZX', invoice: 'F-1', date: '2026-11-10', taxable: 100000, igst: 0, cgst: 9000, sgst: 9000, type: 'Invoice' });
  assert.equal(got.rows[1].date, '2026-11-12');
  assert.equal(got.rows[2].cgst, -90);
  assert.equal(got.rows[2].type, 'Credit Note');
  assert.equal(got.skipped, 1);
  assert.equal(dayOf(46336), '2026-11-10');
  assert.equal(dayOf('10-Nov-2026'), '2026-11-10');
});

const doc = (p: Partial<InwardDoc>): InwardDoc => ({ key: 'k', guid: 'g', date: '2026-11-10', vType: 'Purchase', number: '1', party: 'Demo', gstin: '09AAAPA1111A1ZX', invoice: 'F-1', invoiceDate: '2026-11-09', docType: 'Invoice/Bill of Entry', supplyType: 'Inward Supply from Registered Person', taxable: 100000, igst: 0, cgst: 9000, sgst: 9000, rate: 18, cls: 'input', why: '', sure: true, ruled: false, eligible: true, leftOut: '', ledgers: '', narration: '', items: 0, in2b: true, ...p });
const out = (p: Partial<OutwardDoc>): OutwardDoc => ({ key: 'o', date: '2026-11-15', vType: 'Sales', number: 'S-1', party: 'Buyer', gstin: '', supplyType: 'B2C-Small', docType: 'Invoice/Bill of Entry', taxable: 1000, igst: 50, cgst: 0, sgst: 0, rate: 5, value: 1050, ...p });

test('Statement 1A: utility columns, inward beside outward, eligible only, positive values for notes', () => {
  const api = { gstin: '09AAAPA1111A1ZX', from: '112026', to: '112026',
    inward: [doc({}), doc({ key: 'x', eligible: false, leftOut: 'capital goods' }), doc({ key: 'dn', docType: 'Debit Note', taxable: -500, cgst: -45, sgst: -45 })],
    outward: [out({}), out({ key: 'cn', docType: 'Credit Note', taxable: -200, igst: -10 }), out({ key: 'nil', igst: 0 })] };
  const [sheet] = statementSheets(api);
  assert.equal(sheet.name, 'RFD_STMT01A');
  assert.deepEqual(sheet.rows[sheet.headerRows[0]], UTILITY_HEADERS);
  const data = sheet.rows.slice(sheet.headerRows[0] + 1);
  assert.equal(data.length, 2);
  assert.deepEqual(data[0], [1, 'Inward Supply from Registered Person', '09AAAPA1111A1ZX', 'Invoice/Bill of Entry', 'F-1', '09-11-2026', null, 100000, 0, 9000, 9000, 'B2C-Small', 'Invoice/Bill of Entry', 'S-1', '15-11-2026', 1000, 50, 0, 0]);
  assert.equal(data[1][3], 'Debit Note');
  assert.equal(data[1][7], 500);
  assert.equal(data[1][12], 'Credit Note');
  assert.equal(data[1][15], 200);
  assert.equal(sheet.rows[3][1], '112026');
});

test('Statement 1A splits at 10,000 rows; working sheet names the formula', () => {
  const many = Array.from({ length: 10001 }, (_, i) => doc({ key: `k${i}`, invoice: `F-${i}` }));
  const sheets = statementSheets({ gstin: '', from: '112026', to: '112026', inward: many, outward: [] });
  assert.deepEqual(sheets.map((s) => s.name), ['RFD_STMT01A (1)', 'RFD_STMT01A (2)']);
  const w = workingSheet({ month: '2026-11', calc: { netItc: 27000, itcInputs: 18000, itcServices: 9000, servicesLeftOut: 0, invertedTurnover: 400000, adjustedTurnover: 400000, taxPayable: 20000, maxRefund: 7000, invertedRates: [5], outputRates: [{ rate: 5, taxable: 400000, tax: 20000, inverted: true }], topInputRate: 18, ecl: null, claim: 7000 }, ties: [], counts: { vouchers: 0, otherGstins: 0, inward: 0, eligible: 0, outward: 0, errors: 0, warns: 0, checks: 0 }, notReady: [] });
  assert.ok(w.some((r) => r[0] === 'Maximum refund' && r[1] === 7000));
});
