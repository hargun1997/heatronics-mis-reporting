// Feeds & pulls (10 Nov 2026): Amazon Sales API windows, stale live sources on the Fix list, every close slot checked,
// the daily auto-pull of the automatic close slots (plan, stage, run, who may call it). Synthetic data, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.INGEST_STORE = 'local';
process.env.INGEST_STORE_DIR = mkdtempSync(path.join(os.tmpdir(), 'feeds-pulls-test-'));

const { orderMetricsFacts, salesWindows, SALES_WINDOW_DAYS } = await import('../src/connectors/sources/amazon.js');
const { cachedFacts, liveFactsHealth } = await import('../src/connectors/factsCache.js');
const { CLOSE_SLOTS, LIVE_BOUNDARY, slotProblems } = await import('../src/connectors/slots/closeSlots.js');
const { autoPullCaller, autoPullDue, planAutoPull, runAutoPull, runCounts, stagePullServer } = await import('../src/connectors/slots/autoPull.js');
const { SLOT_SOURCES } = await import('../src/connectors/slots/catalog.js');
const { liveFactItems, serverItems, slotItems } = await import('../src/services/issuesInbox.js');
const { ALL_SLOTS: REPORT_SLOTS } = await import('../../client/src/data/ingest/catalog.ts');
const { LIVE_BOUNDARY: CLIENT_BOUNDARY } = await import('../../client/src/data/misDeck/liveDeck.ts');

// ---- 1. Amazon Sales API: > 821 days is asked in windows -------------------------------------------

test('salesWindows: a 3-year range is cut into ≤ 365-day windows that join with no gap or overlap', () => {
  const w = salesWindows('2023-12-01', '2026-11-09', '2026-11-09');
  assert.ok(w.length >= 3);
  assert.equal(w[0].from, '2023-12-01');
  assert.equal(w[w.length - 1].to, '2026-11-09');
  for (let i = 0; i < w.length; i++) {
    const days = (Date.parse(w[i].to) - Date.parse(w[i].from)) / 86_400_000 + 1;
    assert.ok(days <= SALES_WINDOW_DAYS && days <= 800, `window ${i} has ${days} days`);
    if (i) assert.equal((Date.parse(w[i].from) - Date.parse(w[i - 1].to)) / 86_400_000, 1);
  }
  assert.deepEqual(salesWindows('2026-11-01', '2026-12-31', '2026-11-09'), [{ from: '2026-11-01', to: '2026-11-09' }], 'capped at today');
});

test('orderMetricsFacts: one call per window, merged; a too-old window Amazon refuses is left out with a note', async () => {
  const calls: string[] = [];
  const get = async (p: string) => {
    const interval = new URLSearchParams(p.split('?')[1]).get('interval')!;
    calls.push(interval);
    const from = interval.slice(0, 10);
    if (from < '2024-06-01') throw new Error('SP-API 400 InvalidInput: interval too old');
    return { payload: [{ interval: `${from}T00:00:00+05:30`, unitCount: 2, orderCount: 1, totalSales: { amount: '1180.00' } }] };
  };
  const now = Date.parse('2026-11-09T06:00:00Z');
  const r = await orderMetricsFacts(get, 'MP', '2023-12-01', '2026-11-09', now);
  assert.equal(calls.length, salesWindows('2023-12-01', '2026-11-09', '2026-11-09').length);
  assert.ok(r.facts.length >= 2, 'facts from every window that answered');
  assert.equal(r.facts[0].gmv, 1180);
  assert.match(r.warnings.join(' '), /older than it keeps/);
  // A recent failure (login, outage) still fails the source.
  await assert.rejects(orderMetricsFacts(async () => { throw new Error('SP-API 403 Unauthorized'); }, 'MP', '2026-10-01', '2026-11-09', now), /403/);
});

// ---- 2. A failing refresh is recorded and shown, never swallowed ----------------------------------------

test('cachedFacts: a failed background refresh keeps the last copy and returns staleError; liveFactsHealth sees it', async () => {
  const src = `stale${Date.now()}`;
  const fact = (date: string) => ({ source: src, channel: 'D2C', date, revenue: 1, units: 1, orders: 1, fees: 0 });
  const t0 = Date.parse('2026-11-08T03:00:00Z');
  const ok = await cachedFacts(src, '2026-11-01', '2026-11-08', async (f) => ({ facts: [fact(f)], warnings: [] }), { now: t0 });
  assert.equal(ok.facts.length, 1);
  assert.equal(ok.staleError, undefined);
  const jobs: Promise<void>[] = [];
  const t1 = t0 + 2 * 86_400_000;
  await cachedFacts(src, '2026-11-01', '2026-11-10', async () => { throw new Error('Shopify took over 25 s'); }, { now: t1, background: (p) => jobs.push(p) });
  await Promise.all(jobs);
  const again = await cachedFacts(src, '2026-11-01', '2026-11-10', async () => { throw new Error('Shopify took over 25 s'); }, { now: t1 + 120_000, background: (p) => jobs.push(p) });
  assert.equal(again.facts.length, 1, 'last good copy still served');
  assert.match(again.staleError ?? '', /25 s/);
  await Promise.all(jobs);
  const [h] = await liveFactsHealth([{ id: src, label: 'Shopify' }], t1 + 180_000);
  assert.match(h.error ?? '', /25 s/);
  assert.equal(h.cachedAt, new Date(t0).toISOString());
  // Fix item: 2 days old → medium, names the age and the error.
  const items = liveFactItems({ today: '2026-11-10', liveFacts: [h] }, t1 + 180_000);
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, 'medium');
  assert.match(items[0].title, /2 days old/);
  assert.match(items[0].detail, /25 s/);
});

test('liveFactItems: no error = nothing; Flipkart approval wait = one low item; ≥ 3 days = high', () => {
  const now = Date.parse('2026-11-10T06:00:00Z');
  assert.equal(liveFactItems({ today: '2026-11-10', liveFacts: [{ id: 'meta', label: 'Meta', cachedAt: '2026-11-01T00:00:00Z', error: null, errorAt: null }] }, now).length, 0);
  const fk = liveFactItems({ today: '2026-11-10', liveFacts: [{ id: 'flipkart', label: 'Flipkart', cachedAt: null, error: 'App is not in approved state', errorAt: null }] }, now);
  assert.deepEqual(fk.map((i) => [i.id, i.severity]), [['live:flipkart', 'low']]);
  const old = liveFactItems({ today: '2026-11-10', liveFacts: [{ id: 'amazon', label: 'Amazon', cachedAt: '2026-11-05T00:00:00Z', error: 'boom', errorAt: null }] }, now);
  assert.equal(old[0].severity, 'high');
});

// ---- 3. Every close slot is checked ---------------------------------------------------------------------

test('server close-slot list = the client catalog (ids, labels, required) and the same live boundary', () => {
  assert.equal(LIVE_BOUNDARY, CLIENT_BOUNDARY);
  const client = REPORT_SLOTS.map((s: { connectorId: string; slotId: string; label: string; required: boolean }) => [s.connectorId, s.slotId, s.label, s.required]);
  assert.deepEqual(CLOSE_SLOTS.map((s) => [s.connectorId, s.slotId, s.label, s.required]), client);
});

test('missing reports: every slot for last month, automatic ones included, each named', () => {
  const reports = [
    { connectorId: 'blinkit', slotId: 'order-charges', periodKey: '2026-10', rows: 40, first: '2026-10-05', last: '2026-10-23' },
    { connectorId: 'flipkart', slotId: 'settlement', periodKey: '2026-10', rows: 0, first: null, last: null },
    ...CLOSE_SLOTS.filter((s) => !['blinkit', 'flipkart', 'meta', 'amazon'].includes(s.connectorId))
      .map((s) => ({ connectorId: s.connectorId, slotId: s.slotId, periodKey: '2026-10', rows: 5, first: '2026-10-01', last: '2026-10-31' })),
    { connectorId: 'amazon', slotId: 'business-report', periodKey: '2026-10', rows: 5, first: null, last: null },
  ];
  const p = slotProblems({ today: '2026-11-12', reports, from: '2026-10' });
  const keys = p.map((x) => `${x.slot.connectorId}|${x.slot.slotId}|${x.kind}`).sort();
  assert.deepEqual(keys, ['amazon|unified-transaction|missing', 'blinkit|order-charges|partial', 'flipkart|settlement|empty', 'meta|ad-spend|missing']);
  const feeds = Object.fromEntries(SLOT_SOURCES.map((d) => [`${d.connectorId}|${d.slotId}`, { source: d.source, connected: true }]));
  const items = slotItems({ today: '2026-11-12', reports, locked: new Set(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']), slotFeeds: feeds });
  const amz = items.find((i) => i.id === 'slot:amazon')!;
  assert.match(amz.detail, /Settlement: Oct 26 not loaded/);
  assert.equal(amz.severity, 'high', 'required, past the 10th');
  assert.match(amz.fix, /Pull now/);
  assert.match(items.find((i) => i.id === 'slot:blinkit')!.detail, /only 5–23 Oct/);
  assert.match(items.find((i) => i.id === 'slot:flipkart')!.detail, /0 rows/);
  // serverItems uses the full check when reports are given (no old upload:* items).
  const all = serverItems({ today: '2026-11-12', health: null, chart: null, tb: null, tally: null, committed: new Set(), everUsed: new Set(['flipkart']), anomalies: [], reports, locked: new Set() });
  assert.ok(all.some((i) => i.id === 'slot:meta'));
  assert.ok(!all.some((i) => i.id.startsWith('upload:')));
});

// ---- 4. Daily auto-pull ---------------------------------------------------------------------------------

const def = (connectorId: string, slotId: string) => SLOT_SOURCES.find((d) => d.connectorId === connectorId && d.slotId === slotId)!;

test('autoPullDue: once per IST day after 07:00', () => {
  assert.equal(autoPullDue(Date.parse('2026-11-10T01:00:00Z'), { lastRunDay: null }).due, false); // 06:30 IST
  assert.equal(autoPullDue(Date.parse('2026-11-10T02:17:00Z'), { lastRunDay: null }).due, true);
  assert.equal(autoPullDue(Date.parse('2026-11-10T09:17:00Z'), { lastRunDay: '2026-11-10' }).due, false);
  assert.equal(autoPullDue(Date.parse('2026-11-01T02:17:00Z'), { lastRunDay: '2026-10-31' }).due, true, 'runs on the 1st too');
});

test('planAutoPull: last month + this month; uploads never replaced; locked months skipped; live connectors not saved this month', () => {
  const live = new Set(['amazon', 'amazonads', 'meta', 'googleads', 'shopify', 'flipkart']);
  const reports = [
    { connectorId: 'shiprocket', slotId: 'passbook', periodKey: '2026-10', rows: 9, first: '2026-10-01', last: '2026-10-31', fileName: 'passbook.xlsx', savedAt: '2026-11-02T05:00:00Z' },
    { connectorId: 'easebuzz', slotId: 'settlement', periodKey: '2026-10', rows: 9, first: '2026-10-01', last: '2026-10-31', fileName: 'api-pull-easebuzz-settlement-2026-10.json', savedAt: '2026-11-09T05:00:00Z' },
  ];
  const t = planAutoPull({ today: '2026-11-12', defs: SLOT_SOURCES, reports, locked: new Set(), liveConnectors: live });
  const keys = t.map((x) => `${x.connectorId}|${x.slotId}|${x.periodKey}`);
  assert.ok(keys.includes('amazon|unified-transaction|2026-10'));
  assert.ok(keys.includes('meta|ad-spend|2026-10'));
  assert.ok(!keys.includes('meta|ad-spend|2026-11'), 'live numbers stay live for the running month');
  assert.ok(keys.includes('delhivery|wallet|2026-11'));
  assert.ok(!keys.includes('shiprocket|passbook|2026-10'), 'upload wins');
  assert.ok(!keys.includes('easebuzz|settlement|2026-10'), 'clean pull saved after the 8th: not pulled again');
  assert.ok(!keys.some((k) => k.startsWith('tally|pnl') || k.startsWith('tranzact|sales') || k.startsWith('blinkit')), 'browser-read and upload slots stay manual');
  assert.equal(planAutoPull({ today: '2026-11-12', defs: SLOT_SOURCES, reports, locked: new Set(['2026-10', '2026-11']) }).length, 0);
});

test('stagePullServer: clean facts saved; a warning, a partial finished month or another month needs review; the running month is not judged for coverage', () => {
  const f = (date: string) => ({ source: 'easebuzz', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: 10 });
  const d = def('easebuzz', 'settlement');
  const full = stagePullServer(d, '2026-10', { facts: [f('2026-10-01'), f('2026-10-30')], warnings: [], trace: [] } as never, '2026-11-12T02:00:00Z', '2026-11');
  assert.equal(full.kind, 'save');
  if (full.kind === 'save') {
    assert.equal(full.commit.fileName, 'api-pull-easebuzz-settlement-2026-10.json');
    assert.equal(full.commit.rowCount, 2);
  }
  assert.equal(stagePullServer(d, '2026-10', { facts: [f('2026-10-01')], warnings: ['x'], trace: [] } as never, '', '2026-11').kind, 'review');
  assert.equal(stagePullServer(d, '2026-10', { facts: [f('2026-10-12'), f('2026-10-14')], warnings: [], trace: [] } as never, '', '2026-11').kind, 'review');
  assert.equal(stagePullServer(d, '2026-10', { facts: [f('2026-09-30')], warnings: [], trace: [] } as never, '', '2026-11').kind, 'review');
  assert.equal(stagePullServer(d, '2026-11', { facts: [f('2026-11-01'), f('2026-11-09')], warnings: [], trace: [] } as never, '', '2026-11').kind, 'save');
  assert.equal(stagePullServer(def('tranzact', 'sales'), '2026-10', { rows: [['a']], warnings: [], trace: [] } as never, '', '2026-11').kind, 'manual');
});

test('runAutoPull: saves clean pulls, reports the rest, counts only for machines, once a day', async () => {
  const saved: string[] = [];
  let state = { lastRunDay: null as string | null };
  const now = Date.parse('2026-11-12T02:17:00Z');
  const deps = {
    now: () => now,
    defs: [def('easebuzz', 'settlement'), def('delhivery', 'wallet'), def('shiprocket', 'passbook')],
    creds: async (d: { connectorId: string }) => ({ creds: {}, missing: d.connectorId === 'shiprocket' ? ['email'] : [] }),
    pull: async (d: { connectorId: string }, _c: unknown, pk: string) => d.connectorId === 'delhivery'
      ? { status: 'failed' as const, error: 'Delhivery 401' }
      : { status: 'done' as const, pulledAt: new Date(now).toISOString(), result: { facts: [{ source: 'easebuzz', channel: 'D2C', date: `${pk}-01`, revenue: 0, units: 0, orders: 0, fees: 1 }, { source: 'easebuzz', channel: 'D2C', date: pk === '2026-10' ? '2026-10-31' : '2026-11-11', revenue: 0, units: 0, orders: 0, fees: 1 }], warnings: [], trace: [] } },
    reports: async () => [],
    locked: async () => new Set<string>(),
    save: async (c: { connectorId: string; periodKey: string }) => { saved.push(`${c.connectorId}|${c.periodKey}`); return c as never; },
    readState: async () => state as never,
    writeState: async (s: typeof state) => { state = s; },
  };
  const out = await runAutoPull(deps as never);
  assert.equal(out.status, 'done');
  assert.deepEqual(saved.sort(), ['easebuzz|2026-10', 'easebuzz|2026-11']);
  const c = runCounts(out.run);
  assert.deepEqual(c, { tried: 6, saved: 2, review: 0, failed: 2, notConnected: 2, running: 0 });
  assert.equal(state.lastRunDay, '2026-11-12');
  assert.equal((await runAutoPull(deps as never)).status, 'not_due', 'once a day');
});

test('autoPullCaller: token or sign-in; never open on Cloud Run without a token', () => {
  const cloud = { K_SERVICE: 'x' } as NodeJS.ProcessEnv;
  assert.equal(autoPullCaller({ headers: {} }, 'tok-1', cloud), null);
  assert.equal(autoPullCaller({ headers: { authorization: 'Bearer nope' } }, 'tok-1', cloud), null);
  assert.equal(autoPullCaller({ headers: { authorization: 'Bearer tok-1' } }, 'tok-1', cloud), 'machine');
  assert.equal(autoPullCaller({ headers: {}, htxAuthed: true }, 'tok-1', cloud), 'person');
  assert.equal(autoPullCaller({ headers: {} }, null, cloud), null);
  assert.equal(autoPullCaller({ headers: {} }, null, {} as NodeJS.ProcessEnv), 'machine', 'local dev only');
});

test('missing reports start at each source\'s first stored month (Shopflo from Aug, Flipkart from Oct: no Apr–Jul nagging)', () => {
  const r = (connectorId: string, slotId: string, periodKey: string) => ({ connectorId, slotId, periodKey, rows: 3, first: null, last: null });
  const reports = [r('shopflo', 'invoice', '2026-08'), r('shopflo', 'invoice', '2026-10'), r('flipkart', 'settlement', '2026-10')];
  const items = slotItems({ today: '2026-11-12', reports, locked: new Set() });
  const sf = items.find((i) => i.id === 'slot:shopflo')!;
  assert.equal(sf.count, 1, 'only Sep (between Aug and Oct) is missing');
  assert.match(sf.title, /1 month not complete \(Sep 26\)/);
  assert.ok(!items.some((i) => i.id === 'slot:flipkart'), 'Flipkart stored for Oct: nothing earlier flagged');
  // A connector never loaded still shows, low.
  assert.equal(items.find((i) => i.id === 'slot:snapmint')!.severity, 'low');
});

test('missing-report sig is stable: same missing pairs → same sig (Done holds); a new missing pair → new sig', () => {
  const r = (periodKey: string, rows = 3) => ({ connectorId: 'shopflo', slotId: 'invoice', periodKey, rows, first: null, last: null });
  const sig = (today: string, reports: ReturnType<typeof r>[]) => slotItems({ today, reports, locked: new Set() }).find((i) => i.id === 'slot:shopflo')?.sig;
  const a = sig('2026-11-12', [r('2026-08'), r('2026-10')]);
  assert.equal(sig('2026-11-28', [r('2026-08'), r('2026-10')]), a, 'later in the month, nothing new: same sig');
  assert.equal(sig('2026-11-12', [r('2026-08'), r('2026-10', 0)]), sig('2026-11-12', [r('2026-08'), r('2026-10', 0)]));
  assert.notEqual(sig('2026-12-12', [r('2026-08'), r('2026-10')]), a, 'Nov now missing too: comes back');
});
