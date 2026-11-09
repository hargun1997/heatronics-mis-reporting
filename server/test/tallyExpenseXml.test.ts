// Expense Booking → Tally Prime import XML (client/src/data/tally/buildTallyXml.ts) and the master reducer
// (reduceTallyExport.ts) it reads ledgers / groups / cost centres from. What lands in Tally must balance,
// carry Tally's sign convention and never put a cost centre on a GST / TDS line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTallyXml, type QueueItemForExport } from '../../client/src/data/tally/buildTallyXml.ts';
import { reduceTallyExport } from '../../client/src/data/tally/reduceTallyExport.ts';
import type { TallyMaster } from '../../client/src/data/tally/useTallyMaster.ts';

const master: TallyMaster = {
  groups: [
    { name: 'Duties & Taxes', parent: 'Current Liabilities', isRevenue: false },
    { name: 'GST Input', parent: 'Duties & Taxes', isRevenue: false },
    { name: 'Indirect Expenses', parent: null, isRevenue: true },
    { name: 'Sundry Creditors', parent: 'Current Liabilities', isRevenue: false },
  ],
  ledgers: [
    { name: 'Input IGST 18%', group: 'GST Input' },
    { name: 'TDS Payable 194J', group: 'Duties & Taxes' },
    { name: 'Professional Fees', group: 'Indirect Expenses' },
    { name: 'Acme & Sons <Legal>', group: 'Sundry Creditors' },
  ],
  voucherTypes: [],
  costCentres: [{ name: 'D2C', category: 'Channel' }, { name: 'HO', category: 'Admin' }],
};

const item = (over: Partial<QueueItemForExport['advice']> = {}, id = 'item-0000abcd1234'): QueueItemForExport => ({
  id,
  answers: { party: 'Acme', costCentre: 'D2C' },
  advice: {
    summary: 'legal fees',
    invoiceExtract: { vendor: 'Acme & Sons', invoiceNumber: 'INV/26/042', invoiceDate: '2026-10-15', amount: 11800 },
    stages: [{
      step: 1, title: 'Book the invoice', when: 'now', voucherType: 'Purchase-Services',
      lines: [
        { dr_or_cr: 'Dr', ledger: 'Professional Fees', amount: 10000 },
        { dr_or_cr: 'Dr', ledger: 'Input IGST 18%', amount: 1800 },
        { dr_or_cr: 'Cr', ledger: 'TDS Payable 194J', amount: 1000 },
        { dr_or_cr: 'Cr', ledger: 'Acme & Sons <Legal>', amount: 10800 },
      ],
    }],
    ...over,
  },
});

const entries = (xml: string) => [...xml.matchAll(/<ALLLEDGERENTRIES\.LIST>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/g)].map((m) => m[1]);

test('a balanced purchase becomes one voucher: date, signs, party, bill ref, escaping', () => {
  const r = buildTallyXml([item()], master, { companyName: 'Heatronics Medical Devices' });
  assert.equal(r.vouchersExported, 1);
  assert.deepEqual(r.itemsSkipped, []);
  assert.deepEqual(r.warnings, []);
  assert.match(r.xml, /<SVCURRENTCOMPANY>Heatronics Medical Devices<\/SVCURRENTCOMPANY>/);
  assert.match(r.xml, /<DATE>20261015<\/DATE>/);
  assert.match(r.xml, /<VOUCHER VCHTYPE="Purchase-Services" ACTION="Create">/);
  // party = the first Cr line that is not a tax ledger (TDS Payable sits under Duties & Taxes)
  assert.match(r.xml, /<PARTYLEDGERNAME>Acme &amp; Sons &lt;Legal&gt;<\/PARTYLEDGERNAME>/);
  assert.match(r.xml, /<NARRATION>Book the invoice · Acme &amp; Sons · INV\/26\/042<\/NARRATION>/);
  const e = entries(r.xml);
  assert.equal(e.length, 4);
  // Dr = deemed positive, negative amount; Cr = positive amount
  assert.match(e[0], /<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-10000\.00<\/AMOUNT>/);
  assert.match(e[3], /<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>10800\.00<\/AMOUNT>/);
  // bill allocation only on the party line, by the vendor's invoice number
  assert.equal((r.xml.match(/BILLALLOCATIONS\.LIST>/g) ?? []).length, 2);
  assert.match(e[3], /<NAME>INV\/26\/042<\/NAME>\s*<BILLTYPE>New Ref<\/BILLTYPE>/);
  // cost centre (with its category) only on the Dr expense line, never on GST / TDS
  assert.match(e[0], /<CATEGORY>Channel<\/CATEGORY>[\s\S]*<NAME>D2C<\/NAME>/);
  assert.doesNotMatch(e[1], /COSTCENTREALLOCATIONS/);
  assert.doesNotMatch(e[2], /COSTCENTREALLOCATIONS/);
  assert.doesNotMatch(e[3], /COSTCENTREALLOCATIONS/);
});

test('refused stages: unbalanced, missing amount, < 2 lines, other voucher types', () => {
  const bad = (lines: QueueItemForExport['advice']['stages'][number]['lines'], voucherType = 'Purchase-Services') =>
    item({ stages: [{ step: 1, title: 't', when: 'now', voucherType, lines }] });
  const r = buildTallyXml([
    bad([{ dr_or_cr: 'Dr', ledger: 'Professional Fees', amount: 100 }, { dr_or_cr: 'Cr', ledger: 'Acme & Sons <Legal>', amount: 99 }]),
    bad([{ dr_or_cr: 'Dr', ledger: 'Professional Fees', amount: null }, { dr_or_cr: 'Cr', ledger: 'Acme & Sons <Legal>', amount: 100 }]),
    bad([{ dr_or_cr: 'Dr', ledger: 'Professional Fees', amount: 100 }]),
    bad([{ dr_or_cr: 'Dr', ledger: 'Professional Fees', amount: 100 }, { dr_or_cr: 'Cr', ledger: 'Acme & Sons <Legal>', amount: 100 }], 'Payment'),
    item({ stages: [] }),
  ], master);
  assert.equal(r.vouchersExported, 0);
  assert.deepEqual(r.itemsSkipped.map((s) => s.reason.split(':')[0].split(' "')[0]), [
    "Lines don't balance", 'Line for', 'Stage has fewer than 2 ledger lines', 'Voucher type', 'No stages',
  ]);
  assert.doesNotMatch(r.xml, /<VOUCHER /);
});

test('only the first stage is exported; no invoice number → generated EXP- ref + warning; Journal has no party header', () => {
  const two = item({
    invoiceExtract: { vendor: 'Acme & Sons' },
    stages: [
      { step: 1, title: 'Prepaid', when: 'now', voucherType: 'Journal', costCentre: 'HO', lines: [
        { dr_or_cr: 'Dr', ledger: 'Professional Fees', amount: 500.5 },
        { dr_or_cr: 'Cr', ledger: 'Acme & Sons <Legal>', amount: 500.5 },
      ] },
      { step: 2, title: 'Amortise', when: 'monthly', voucherType: 'Journal', lines: [] },
    ],
  });
  const r = buildTallyXml([two], master, { fallbackDate: '2026-11-01' });
  assert.equal(r.vouchersExported, 1);
  assert.deepEqual(r.stagesSkipped, [{ itemId: two.id, voucherType: 'Journal', step: 2 }]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /no invoice number/);
  assert.match(r.xml, /<NAME>EXP-ABCD1234<\/NAME>/);
  assert.match(r.xml, /<DATE>20261101<\/DATE>/); // fallback date when the invoice has none
  assert.doesNotMatch(r.xml, /PARTYLEDGERNAME/);
  assert.match(r.xml, /<CATEGORY>Admin<\/CATEGORY>[\s\S]*<NAME>HO<\/NAME>/); // stage cost centre wins
  assert.match(r.xml, /<AMOUNT>-500\.50<\/AMOUNT>/);
});

test('reduceTallyExport: raw export deduped (later wins), deleted / nameless skipped, sorted; slim master passed through', () => {
  const raw = { tallymessage: [
    { metadata: { name: 'Sundry Creditors', type: 'Group' }, parent: 'Current Liabilities' },
    { metadata: { name: 'Zeta Ltd', type: 'Ledger' }, parent: 'Sundry Creditors' },
    { metadata: { name: 'Acme\u0007 ', type: 'Ledger' }, parent: 'Old Group' },
    { metadata: { name: 'Acme', type: 'Ledger' }, parent: 'Sundry Creditors', isgstapplicable: true, gsttypeofsupply: 'Services' },
    { metadata: { name: 'Gone', type: 'Ledger' }, parent: 'X', isdeleted: true },
    { metadata: { type: 'Ledger' }, parent: 'X' },
    { metadata: { name: 'Purchase-Services', type: 'Voucher Type' }, parent: 'Purchase' },
    { metadata: { name: 'Channel', type: 'Cost Category' } },
    { metadata: { name: 'D2C', type: 'Cost Centre' }, category: 'Channel' },
    { metadata: { name: 'INR', type: 'Currency' } },
    null,
  ] };
  const r = reduceTallyExport(raw);
  assert.equal(r.source, 'raw-tally');
  assert.deepEqual(r.master.ledgers, [
    { name: 'Acme', group: 'Sundry Creditors', gst: true, tds: false, supplyType: 'Services' },
    { name: 'Zeta Ltd', group: 'Sundry Creditors', gst: false, tds: false },
  ]);
  assert.deepEqual(r.stats, { groups: 1, ledgers: 2, voucherTypes: 1, costCentres: 1, costCategories: 1, currencies: 1 });
  assert.deepEqual(r.master.costCentres, [{ name: 'D2C', category: 'Channel', parent: null }]);

  const again = reduceTallyExport(r.master);
  assert.equal(again.source, 'already-reduced');
  assert.equal(again.master, r.master);
  assert.throws(() => reduceTallyExport([]), /Unrecognised format/);
  assert.throws(() => reduceTallyExport(null), /not a JSON object/);
});
