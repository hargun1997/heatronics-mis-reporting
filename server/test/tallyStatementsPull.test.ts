// Statements pull (22 Nov 2026): P&L + Trial Balance per month on demand, final vs provisional copies, the TB index
// kept when Tally is closed, and one Tally request stream at a time. Fake Tally (stubbed fetch), local store, no network.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.INGEST_STORE = 'local';
process.env.INGEST_STORE_DIR = mkdtempSync(path.join(os.tmpdir(), 'tally-statements-test-'));

const { writeJson, readJson } = await import('../src/ingest/objectStore.js');
const snaps = await import('../src/connectors/tally/snapshots.js');
const { isFinalCopy, statementMonthsDue, pullStatements, pollTally, readTallyState, readTallyTb, withTallyLock } = snaps;
const { startStatementsPull, resetStatementsJob } = await import('../src/connectors/tally/statementsJob.js');

const creds = { host: 'http://tally.test', port: '9000', company: 'Test Co' };

// Made-up figures (this repo is public); the shapes are Tally's real answers.
const PNL = `<ENVELOPE><DSPACCNAME><DSPDISPNAME>Sales Accounts</DSPDISPNAME></DSPACCNAME><PLAMT><PLSUBAMT></PLSUBAMT><BSMAINAMT>1000.00</BSMAINAMT></PLAMT>
<BSNAME><DSPACCNAME><DSPDISPNAME>D2C Sales</DSPDISPNAME></DSPACCNAME></BSNAME><BSAMT><BSSUBAMT>1000.00</BSSUBAMT><BSMAINAMT></BSMAINAMT></BSAMT></ENVELOPE>`;
const tbRow = (n: string, dr: string, cr: string) => `<DSPACCNAME><DSPDISPNAME>${n}</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>${dr}</DSPCLDRAMTA></DSPCLDRAMT><DSPCLCRAMT><DSPCLCRAMTA>${cr}</DSPCLCRAMTA></DSPCLCRAMT></DSPACCINFO>`;
const TB_GROUPS = `<ENVELOPE>${tbRow('Capital Account', '', '500.00')}${tbRow('Bank Accounts', '-500.00', '')}</ENVELOPE>`;
const TB_FULL = `<ENVELOPE>${tbRow('Capital Account', '', '500.00')}${tbRow('Bank Accounts', '-500.00', '')}${tbRow('HDFC Bank', '-500.00', '')}</ENVELOPE>`;

let calls: string[] = [];
let tallyOpen = true;
function fakeTally(): void {
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = String(init.body);
    if (!tallyOpen) throw new Error('connect ECONNREFUSED');
    const kind = /List of Companies/i.test(body) ? 'companies' : /Profit and Loss/i.test(body) ? 'pnl' : /Trial Balance/i.test(body) ? (/<EXPLODEFLAG>Yes/.test(body) ? 'tb-full' : 'tb-groups') : 'other';
    const to = /<SVTODATE>(\d{6})/.exec(body)?.[1];
    calls.push(to ? `${kind}:${to}` : kind);
    const text = kind === 'companies' ? '<ENVELOPE><SVCURRENTCOMPANY>Test Co</SVCURRENTCOMPANY></ENVELOPE>' : kind === 'pnl' ? PNL : kind === 'tb-full' ? TB_FULL : kind === 'tb-groups' ? TB_GROUPS : '<ENVELOPE/>';
    return new Response(text, { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  calls = []; tallyOpen = true; fakeTally(); resetStatementsJob();
  await writeJson('tally/state', { lastTryAt: null, lastOkAt: null, lastError: null, company: null, months: {} });
});

test('final copy = taken 5+ days after month end (IST)', () => {
  assert.equal(isFinalCopy('2026-10', null), false);
  assert.equal(isFinalCopy('2026-10', '2026-11-02T14:57:50Z'), false); // the 2 Nov copy: provisional
  assert.equal(isFinalCopy('2026-10', '2026-11-05T18:30:00Z'), true);  // 6 Nov 00:00 IST
  assert.equal(isFinalCopy('2026-11', '2026-11-22T15:00:00Z'), false); // running month: never final
});

test('months due: missing or provisional TB / P&L, newest first, running month always', () => {
  const now = Date.parse('2026-11-22T16:00:00Z');
  const late = '2026-11-20T06:00:00Z';
  const due = statementMonthsDue(now, { months: { '2026-10': late, '2026-09': late }, tbMonths: { '2026-10': late, '2026-09': '2026-10-02T06:00:00Z' } }, 4);
  assert.deepEqual(due, ['2026-11', '2026-09', '2026-08']); // Oct final both; Sep TB provisional; Aug nothing
});

test('pull: P&L + both TB requests per month, newest first; stored and indexed; read only', async () => {
  const r = await pullStatements(creds, { months: ['2026-09', '2026-10'], now: Date.parse('2026-11-22T16:00:00Z') });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.done, ['2026-10', '2026-09']);
  assert.deepEqual(calls, ['companies', 'pnl:202610', 'tb-groups:202610', 'tb-full:202610', 'pnl:202609', 'tb-groups:202609', 'tb-full:202609']);
  const tb = await readTallyTb('2026-10');
  assert.ok(tb);
  assert.equal(tb.rows.find((x) => x.name === 'HDFC Bank')?.level, 'ledger');
  assert.equal(tb.difference, 0);
  const st = await readTallyState();
  assert.deepEqual(Object.keys(st.tbMonths ?? {}).sort(), ['2026-09', '2026-10']);
  assert.equal(st.lastOkAt, r.at);
  assert.ok(await readJson('tally/pnl-2026-09', null), 'a month with no P&L copy before is still pulled (old backfill skipped it)');
});

test('Tally closed: status down, TB index and copies kept (the old poll wiped the index first)', async () => {
  await pullStatements(creds, { months: ['2026-10'] });
  tallyOpen = false;
  const before = await readTallyState();
  // An older basis on the state used to empty tbMonths before the reach check.
  await writeJson('tally/state', { ...before, tbBasis: 'month-start' });
  const r = await pullStatements(creds, { months: ['2026-10'] });
  assert.equal(r.status, 'down');
  assert.deepEqual(Object.keys((await readTallyState()).tbMonths ?? {}), ['2026-10']);
  const p = await pollTally(creds, { force: true, skipBooks: true });
  assert.equal(p.status, 'down');
  assert.deepEqual(Object.keys((await readTallyState()).tbMonths ?? {}), ['2026-10']);
  assert.ok(await readTallyTb('2026-10'));
});

test('budget: stops between months, never halfway; the rest is "remaining"', async () => {
  const r = await pullStatements(creds, { months: ['2026-10', '2026-09'], budgetMs: 10_000 });
  assert.deepEqual(r.done, []);
  assert.deepEqual(r.remaining, ['2026-10', '2026-09']);
  assert.deepEqual(calls, ['companies']);
});

test('lock: Tally requests never interleave', async () => {
  const order: string[] = [];
  const slow = (id: string) => withTallyLock(async () => { order.push(`${id}+`); await new Promise((r) => setTimeout(r, 20)); order.push(`${id}-`); });
  await Promise.all([slow('a'), slow('b')]);
  assert.deepEqual(order, ['a+', 'a-', 'b+', 'b-']);
  // A failure does not block the next one.
  await assert.rejects(withTallyLock(async () => { throw new Error('x'); }));
  assert.equal(await withTallyLock(async () => 7), 7);
});

test('job: answers done within the wait; a second start joins the running job', async () => {
  const j = await startStatementsPull(creds, ['2026-10'], 5_000);
  assert.equal(j.status, 'done');
  assert.equal(j.status === 'done' && j.result.status, 'ok');
  tallyOpen = true;
  const a = startStatementsPull(creds, ['2026-09'], 0);
  const b = startStatementsPull(creds, ['2026-08'], 5_000);
  const [ja, jb] = await Promise.all([a, b]);
  assert.equal(ja.status === 'running' || ja.status === 'done', true);
  assert.equal(jb.status, 'done');
  assert.equal(calls.filter((c) => c.startsWith('pnl:202608')).length, 0, 'joined, not a second pull');
});
