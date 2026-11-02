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

// The real shape (TallyPrime 7.0, July 2026, trimmed).
const grp = (n: string, main: string) => `<DSPACCNAME>\n <DSPDISPNAME>${n}</DSPDISPNAME>\n</DSPACCNAME>\n<PLAMT>\n <PLSUBAMT></PLSUBAMT>\n <BSMAINAMT>${main}</BSMAINAMT>\n</PLAMT>`;
const line = (n: string, sub: string) => `<DSPACCNAME>\n <DSPDISPNAME>${n}</DSPDISPNAME>\n</DSPACCNAME>\n<PLAMT>\n <PLSUBAMT>${sub}</PLSUBAMT>\n <BSMAINAMT></BSMAINAMT>\n</PLAMT>`;
const led = (n: string, sub: string) => `<BSNAME>\n <DSPACCNAME>\n  <DSPDISPNAME>${n}</DSPDISPNAME>\n </DSPACCNAME>\n</BSNAME>\n<BSAMT>\n <BSSUBAMT>${sub}</BSSUBAMT>\n <BSMAINAMT></BSMAINAMT>\n</BSAMT>`;

test('P&L XML (real Tally shape) → ledger rows as the Excel shows them + Nett Profit = Σ groups', () => {
  // Made-up figures (this repo is public); the structure is Tally's real answer.
  const xml = `<ENVELOPE>
    ${grp('Sales Accounts', '1000.00')}
    ${led('D2C Sales', '400.00')} ${led('Internal Transfer Sales', '')} ${led('Stock Transfers', '100.00')}
    ${led('Ecommerce Sales', '500.00')}
    ${grp('Cost of Sales ', '-600.00')}
    ${line('Opening Stock', '-900.00')} ${line('Add: Purchase Accounts', '-300.00')}
    ${line('Less: Closing Stock', '-800.00')} ${line('Direct Expenses', '-200.00')}
    ${led('Factory Overheads', '-80.00')} ${led('Manufacturing Costs', '-120.00')}
    ${grp('Indirect Incomes', '15.00')}
    ${led('Other Income', '10.00')} ${led('Shipping-Amazon-HARYANA', '5.00')}
    ${grp('Indirect Expenses', '-250.00')}
    ${led('Sales &amp; Marketing', '-260.00')} ${led('Amazon Damage Refunds', '10.00')}
  </ENVELOPE>`;
  const m = parsePnlXml(xml, '2026-07');
  assert.equal(m.periodLabel, 'Jul 2026');
  const by = Object.fromEntries(m.ledgerRows.map((r) => [r.name, r.amount]));
  assert.equal(by['D2C Sales'], 400);
  assert.equal(by['Opening Stock'], 900);
  assert.equal(by['Closing Stock'], 800);
  assert.equal(by['Factory Overheads'], 80);
  assert.equal(by['Direct Expenses'], undefined, 'a line whose ledgers follow is not booked twice');
  assert.equal(by['Stock Transfer'], 100);
  assert.equal(by['Raw Material Purchases'], 200);
  assert.equal(by['Sales & Marketing'], 260);
  assert.equal(by['Amazon Damage Refunds'], -10, 'contra under an expense group is negative');
  assert.equal(by['Internal Transfer Sales'], undefined, 'empty ledgers dropped');
  assert.equal(m.ledgerRows.filter((r) => r.name === 'Other Income').length, 2);
  assert.equal(m.nettProfit, 165);
  assert.ok(parsePnlXml('<ENVELOPE><X/></ENVELOPE>', '2026-07').warnings[0].includes('raw answer was kept'));
});

test('poll months: this + last month always, then up to 2 older ones not stored', () => {
  const now = Date.parse('2026-11-02T14:00:00Z');
  assert.deepEqual(monthsToPull(now, {}), ['2026-11', '2026-10', '2026-09', '2026-08']);
  assert.deepEqual(monthsToPull(now, { '2026-09': 'x', '2026-08': 'x' }), ['2026-11', '2026-10', '2026-07', '2026-06']);
});

test('schedule: from the 15th, Mon–Sat 10:00–19:00 IST; every 20 min until last month is final, then daily', () => {
  const st = (o = {}) => ({ lastTryAt: null, lastOkAt: null, lastError: null, company: null, months: {}, ...o });
  const at = (iso: string) => Date.parse(iso);
  assert.equal(scheduledDue(at('2026-11-02T08:00:00+05:30'), st()).due, false); // before 10:00 and before the 15th
  assert.equal(scheduledDue(at('2026-11-12T12:00:00+05:30'), st()).due, false); // the 12th: too early
  assert.equal(scheduledDue(at('2026-11-22T12:00:00+05:30'), st()).due, false); // Sunday
  assert.equal(scheduledDue(at('2026-11-16T19:30:00+05:30'), st()).due, false); // after 19:00
  assert.equal(scheduledDue(at('2026-11-16T11:00:00+05:30'), st()).due, true);
  assert.equal(scheduledDue(at('2026-11-16T11:00:00+05:30'), st({ lastTryAt: '2026-11-16T05:20:00Z' })).due, false); // 10:50 IST
  const final = st({ months: { '2026-10': '2026-11-16T05:30:00Z' }, lastOkAt: '2026-11-16T05:30:00Z', lastTryAt: '2026-11-16T05:30:00Z' });
  assert.equal(scheduledDue(at('2026-11-16T16:00:00+05:30'), final).due, false); // already taken today
  assert.equal(scheduledDue(at('2026-11-17T11:00:00+05:30'), final).due, true);  // daily refresh
  const early = st({ months: { '2026-10': '2026-11-10T06:00:00Z' } }); // taken before the 15th → not final
  assert.equal(scheduledDue(at('2026-11-16T11:00:00+05:30'), early).due, true);
});

test('Trial Balance XML → closing Dr / Cr per group, ledgers kept apart, ties checked (made-up figures)', async () => {
  const { parseTbXml, tbEnvelope } = await import('../src/connectors/tally/tb.js');
  const { assertTallyReadOnly } = await import('../src/connectors/sources/tally.js');
  assert.doesNotThrow(() => assertTallyReadOnly(tbEnvelope('2026-10', 'X')));
  const row = (n: string, dr: string, cr: string, ledger = false) =>
    `${ledger ? '<BSNAME>' : ''}<DSPACCNAME><DSPDISPNAME>${n}</DSPDISPNAME></DSPACCNAME>${ledger ? '</BSNAME>' : ''}<DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>${dr}</DSPCLDRAMTA></DSPCLDRAMT><DSPCLCRAMT><DSPCLCRAMTA>${cr}</DSPCLCRAMTA></DSPCLCRAMT></DSPACCINFO>`;
  const xml = `<ENVELOPE>${row('Capital Account', '', '500.00')}${row('Current Assets', '-700.00', '')}${row('Bank', '-200.00', '', true)}${row('Sales Accounts', '', '400.00')}${row('Indirect Expenses', '-200.00', '')}${row('Suspense', '', '')}</ENVELOPE>`;
  const tb = parseTbXml(xml, '2026-10');
  assert.equal(tb.rows.length, 5);
  assert.equal(tb.rows.find((r) => r.name === 'Bank')?.level, 'ledger');
  assert.equal(tb.totalDebit, 900);
  assert.equal(tb.totalCredit, 900);
  assert.equal(tb.difference, 0);
  assert.deepEqual(tb.warnings, []);
  // Live shape: exploded ledgers come unwrapped right after their group → told apart by the groups-only names.
  const flat = `<ENVELOPE>${row('Capital Account', '', '500.00')}${row('Partner A', '', '300.00')}${row('Partner B', '', '200.00')}${row('Current Assets', '-500.00', '')}${row('Bank', '-500.00', '')}</ENVELOPE>`;
  const ex = parseTbXml(flat, '2026-10', new Set(['Capital Account', 'Current Assets']));
  assert.deepEqual(ex.rows.map((r) => r.level), ['group', 'ledger', 'ledger', 'group', 'ledger']);
  assert.equal(ex.totalCredit, 500);
  assert.equal(ex.difference, 0);
  assert.match(parseTbXml(`<ENVELOPE>${row('A', '-10', '')}</ENVELOPE>`, '2026-10').warnings[0], /doesn't tie/);
  assert.match(parseTbXml('<ENVELOPE/>', '2026-10').warnings[0], /raw answer was kept/);
});
