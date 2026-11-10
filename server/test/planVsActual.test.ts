// Plan vs Actual: the pure comparison, the server copy, the Base snapshot and the cleaning of what a browser sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlanVsActual, monthsSubtitle, planMonthsOf, statusOf, fyOfKey, type ActualMonth, type PlanMonthRow } from '../src/planning/planVsActual.ts';
import { cleanActuals, cleanPlanRows, composeVsActual } from '../src/planning/vsActual.ts';
import { BASE_PLAN_MONTHS, BASE_PLAN_START } from '../src/planning/basePlanMonths.ts';
import { runPlan } from '../../client/src/data/planning/engine.ts';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { runRateArr } from '../../client/src/data/planning/growth.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const row = (key: string, rev: number, ebitda: number, arr = rev * 12): PlanMonthRow => ({ key, label: key, fy: fyOfKey(key), netRevenue: rev, grossProfit: rev * 0.5, cm3: rev * 0.1, ebitda, units: 100, arr });
const act = (key: string, rev: number | null, ebitda: number | null = null, level: ActualMonth['level'] = 'full'): ActualMonth => ({ key, netRevenue: rev, grossMargin: rev == null ? null : rev * 0.5, cm3: null, ebitda, units: rev == null ? null : 90, level, basis: 'normalised' });

test('status: within 5% is on track, below behind, above ahead; EBITDA % is on |plan|', () => {
  assert.equal(statusOf(100, 95).status, 'on_track');
  assert.equal(statusOf(100, 94.9).status, 'behind');
  assert.equal(statusOf(100, 105.1).status, 'ahead');
  assert.equal(statusOf(-100, -90).status, 'ahead'); // smaller loss
  assert.equal(statusOf(-100, -120).status, 'behind');
  assert.equal(statusOf(0, 0).status, 'on_track');
  assert.deepEqual(statusOf(100, null), { gap: null, gapPct: null, status: null });
});

test('months without actuals say no data, never 0; the month in progress is shown but not counted', () => {
  const plan = [row('2026-10', 100, -10), row('2026-11', 100, -10), row('2026-12', 100, -10), row('2027-01', 100, -10)];
  const r = buildPlanVsActual(plan, [act('2026-10', 80, -20), act('2026-12', 110, null)], '2026-12');
  assert.deepEqual(r.months.map((m) => m.state), ['ok', 'nodata', 'running']);
  assert.equal(r.months[1].metrics.revenue.actual, null);
  assert.equal(r.months[1].status, null);
  assert.equal(r.noData, 1);
  assert.equal(r.running, '2026-12');
  assert.equal(r.months[0].status, 'behind');
  assert.equal(r.months[0].metrics.revenue.gap, -20);
  assert.equal(r.months[0].metrics.revenue.gapPct, -0.2);
  assert.equal(r.months.length, 3); // Jan-27 is after the current month
  // YTD counts Oct only
  assert.equal(r.ytd?.months, 1);
  assert.equal(r.ytd?.totals.revenue?.actual, 80);
  assert.equal(r.ytd?.totals.revenue?.plan, 100);
  assert.deepEqual(r.behind.map((b) => `${b.key}:${b.metric}`), ['2026-10:revenue', '2026-10:ebitda']);
});

test('a metric the books cannot give yet is null for that metric only', () => {
  const plan = [row('2026-10', 100, -10)];
  const r = buildPlanVsActual(plan, [{ ...act('2026-10', 100, null, 'contribution'), complete: true }], '2026-11');
  assert.equal(r.months[0].metrics.ebitda.actual, null);
  assert.equal(r.months[0].metrics.ebitda.status, null);
  assert.equal(r.months[0].metrics.revenue.status, 'on_track');
  assert.equal(r.ytd?.totals.ebitda, null);
  assert.equal(r.behind.length, 0);
});

test('behind list is biggest ₹ gap first and only counts closed months', () => {
  const plan = [row('2026-10', 1000, -100), row('2026-11', 1000, -100), row('2026-12', 1000, -100)];
  const r = buildPlanVsActual(plan, [act('2026-10', 900, -100), act('2026-11', 600, -400), act('2026-12', 1, -999)], '2026-12');
  assert.deepEqual(r.behind.map((b) => `${b.key}:${b.metric}`), ['2026-11:revenue', '2026-11:ebitda', '2026-10:revenue']);
});

test('exit ARR pace: last 3 closed months x4, same months of the plan, gap carried to the FY end', () => {
  const plan = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((k, i) => row(k, 100 + i * 10, 0, (100 + i * 10) * 12));
  const r = buildPlanVsActual(plan, [act('2026-10', 90), act('2026-11', 99), act('2026-12', 108)], '2027-01');
  assert.ok(r.arr);
  assert.deepEqual(r.arr!.monthsUsed, ['2026-10', '2026-11', '2026-12']);
  assert.equal(r.arr!.actualArr, 99 * 12);
  assert.equal(r.arr!.planArrSameMonths, 110 * 12);
  assert.ok(Math.abs((r.arr!.ratio ?? 0) - 0.9) < 1e-9);
  assert.equal(r.arr!.planExitArr, 150 * 12);
  assert.ok(Math.abs((r.arr!.projectedExitArr ?? 0) - 135 * 12) < 0.02);
  assert.equal(r.arr!.status, 'behind');
  assert.equal(r.arr!.fyEndLabel, '2027-03');
});

test('no actuals at all: every month is no data, no totals, no pace', () => {
  const r = buildPlanVsActual([row('2026-10', 100, 0), row('2026-11', 100, 0)], [], '2026-11');
  assert.equal(r.noData, 2);
  assert.equal(r.ytd, null);
  assert.equal(r.arr, null);
  const before = buildPlanVsActual([row('2026-10', 100, 0)], [], '2026-09');
  assert.equal(before.months.length, 0);
});

test('Base snapshot equals a fresh run of the engine (re-run scripts/export-base-plan-months.ts when this fails)', () => {
  const p = basePlan();
  const r = runPlan(p);
  assert.equal(BASE_PLAN_START, p.startMonth);
  assert.deepEqual(BASE_PLAN_MONTHS, planMonthsOf(r, p.startMonth, (e) => runRateArr(r, e)));
  assert.equal(BASE_PLAN_MONTHS[0].key, '2026-10');
  assert.equal(BASE_PLAN_MONTHS.length, p.levers.horizon);
});

test('the server copy of the pure module is byte-identical to the client file', () => {
  const a = fs.readFileSync(path.join(here, '../src/planning/planVsActual.ts'), 'utf8');
  const b = fs.readFileSync(path.join(here, '../../client/src/data/planning/planVsActual.ts'), 'utf8');
  assert.equal(a, b);
});

test('cleaning: bad months and non-numbers are dropped, never turned into 0', () => {
  const m = cleanActuals([{ key: '2026-11', netRevenue: 5, ebitda: 'x', level: 'full', basis: 'normalised' }, { key: 'bad' }, null]);
  assert.equal(m?.length, 1);
  assert.equal(m?.[0].ebitda, null);
  assert.equal(m?.[0].netRevenue, 5);
  assert.equal(cleanActuals('nope'), null);
  assert.equal(cleanPlanRows([{ key: '2026-10' }]), null);
  assert.equal(cleanPlanRows(BASE_PLAN_MONTHS)?.length, BASE_PLAN_MONTHS.length);
});

test('composeVsActual says when there are no actuals and when they are old', () => {
  const now = new Date('2026-11-09T06:00:00Z');
  const none = composeVsActual({ id: 'base', name: 'Base' }, BASE_PLAN_MONTHS, null, now);
  assert.equal(none.asOfMonth, '2026-11');
  assert.match(none.limits[0], /No actuals saved yet/);
  assert.equal(none.noData, 2);
  const old = composeVsActual({ id: 'base', name: 'Base' }, BASE_PLAN_MONTHS, { savedAt: '2026-11-01T00:00:00Z', savedBy: null, months: [] }, now);
  assert.match(old.limits[0], /8 days ago/);
});

test('deck months become actuals: normalised, nulls where the books are not that deep, units without accessories', async () => {
  const { actualMonthsFromDeck } = await import('../../client/src/data/planning/planVsActualLive.ts');
  const m = (key: string, rev: number) => ({ key, netRevenue: rev, grossMargin: rev * 0.4, cm1: 0, cm2: 0, cm3: rev * 0.1, ebitda: rev * 0.02, cogm: rev * 0.6 }) as any;
  const deck = {
    months: [m('2026-09', 900), m('2026-10', 1000), m('2026-11', 500)],
    completeness: {
      '2026-09': { level: 'full', hasTally: true },
      '2026-10': { level: 'full', hasTally: true },
      '2026-11': { level: 'topline', hasTally: false },
    },
    skuCells: [
      { m: '2026-10', ch: 'D2C', p: 'hCore X', u: 10, rev: 1, cogs: 1, oth: 0, con: 0 },
      { m: '2026-10', ch: 'D2C', p: 'Accessory (excl)', u: 99, rev: 1, cogs: 0, oth: 0, con: 0 },
      { m: '2026-11', ch: 'D2C', p: 'hCore X', u: 4, rev: 1, cogs: 1, oth: 0, con: 0 },
    ],
  } as any;
  const a = actualMonthsFromDeck(deck, '2026-10');
  assert.deepEqual(a.map((x) => x.key), ['2026-10', '2026-11']);
  assert.equal(a[0].units, 10);
  assert.equal(a[0].ebitda, 20);
  assert.equal(a[1].ebitda, null);
  assert.equal(a[1].grossMargin, null);
  assert.equal(a[1].netRevenue, 500);
  assert.equal(a[1].basis, 'booked'); // topline month: no BOM costing, shown as booked
});

test('a finished month whose books are not complete is shown as partial, never counted (round 10 #4)', () => {
  // Oct half-booked: 7.64 vs plan 19 would read as behind on revenue and "ahead" on EBITDA; Sep is a full close.
  const plan = [row('2026-07', 100, -10, 1200), row('2026-08', 100, -10, 1200), row('2026-09', 100, -10, 1200), row('2026-10', 100, -10, 1200), row('2026-11', 100, -10, 1200)];
  const actuals = [act('2026-07', 90, -12), act('2026-08', 95, -11), act('2026-09', 100, -9), { ...act('2026-10', 40, -2), complete: false }, act('2026-11', 5, null, 'topline')];
  const r = buildPlanVsActual(plan, actuals, '2026-11');
  assert.deepEqual(r.months.map((m) => m.state), ['ok', 'ok', 'ok', 'partial', 'running']);
  assert.deepEqual(r.partial, ['2026-10']);
  assert.equal(r.ytd?.months, 3);
  assert.equal(r.ytd?.totals.revenue?.actual, 285);
  // exit ARR = the last 3 FULL months (Jul–Sep), not Aug–Oct
  assert.deepEqual(r.arr?.monthsUsed, ['2026-07', '2026-08', '2026-09']);
  assert.equal(r.arr?.actualArr, 1140);
  assert.ok(!r.behind.some((b) => b.key === '2026-10'));
  assert.ok(r.notes.some((n) => /2026-10 shown but not counted/.test(n)));
  // without the flag (an older saved snapshot) a month below a full close is partial too
  const r2 = buildPlanVsActual(plan, [act('2026-07', 90, null, 'topline')], '2026-11');
  assert.equal(r2.months[0].state, 'partial');
  assert.equal(r2.ytd, null);
});

test('cleanActuals keeps the complete flag only when it is a boolean', () => {
  const c = cleanActuals([{ key: '2026-10', level: 'full', complete: false, netRevenue: 1 }, { key: '2026-09', level: 'full', complete: 'yes', netRevenue: 2 }]);
  assert.equal(c?.[0].complete, false);
  assert.equal('complete' in (c?.[1] ?? {}), false);
});

test('"All months" subtitle is plain text (no template code), with partial and running months', () => {
  assert.equal(monthsSubtitle({ withData: 5, noData: 1, partial: ['2026-10'], running: '2026-11' }),
    '5 with data · 1 with no data yet · 1 with books not complete (not counted) · this month is not finished');
  const t = monthsSubtitle({ withData: 2, noData: 0, partial: [], running: null });
  assert.equal(t, '2 with data · 0 with no data yet');
  assert.ok(!/[{}$]/.test(t));
});
