// Tally: read-only guard, P&L XML → the Excel reader's ledger rows, which months a poll pulls. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTallyReadOnly, companyListEnvelope } from '../src/connectors/sources/tally.js';
import { monthsToPull, scheduledDue } from '../src/connectors/tally/snapshots.js';
import { parsePnlXml, pnlEnvelope } from '../src/connectors/tally/pnl.js';

test('Tally guard: exports only', () => {
  assert.doesNotThrow(() => assertTallyReadOnly(companyListEnvelope()));
  assert.doesNotThrow(() => assertTallyReadOnly(pnlEnvelope('2026-10', 'Heatronics Medical Devices Private Limited')));
  assert.throws(() => assertTallyReadOnly('<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER></ENVELOPE>'));
  assert.throws(() => assertTallyReadOnly('<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><TALLYMESSAGE><VOUCHER ACTION="Create"/></TALLYMESSAGE></BODY></ENVELOPE>'));
  assert.match(pnlEnvelope('2026-10'), /<SVFROMDATE>20261001<\/SVFROMDATE>[\s\S]*<SVTODATE>20261031<\/SVTODATE>/);
});

const row = (name: string, sub: string, main: string) =>
  `<DSPACCNAME><DSPDISPNAME>${name}</DSPDISPNAME></DSPACCNAME><PLAMT><PLSUBAMT>${sub}</PLSUBAMT><BSMAINAMT>${main}</BSMAINAMT></PLAMT>`;

test('P&L XML → ledger rows + Nett Profit (contra ledger shown negative, stock lines kept, totals skipped)', () => {
  const xml = `<ENVELOPE>
    ${row('Opening Stock', '', '1,20,000.00')}
    ${row('Sales Accounts', '', '9,50,000.00')}
    ${row('Sales Amazon', '7,00,000.00', '')}
    ${row('Sales Shopify', '2,60,000.00', '')}
    ${row('Sales Returns', '-10,000.00', '')}
    ${row('Indirect Expenses', '', '-3,00,000.00')}
    ${row('Rent', '-1,00,000.00', '')}
    ${row('Discount Received', '5,000.00', '')}
    ${row('Gross Profit c/o', '', '4,00,000.00')}
    ${row('Nett Profit', '', '1,00,000.00')}
  </ENVELOPE>`;
  const m = parsePnlXml(xml, '2026-10');
  assert.equal(m.periodLabel, 'Oct 2026');
  assert.deepEqual(m.ledgerRows.map((r) => [r.name, r.amount]), [
    ['Opening Stock', 120000], ['Sales Amazon', 700000], ['Sales Shopify', 260000], ['Sales Returns', -10000],
    ['Rent', 100000], ['Discount Received', -5000],
  ]);
  assert.equal(m.nettProfit, 100000);
  assert.equal(parsePnlXml(row('Nett Loss', '', '-25,000.00'), '2026-10').nettProfit, -25000);
  assert.ok(parsePnlXml('<ENVELOPE><X/></ENVELOPE>', '2026-10').warnings[0].includes('raw answer was kept'));
});

test('poll months: this + last month always, then up to 2 older ones not stored', () => {
  const now = Date.parse('2026-11-02T14:00:00Z');
  assert.deepEqual(monthsToPull(now, {}), ['2026-11', '2026-10', '2026-09', '2026-08']);
  assert.deepEqual(monthsToPull(now, { '2026-09': 'x', '2026-08': 'x' }), ['2026-11', '2026-10', '2026-07', '2026-06']);
});

test('schedule: from the 10th, Mon–Sat 10:00–19:00 IST; every 20 min until last month is final, then daily', () => {
  const st = (o = {}) => ({ lastTryAt: null, lastOkAt: null, lastError: null, company: null, months: {}, ...o });
  const at = (iso: string) => Date.parse(iso);
  assert.equal(scheduledDue(at('2026-11-02T08:00:00+05:30'), st()).due, false); // before 10:00 and before the 10th
  assert.equal(scheduledDue(at('2026-11-09T12:00:00+05:30'), st()).due, false); // 9th
  assert.equal(scheduledDue(at('2026-11-15T12:00:00+05:30'), st()).due, false); // Sunday
  assert.equal(scheduledDue(at('2026-11-10T19:30:00+05:30'), st()).due, false); // after 19:00
  assert.equal(scheduledDue(at('2026-11-10T11:00:00+05:30'), st()).due, true);
  assert.equal(scheduledDue(at('2026-11-10T11:00:00+05:30'), st({ lastTryAt: '2026-11-10T05:20:00Z' })).due, false); // 10:50 IST
  const final = st({ months: { '2026-10': '2026-11-10T05:30:00Z' }, lastOkAt: '2026-11-10T05:30:00Z', lastTryAt: '2026-11-10T05:30:00Z' });
  assert.equal(scheduledDue(at('2026-11-10T16:00:00+05:30'), final).due, false); // already taken today
  assert.equal(scheduledDue(at('2026-11-11T11:00:00+05:30'), final).due, true);  // daily refresh
  const early = st({ months: { '2026-10': '2026-11-03T06:00:00Z' } }); // taken before the 10th → not final
  assert.equal(scheduledDue(at('2026-11-10T11:00:00+05:30'), early).due, true);
});
