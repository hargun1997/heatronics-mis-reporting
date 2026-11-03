// Chart of accounts: cascading tree, hanging ledgers (catch-all parent, carry-over group, no group, channel mismatch) and
// the suggested move (rule first, look-alike ledgers second, never across the books).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChart, closingByLedger } from '../src/connectors/tally/chart.js';
import type { TallyGroup, TallyLedger } from '../src/connectors/tally/books.js';

const G = (name: string, parent: string, primary: string): TallyGroup => ({ name, parent, primary });
const L = (name: string, group: string, primary: string): TallyLedger => ({ name, group, primary, gstin: '', registration: '', state: '', pan: '', opening: 0, billWise: false, tds: '', gstApplicable: '', taxType: '', dutyHead: '' });

const groups = [
  G('Indirect Expenses', '', 'Indirect Expenses'),
  G('Amazon Channel Fees', 'Indirect Expenses', 'Indirect Expenses'),
  G('Flipkart Channel Fees', 'Indirect Expenses', 'Indirect Expenses'),
  G('D2C Logistics', 'Indirect Expenses', 'Indirect Expenses'),
  G('Finance Costs', 'Indirect Expenses', 'Indirect Expenses'),
  G('Admin & General Expenses', 'Indirect Expenses', 'Indirect Expenses'),
  G('Fixed Assets', '', 'Fixed Assets'),
  G('Busy Carryover', 'Fixed Assets', 'Fixed Assets'),
  G('Computer and IT Equipment', 'Fixed Assets', 'Fixed Assets'),
  G('Plant and Machinery', 'Fixed Assets', 'Fixed Assets'),
  G('Current Assets', '', 'Current Assets'),
  G('Sundry Debtors', 'Current Assets', 'Current Assets'),
  G('Amazon Debtors', 'Sundry Debtors', 'Current Assets'),
  G('Empty One', 'Indirect Expenses', 'Indirect Expenses'),
];
const ledgers = [
  L('FBA storage fee', 'Indirect Expenses', 'Indirect Expenses'),
  L('Freight Charges- Delhivery One', 'Indirect Expenses', 'Indirect Expenses'),
  L('Interest On TDS (Late Payment)', 'Indirect Expenses', 'Indirect Expenses'),
  L('Zzqx', 'Indirect Expenses', 'Indirect Expenses'),
  L('Amazon Closing Fee', 'Amazon Channel Fees', 'Indirect Expenses'),
  L('Flipkart Commission', 'Amazon Channel Fees', 'Indirect Expenses'),
  L('Laptop - Busy', 'Busy Carryover', 'Fixed Assets'),
  L('Cutting Machine - Busy', 'Busy Carryover', 'Fixed Assets'),
  L('Dell Laptop', 'Computer and IT Equipment', 'Fixed Assets'),
  L('Some Party', 'Sundry Debtors', 'Current Assets'),
  L('Profit & Loss A/c', '', ''),
  L('Lost Ledger', '', ''),
];

test('tree cascades groups → sub-groups → ledgers with counts and closings', () => {
  const closing = closingByLedger([{ name: 'FBA storage fee', level: 'ledger', debit: 1200, credit: 0 }, { name: 'Amazon Closing Fee', level: 'ledger', debit: 800, credit: 0 }, { name: 'Indirect Expenses', level: 'group', debit: 2000, credit: 0 }]);
  const r = buildChart({ groups, ledgers }, closing);
  const ie = r.tree.find((n) => n.name === 'Indirect Expenses')!;
  assert.equal(ie.kind, 'group');
  assert.equal(ie.ledgers, 6);
  assert.equal(ie.closing, 2000);
  const amz = ie.children.find((n) => n.name === 'Amazon Channel Fees')!;
  assert.deepEqual(amz.children.map((c) => c.name), ['Amazon Closing Fee', 'Flipkart Commission']);
  assert.ok(r.tree.find((n) => n.name === '(no group)'));
  assert.equal(r.tree[0].name, 'Fixed Assets', 'balance sheet before P&L');
  assert.ok(r.emptyGroups.includes('Empty One') && !r.emptyGroups.includes('Amazon Channel Fees'));
});

test('hanging ledgers and where they should move', () => {
  const r = buildChart({ groups, ledgers });
  const by = Object.fromEntries(r.hanging.map((h) => [h.ledger, h]));
  assert.equal(by['FBA storage fee'].kind, 'catch_all');
  assert.equal(by['FBA storage fee'].suggest?.group, 'Amazon Channel Fees');
  assert.equal(by['Freight Charges- Delhivery One'].suggest?.group, 'D2C Logistics');
  assert.equal(by['Interest On TDS (Late Payment)'].suggest?.group, 'Finance Costs');
  assert.equal(by['Zzqx'].suggest, null, 'nothing fits → pick by hand');
  assert.equal(by['Laptop - Busy'].kind, 'legacy');
  assert.equal(by['Laptop - Busy'].suggest?.group, 'Computer and IT Equipment');
  assert.equal(by['Cutting Machine - Busy'].suggest?.group, 'Plant and Machinery');
  assert.equal(by['Flipkart Commission'].kind, 'channel_mismatch');
  assert.equal(by['Flipkart Commission'].suggest?.group, 'Flipkart Channel Fees');
  assert.equal(by['Lost Ledger'].kind, 'no_group');
  assert.ok(!by['Profit & Loss A/c'], 'P&L A/c sits on top by design');
  assert.ok(!by['Some Party'], 'parties sit directly in Sundry Debtors by design');
  assert.ok(!by['Amazon Closing Fee'] && !by['Dell Laptop']);
  assert.equal(r.summary.hanging, r.hanging.length);
});

test('a suggestion never crosses the books (an expense is not moved to an asset group)', () => {
  const r = buildChart({ groups, ledgers: [L('Computer repair', 'Indirect Expenses', 'Indirect Expenses')] });
  const s = r.hanging[0].suggest;
  assert.ok(!s || !['Computer and IT Equipment', 'Plant and Machinery'].includes(s.group), JSON.stringify(s));
});

test('look-alike fallback: placed next to ledgers with similar names', () => {
  const g = [...groups, G('Packaging Material', 'Indirect Expenses', 'Indirect Expenses')];
  const l = [L('Corrugated Box Small', 'Packaging Material', 'Indirect Expenses'), L('Corrugated Box Large', 'Indirect Expenses', 'Indirect Expenses')];
  const h = buildChart({ groups: g, ledgers: l }).hanging.find((x) => x.ledger === 'Corrugated Box Large')!;
  assert.equal(h.suggest?.group, 'Packaging Material');
  assert.equal(h.suggest?.confidence, 'medium');
});
