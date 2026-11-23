// Claim back playbook + message: every party has steps and attachments; the message carries the amounts, PAN, TAN and period.
import test from 'node:test';
import assert from 'node:assert/strict';
import { billListRows, claimMessage, playbookFor, type ClaimPlatform } from '../../client/src/data/tds/claims.ts';

const p: ClaimPlatform = {
  id: 'google', name: 'Google Ads', kind: 'reimburse', parties: ['Demo Google'], why: '', deducted: 600, received: 0, pending: 600, readyNow: 400,
  quarters: [
    { quarter: '2026-Q1', label: 'Q1 Apr–Jun 2026', deducted: 400, received: 0, pending: 400, certFrom: '2026-08-15', state: 'ready', record: null, bills: 2 },
    { quarter: '2026-Q3', label: 'Q3 Oct–Dec 2026', deducted: 200, received: 0, pending: 200, certFrom: '2027-02-15', state: 'wait', record: null, bills: 1 },
  ],
  bills: [
    { date: '2026-05-01', quarter: '2026-Q1', party: 'Demo Google', voucher: 'Purchase-Expense 1', invoiceNo: 'G1', taxable: 10000, tds: 200, tdsLedger: 'TDS Payable - 194C' },
    { date: '2026-06-01', quarter: '2026-Q1', party: 'Demo Google', voucher: 'Purchase-Expense 2', invoiceNo: 'G2', taxable: 10000, tds: 200, tdsLedger: 'TDS Payable - 194C' },
    { date: '2026-10-01', quarter: '2026-Q3', party: 'Demo Google', voucher: 'Purchase-Expense 3', invoiceNo: 'G3', taxable: 10000, tds: 200, tdsLedger: 'TDS Payable - 194C' },
  ],
};
const company = { name: 'DEMO CO', pan: 'AAAAA0000A', gstin: '09AAAAA0000A1Z5' };
const settings = { tan: 'DELD00000D', metaAdAccount: '', googleCustomerId: '123-456-7890', porterAccount: '', contactName: 'Demo', contactPhone: '', contactEmail: 'a@demo' };

test('message for the chosen quarters', () => {
  const m = claimMessage(p, [p.quarters[0]], company, settings);
  assert.match(m.subject, /Q1 Apr–Jun 2026/);
  assert.match(m.subject, /Rs 400\.00/);
  for (const s of ['PAN: AAAAA0000A', 'TAN: DELD00000D', 'Google Ads customer ID: 123-456-7890', 'Invoices: 2', 'TDS to refund: Rs 400.00', 'Google Ads invoices']) assert.ok(m.body.includes(s), s);
  assert.ok(!/—/.test(m.body));
});

test('bill list and playbooks', () => {
  const rows = billListRows(p, ['2026-Q1']);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[3].slice(3, 5), [20000, 400]);
  assert.equal(rows[1][0], '01-05-2026');
  for (const id of ['meta', 'google', 'amazon', 'porter', 'shiprocket', 'flipkart', 'other:demo', 'credit:amazon']) {
    const b = playbookFor(id);
    assert.ok(b.steps.length >= 3 && b.attach.length >= 1 && b.where, id);
  }
  assert.equal(playbookFor('google').to, 'tds.certificates@google.com');
  assert.equal(playbookFor('credit:amazon').channel, 'return');
});
