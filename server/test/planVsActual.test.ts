import test from 'node:test';
import assert from 'node:assert/strict';
import { cell, cleanRecord, fyOf, planVsActual, type PlanRecord } from '../src/services/planVsActual.js';
import { portalManifest } from '../src/portalManifest.js';

const L = 100_000;
const rec: PlanRecord = { name: 'Pain-care v2', scenarioId: 'abc12345', pinnedAt: '2026-11-01T00:00:00Z', by: 'h', startMonth: '2026-10',
  months: [
    { period: '2026-10', revenue: 50 * L, pat: -10 * L, closingCash: -20 * L },
    { period: '2026-11', revenue: 60 * L, pat: -8 * L, closingCash: -25 * L },
    { period: '2026-12', revenue: 70 * L, pat: -5 * L, closingCash: -28 * L },
  ] };

test('cell verdicts: ±5 % band, cash floor ₹5 L, missing actual', () => {
  assert.equal(cell(100, 104).verdict, 'on_track');
  assert.equal(cell(100, 110).verdict, 'ahead');
  assert.equal(cell(100, 90).verdict, 'behind');
  assert.equal(cell(-10 * L, -12 * L).verdict, 'behind');     // a bigger loss is behind
  assert.equal(cell(-20 * L, -24 * L, 'cash').verdict, 'on_track'); // within ₹5 L
  assert.equal(cell(-20 * L, -26 * L, 'cash').verdict, 'behind');
  assert.equal(cell(100, null).verdict, 'no_data');
  assert.equal(cell(0, 5).gapPct, null);
});

test('only months with Tally sales are judged; FY to date sums', () => {
  const r = planVsActual(rec, [
    { period: '2026-10', sales: 45 * L, nettProfit: -12 * L, netCash: -18 * L },
    { period: '2026-11', sales: 66 * L, nettProfit: -7 * L, netCash: -30 * L },
    { period: '2026-12', sales: null, nettProfit: null, netCash: null },
  ]);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].revenue.verdict, 'behind');
  assert.equal(r.rows[1].revenue.verdict, 'ahead');
  assert.equal(r.ytd!.fy, 'FY27');
  assert.equal(r.ytd!.revenue.plan, 110 * L);
  assert.equal(r.ytd!.revenue.actual, 111 * L);
  assert.equal(r.ytd!.revenue.verdict, 'on_track');
  assert.equal(r.ytd!.profit.actual, -19 * L);
  assert.match(r.line, /FY27 so far: sales on plan \(2 months\)/);
  assert.equal(r.latest!.period, '2026-11');
});

test('behind line names the gap; no record / no books handled', () => {
  const r = planVsActual(rec, [{ period: '2026-10', sales: 40 * L, nettProfit: null, netCash: null }]);
  assert.match(r.line, /sales ₹10\.0 L behind plan \(-20%\)/);
  assert.equal(r.ytd!.profit.verdict, 'no_data');
  const none = planVsActual(null, []);
  assert.equal(none.record, null);
  assert.match(none.notes[0], /Pin as plan of record/);
  assert.equal(planVsActual(rec, []).rows.length, 0);
});

test('fyOf', () => {
  assert.equal(fyOf('2026-03'), 'FY26');
  assert.equal(fyOf('2026-04'), 'FY27');
});

test('cleanRecord validates and rounds', () => {
  const c = cleanRecord({ name: ' P ', startMonth: '2026-10', months: [{ period: '2026-10', revenue: 1.6, pat: -2.4, closingCash: 3, ebitda: 1.2 }] }, 'me', 'now');
  assert.equal(c.name, 'P');
  assert.deepEqual(c.months[0], { period: '2026-10', revenue: 2, pat: -2, closingCash: 3, ebitda: 1 });
  assert.throws(() => cleanRecord({ name: 'x', months: [{ period: '2026-13', revenue: 1, pat: 1, closingCash: 1 }] }, null, 'n'), /YYYY-MM/);
  assert.throws(() => cleanRecord({ name: '', months: [] }, null, 'n'), /name/);
  assert.throws(() => cleanRecord({ name: 'x', months: [{ period: '2026-10', revenue: NaN, pat: 1, closingCash: 1 }] }, null, 'n'));
});

test('manifest exposes mis_get_plan_vs_actual', () => {
  const e = portalManifest.exposes.find((x) => x.id === 'plan-vs-actual') as any;
  assert.equal(e.mcp.tool, 'mis_get_plan_vs_actual');
});
