// Tally books: Export-only envelopes, tolerant Day Book / masters parsing, health rules, which months to pull.
// Made-up figures and parties (this repo is public); the XML follows TallyPrime's standard export shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTallyReadOnly } from '../src/connectors/sources/tally.js';
import {
  dayBookMonthEnvelope, dayBookDayEnvelope, monthDays, rangeIgnored, inRange, mastersEnvelope, parseDayBook, parseGroups, parseLedgers, parseStockItems, stripLists,
  tallyHealth, gstinValid, findVouchers, voucherLine, type TallyVoucher,
} from '../src/connectors/tally/books.js';
import { booksToPull } from '../src/connectors/tally/bookStore.js';

test('book requests are read-only exports', () => {
  for (const x of [dayBookMonthEnvelope('2026-10', 'Heatronics Medical Devices Private Limited'), mastersEnvelope('Ledgers'), mastersEnvelope('Groups'), mastersEnvelope('Stock Items')]) {
    assert.doesNotThrow(() => assertTallyReadOnly(x));
  }
  assert.match(dayBookMonthEnvelope('2026-02'), /<SVFROMDATE TYPE="Date">20260201<\/SVFROMDATE>[\s\S]*<SVTODATE TYPE="Date">20260228<\/SVTODATE>/);
  assert.match(mastersEnvelope('Ledgers'), /<ACCOUNTTYPE>Ledgers<\/ACCOUNTTYPE>/);
});

const le = (ledger: string, amount: string, deemed: 'Yes' | 'No', extra = '') =>
  `<ALLLEDGERENTRIES.LIST><OLDAUDITENTRYIDS.LIST TYPE="Number"><OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS></OLDAUDITENTRYIDS.LIST><LEDGERNAME>${ledger}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemed}</ISDEEMEDPOSITIVE><AMOUNT>${amount}</AMOUNT>${extra}</ALLLEDGERENTRIES.LIST>`;
const vch = (o: { type: string; no: string; date: string; party?: string; ref?: string; narr?: string; body: string; gstin?: string }) =>
  `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="r-${o.no}" VCHTYPE="${o.type}" ACTION="Create"><DATE>${o.date}</DATE><GUID>g-${o.no}</GUID><NARRATION>${o.narr ?? ''}</NARRATION><VOUCHERTYPENAME>${o.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${o.no}</VOUCHERNUMBER><PARTYLEDGERNAME>${o.party ?? ''}</PARTYLEDGERNAME><REFERENCE>${o.ref ?? ''}</REFERENCE>${o.gstin ? `<PARTYGSTIN>${o.gstin}</PARTYGSTIN>` : ''}${o.body}</VOUCHER></TALLYMESSAGE>`;

// A valid GSTIN (check digit computed) for the tests.
const G = (() => { const base = '09AAACH1234A1Z'; const cs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let s = 0; for (let i = 0; i < 14; i++) { const v = cs.indexOf(base[i]) * (i % 2 ? 2 : 1); s += Math.floor(v / 36) + (v % 36); } return base + cs[(36 - (s % 36)) % 36]; })();

const DAYBOOK = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
${vch({ type: 'Purchase-Expense', no: '65', date: '20261003', party: 'Acme Logistics Pvt Ltd', ref: 'INV-1', narr: 'Freight Oct', body: le('Freight Charges', '-1000.00', 'Yes', '<BILLALLOCATIONS.LIST><NAME>x</NAME><AMOUNT>99</AMOUNT></BILLALLOCATIONS.LIST>') + le('IGST Input - 18%', '-180.00', 'Yes') + le('Acme Logistics Pvt Ltd', '1180.00', 'No') })}
${vch({ type: 'Purchase-Expense', no: '66', date: '20261004', party: 'Acme Logistics Pvt Ltd', ref: 'INV-1', body: le('Freight Charges', '-1000.00', 'Yes') + le('Acme Logistics Pvt Ltd', '1000.00', 'No') })}
${vch({ type: 'Payment', no: '7', date: '20261005', party: 'Cash', body: le('Office Rent', '-15000.00', 'Yes') + le('Cash', '15000.00', 'No') })}
${vch({ type: 'Journal', no: '8', date: '20261006', body: le('Suspense A/c', '-500.00', 'Yes') + le('HDFC Bank', '400.00', 'No') })}
${vch({ type: 'Purchase', no: '9', date: '20261007', party: 'Parts Co', ref: '', body: `<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Heating Pad 30W</STOCKITEMNAME><RATE>450.00/nos</RATE><AMOUNT>-4500.00</AMOUNT><BILLEDQTY> 10 nos</BILLEDQTY><ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Purchase - Raw Material</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-4500.00</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>` + le('CGST Input', '-405.00', 'Yes') + le('SGST Input', '-405.00', 'Yes') + le('Parts Co', '5310.00', 'No') })}
${vch({ type: 'Journal', no: '10', date: '20261008', narr: 'RCM on GTA', body: le('RCM Payable', '-50.00', 'Yes') + le('IGST Input - RCM', '50.00', 'No') })}
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

test('Day Book: vouchers with Dr / Cr lines, nested lists ignored, invoice-mode ledgers and items read', () => {
  const v = parseDayBook(DAYBOOK);
  assert.equal(v.length, 6);
  assert.deepEqual(v[0].lines, [{ ledger: 'Freight Charges', amount: 1000 }, { ledger: 'IGST Input - 18%', amount: 180 }, { ledger: 'Acme Logistics Pvt Ltd', amount: -1180 }]);
  assert.equal(v[0].date, '2026-10-03');
  assert.equal(v[0].type, 'Purchase-Expense');
  assert.equal(v[0].reference, 'INV-1');
  assert.equal(v[0].narration, 'Freight Oct');
  const p = v[4];
  assert.deepEqual(p.inventory, [{ item: 'Heating Pad 30W', qty: 10, rate: '450.00/nos', amount: 4500 }]);
  assert.ok(p.lines.some((l) => l.ledger === 'Purchase - Raw Material' && l.amount === 4500));
  assert.equal(Math.round(p.lines.reduce((a, l) => a + l.amount, 0)), 0);
  assert.equal(stripLists('<A>1</A><X.LIST><Y.LIST><A>2</A></Y.LIST></X.LIST>'), '<A>1</A>');
  assert.match(voucherLine(v[0]), /Dr Freight Charges 1000\.00; Dr IGST Input - 18% 180\.00; Cr Acme Logistics Pvt Ltd 1180\.00/);
});

const GROUPS = `<ENVELOPE>
<TALLYMESSAGE><GROUP NAME="Sundry Creditors"><PARENT>Current Liabilities</PARENT></GROUP></TALLYMESSAGE>
<TALLYMESSAGE><GROUP NAME="Current Liabilities"><PARENT></PARENT></GROUP></TALLYMESSAGE>
<TALLYMESSAGE><GROUP NAME="Logistics Vendors"><PARENT>Sundry Creditors</PARENT></GROUP></TALLYMESSAGE>
<TALLYMESSAGE><GROUP NAME="Duties &amp; Taxes"><PARENT>Current Liabilities</PARENT></GROUP></TALLYMESSAGE>
<TALLYMESSAGE><GROUP NAME="Indirect Expenses"><PARENT></PARENT></GROUP></TALLYMESSAGE>
</ENVELOPE>`;
const LEDGERS = `<ENVELOPE>
<TALLYMESSAGE><LEDGER NAME="Acme Logistics Pvt Ltd"><PARENT>Logistics Vendors</PARENT><OPENINGBALANCE>2500.00</OPENINGBALANCE><ISBILLWISEON>Yes</ISBILLWISEON>
  <LEDGSTREGDETAILS.LIST><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE><GSTIN>${G}</GSTIN></LEDGSTREGDETAILS.LIST>
  <LEDMAILINGDETAILS.LIST><STATE>Uttar Pradesh</STATE></LEDMAILINGDETAILS.LIST></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="ACME LOGISTICS PRIVATE LIMITED"><PARENT>Sundry Creditors</PARENT><PARTYGSTIN>09AAACH1234A1ZZ</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE><LEDSTATENAME>Maharashtra</LEDSTATENAME></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Parts Co"><PARENT>Sundry Creditors</PARENT><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="IGST Input - 18%"><PARENT>Indirect Expenses</PARENT><TAXTYPE>GST</TAXTYPE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER><NAME.LIST><NAME>Freight Charges</NAME></NAME.LIST><PARENT>Indirect Expenses</PARENT></LEDGER></TALLYMESSAGE>
</ENVELOPE>`;

test('masters: group chain → primary group; ledgers read old and TallyPrime 3+ GST tags', () => {
  const g = parseGroups(GROUPS);
  assert.equal(g.find((x) => x.name === 'Logistics Vendors')?.primary, 'Current Liabilities');
  assert.equal(g.find((x) => x.name === 'Duties & Taxes')?.name, 'Duties & Taxes');
  const l = parseLedgers(LEDGERS, g);
  assert.equal(l.length, 5);
  const acme = l[0];
  assert.equal(acme.gstin, G);
  assert.equal(acme.registration, 'Regular');
  assert.equal(acme.state, 'Uttar Pradesh');
  assert.equal(acme.opening, -2500);
  assert.equal(acme.billWise, true);
  assert.equal(l[4].name, 'Freight Charges');
  const s = parseStockItems('<ENVELOPE><TALLYMESSAGE><STOCKITEM NAME="Heating Pad 30W"><PARENT>Raw Material</PARENT><BASEUNITS>nos</BASEUNITS><GSTDETAILS.LIST><HSNCODE>8516</HSNCODE><GSTRATE>18</GSTRATE></GSTDETAILS.LIST></STOCKITEM></TALLYMESSAGE></ENVELOPE>');
  assert.deepEqual(s, [{ name: 'Heating Pad 30W', group: 'Raw Material', unit: 'nos', hsn: '8516', gstRate: '18' }]);
});

test('GSTIN check digit', () => {
  assert.equal(gstinValid(G), true);
  assert.equal(gstinValid('09AAACH1234A1ZZ'), G.endsWith('Z'));
  assert.equal(gstinValid('27ABC'), false);
});

test('health: the rules find what is wrong and say how to fix it in Tally', () => {
  const groups = parseGroups(GROUPS);
  const masters = { ledgers: parseLedgers(LEDGERS, groups), groups, stockItems: [], warnings: [] };
  const vouchers = parseDayBook(DAYBOOK);
  const future: TallyVoucher = { ...vouchers[0], guid: 'f', number: '99', date: '2026-12-01', reference: 'INV-9' };
  const rep = tallyHealth([...vouchers, future], masters, ['2026-10'], '2026-11-02');
  const by = Object.fromEntries(rep.issues.map((i) => [i.id, i]));
  assert.equal(by.unbalanced?.count, 1);            // Journal 8: 500 Dr vs 400 Cr
  assert.equal(by['dup-invoice']?.count, 1);        // INV-1 again (66)
  assert.equal(by['no-itc']?.count, 1);             // 66 has no GST input from a Regular party with GSTIN
  assert.equal(by['no-ref']?.count, 1);             // 9 has no supplier invoice no.
  assert.equal(by['cash-10k']?.count, 1);
  assert.equal(by.suspense?.count, 1);
  assert.equal(by.rcm?.count, 2);
  assert.equal(by.future?.count, 1);
  assert.equal(by['regular-no-gstin']?.count, 1);   // Parts Co
  assert.ok(by['dup-ledger']?.samples.some((s) => /ACME LOGISTICS PRIVATE LIMITED/.test(s.ledger || '')));
  assert.ok(by['tax-group']?.samples.some((s) => s.ledger === 'IGST Input - 18%'));
  assert.ok(by['unknown-ledger']?.samples.some((s) => s.ledger === 'Cash'));
  assert.equal(rep.issues[0].severity, 'error');
  for (const i of rep.issues) { assert.ok(i.fix.length > 20, i.id); assert.ok(i.why.length > 20, i.id); }
});

test('which Day Books a poll takes; voucher search for Ask about Tally', () => {
  const now = Date.parse('2026-11-02T06:00:00Z');
  assert.deepEqual(booksToPull(now, { mastersAt: null, months: {}, lastError: null, lastTryAt: null }), ['2026-11', '2026-10', '2026-09', '2026-08']);
  const fresh = new Date(now - 3_600_000).toISOString();
  assert.deepEqual(booksToPull(now, { mastersAt: null, months: { '2026-11': fresh, '2026-10': fresh, '2026-09': fresh }, lastError: null, lastTryAt: null }), ['2026-08', '2026-07', '2026-06', '2026-05']);
  const v = parseDayBook(DAYBOOK);
  assert.equal(findVouchers(v, 'how was acme freight booked?')[0].party, 'Acme Logistics Pvt Ltd');
  assert.deepEqual(findVouchers(v, 'what is this'), []);
});


test('Day Book range: detects Tally ignoring the dates, one-day fallback, month days', () => {
  const oneDay = Array.from({ length: 54 }, () => ({ date: '2026-10-01' }));
  assert.equal(rangeIgnored(oneDay, '20260401', '20260430'), true); // nothing inside April
  assert.equal(rangeIgnored(oneDay, '20261001', '20261031'), true); // whole month on one date
  assert.equal(rangeIgnored([{ date: '2026-10-01' }, { date: '2026-10-02' }], '20261001', '20261031'), false);
  assert.equal(rangeIgnored([], '20260401', '20260430'), false);
  assert.equal(rangeIgnored([{ date: '2026-10-05' }], '20261005', '20261005'), false); // one-day pull
  assert.deepEqual(inRange([{ date: '2026-10-01' }, { date: '2026-04-03' }], '20260401', '20260430'), [{ date: '2026-04-03' }]);
  assert.equal(monthDays('2026-02').length, 28);
  assert.equal(monthDays('2026-04')[0], '20260401');
  const d = dayBookDayEnvelope('20260403', 'Heatronics');
  assert.match(d, /<SVFROMDATE TYPE="Date">20260403<\/SVFROMDATE>/);
  assert.match(d, /<SVCURRENTDATE TYPE="Date">20260403<\/SVCURRENTDATE>/);
  assertTallyReadOnly(d);
});

test('parseDayBook: AMOUNT sign wins over ISDEEMEDPOSITIVE (TDS credit inside a purchase)', () => {
  const xml = `<ENVELOPE>${vch({ type: 'Purchase-Expense', no: '52', date: '20260401', party: 'Vendor', ref: '3/26-27', body:
    le('Vendor', '9314.00', 'No') + le('Repairs & Maintenance', '-8030.00', 'Yes') + le('CGST Input - 9%', '-722.70', 'Yes') +
    le('SGST Input - 9%', '-722.70', 'Yes') + le('TDS Payable - 194C (Contractors)', '161.00', 'Yes') + le('Round-off - Purchase', '0.40', 'Yes') })}</ENVELOPE>`;
  const [v] = parseDayBook(xml);
  const by = Object.fromEntries(v.lines.map((l) => [l.ledger, l.amount]));
  assert.equal(by['TDS Payable - 194C (Contractors)'], -161);
  assert.equal(by['Round-off - Purchase'], -0.4);
  assert.equal(by['Vendor'], -9314);
  assert.ok(Math.abs(v.lines.reduce((a, l) => a + l.amount, 0)) < 0.005);
});

test('emptiedDays: days the stored copy had but a new pull returned empty', async () => {
  const { emptiedDays } = await import('../src/connectors/tally/bookStore.js');
  const mk = (d: string, n: number) => Array.from({ length: n }, () => ({ date: d }));
  const stored = [...mk('2026-05-01', 10), ...mk('2026-05-02', 3), ...mk('2026-05-22', 8)];
  assert.deepEqual(emptiedDays(stored, mk('2026-05-22', 8)), ['2026-05-01']);
  assert.deepEqual(emptiedDays(stored, [...mk('2026-05-01', 1), ...mk('2026-05-22', 1)]), []);
  assert.deepEqual(emptiedDays([], mk('2026-05-22', 1)), []);
});
